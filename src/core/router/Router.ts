import { IntentClassifier } from './IntentClassifier';
import { CapacityEvaluator } from './CapacityEvaluator';
import { getModelBySpecialization } from './ModelCatalog';
import { MODEL_KEYS } from '../models/ModelConstants';
import {
  IntentCategory,
  ExecutionPlan,
  ExecutionStrategy,
  Task,
  RouterError,
  PerformanceMode
} from './RouterTypes';
import { kernelCoordinator } from '../kernel';
import { runtimeManager } from '../kernel/RuntimeManager';
import { logger } from '../kernel/monitoring/LoggerService'; // ✅ Remplace createLogger
import { performanceTracker } from '../kernel/PerformanceTracker';

// const log = createLogger('Router'); // ✅ Supprimé
const log = logger; // ✅ Nouveau

/**
 * Configuration du Router
 */
export interface RouterConfig {
  enablePreloading: boolean;
  preloadThreshold: number; // Score de confiance minimum pour précharger
  maxPreloadedModels: number;
  useModelPool: boolean;
  fallbackToDialogue: boolean;
}

/**
 * Statistiques du Router
 */
export interface RouterStats {
  totalRoutes: number;
  successfulRoutes: number;
  failedRoutes: number;
  averageRoutingTime: number;
  preloadsTriggered: number;
  fallbacksUsed: number;
  intentDistribution: Record<IntentCategory, number>;
}

/**
 * Historique des routages pour l'apprentissage
 */
interface RoutingRecord {
  timestamp: number;
  query: string;
  intent: IntentCategory;
  confidence: number;
  modelKey: string;
  routingTimeMs: number;
  success: boolean;
  usedFallback: boolean;
  wasPreloaded: boolean;
}

interface DeviceStatus {
  battery?: {
    level: number;
    isCharging: boolean;
  };
  memory?: {
    usageRatio: number;
  };
}

const DEFAULT_CONFIG: RouterConfig = {
  enablePreloading: true,
  preloadThreshold: 0.8,
  maxPreloadedModels: 3,
  useModelPool: true,
  fallbackToDialogue: true,
};

export class Router {
  private intentClassifier: IntentClassifier;
  private capacityEvaluator: CapacityEvaluator;
  private config: RouterConfig;
  
  // Statistiques et historique
  private stats: RouterStats = {
    totalRoutes: 0,
    successfulRoutes: 0,
    failedRoutes: 0,
    averageRoutingTime: 0,
    preloadsTriggered: 0,
    fallbacksUsed: 0,
    intentDistribution: {
      CODE: 0,
      MATH: 0,
      DIALOGUE: 0,
      FACTCHECK: 0,
      UNKNOWN: 0,
    },
  };
  
  private routingHistory: RoutingRecord[] = [];
  private readonly MAX_HISTORY_SIZE = 1000;
  
  // Patterns d'utilisation pour l'apprentissage
  private usagePatterns: Map<IntentCategory, number> = new Map();
  
  constructor(config: Partial<RouterConfig> = {}) {
    this.intentClassifier = new IntentClassifier();
    this.capacityEvaluator = new CapacityEvaluator();
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialiser les patterns d'utilisation
    for (const category of ['CODE', 'MATH', 'DIALOGUE', 'FACTCHECK', 'UNKNOWN'] as IntentCategory[]) {
      this.usagePatterns.set(category, 0);
    }
    
    log.info('Router', 'Router initialisé avec config:', this.config); // ✅ Mis à jour
  }
  
  /**
   * Configure le router
   */
  public setConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('Router', 'Configuration du Router mise à jour:', this.config); // ✅ Mis à jour
  }
  
  /**
   * Crée un plan d'exécution intelligent
   */
  public async createPlan(userQuery: string): Promise<ExecutionPlan> {
    const startTime = performance.now();
    let usedFallback = false;
    let wasPreloaded = false;
    
    try {
      // 1. Classifier l'intention
      const classificationResult = await this.intentClassifier.classify(userQuery);
      
      log.info('Router', `Intent classifié: ${classificationResult.intent} (conf: ${classificationResult.confidence}, méthode: ${classificationResult.method})`, { // ✅ Mis à jour
        intent: classificationResult.intent,
        confidence: classificationResult.confidence,
        method: classificationResult.method
      });
      
      // Mettre à jour les patterns d'utilisation
      this.updateUsagePatterns(classificationResult.intent);
      
      // 2. Évaluer la complexité de la tâche pour déterminer le mode de performance
      const complexityAnalysis = this.assessComplexity(userQuery);
      const deviceStatus: DeviceStatus = await this.getDeviceStatus();
      const performanceMode = this.selectPerformanceMode(complexityAnalysis.level, deviceStatus);
      
      log.info('Router', `Complexité: ${complexityAnalysis.level} (score: ${complexityAnalysis.score.toFixed(2)})`, complexityAnalysis.factors);
      log.info('Router', `Mode de performance: ${performanceMode}`);

      // 3. Évaluer la capacité du système
      const capacityMetrics = await this.capacityEvaluator.evaluate();
      
      log.info('Router', `Capacité système: ${capacityMetrics.overallScore}/10`, { // ✅ Mis à jour
        score: capacityMetrics.overallScore
      });
      
      // 4. Vérifier si le modèle est déjà préchargé
      const targetModelKey = this.getModelKeyForIntent(classificationResult.intent);
      wasPreloaded = this.config.useModelPool && runtimeManager.isModelInPool(targetModelKey);
      
      if (wasPreloaded) {
        log.info('Router', `Modèle ${targetModelKey} déjà dans le pool - routage optimisé`); // ✅ Mis à jour
      }
      
      // 5. Sélectionner les experts
      const { primaryTask, fallbackTasks, downgradedFromIntent, downgradeReason } = await this.selectExperts(
        classificationResult.intent,
        capacityMetrics.overallScore
      );
      
      // Ajouter le mode de performance aux tâches
      if (primaryTask) {
        primaryTask.performanceMode = performanceMode;
      }
      
      if (fallbackTasks) {
        fallbackTasks.forEach(task => {
          if (task) {
            task.performanceMode = performanceMode;
          }
        });
      }
      
      if (downgradedFromIntent) {
        usedFallback = true;
      }
      
      // 6. Déterminer la stratégie d'exécution
      const strategy = this.capacityEvaluator.determineStrategy(
        capacityMetrics,
        primaryTask,
        fallbackTasks
      );
      
      // 7. Estimer la durée
      const estimatedDuration = this.estimateDuration(strategy, primaryTask, fallbackTasks);
      
      const plan: ExecutionPlan = {
        primaryTask,
        fallbackTasks,
        strategy,
        capacityScore: capacityMetrics.overallScore,
        estimatedDuration,
        downgradedFromIntent: downgradedFromIntent,
        downgradeReason: downgradeReason
      };
      
      // Enregistrer le succès
      const routingTimeMs = performance.now() - startTime;
      this.recordRouting({
        timestamp: Date.now(),
        query: userQuery,
        intent: classificationResult.intent,
        confidence: classificationResult.confidence,
        modelKey: primaryTask.modelKey,
        routingTimeMs,
        success: true,
        usedFallback,
        wasPreloaded
      });
      
      if (downgradedFromIntent) {
        log.warn('Router', `Plan dégradé: ${downgradedFromIntent} → ${primaryTask.agentName}. Raison: ${downgradeReason}`, { // ✅ Mis à jour
          from: downgradedFromIntent,
          to: primaryTask.agentName,
          reason: downgradeReason
        });
      }
      
      log.info('Router', `Plan créé en ${routingTimeMs.toFixed(2)}ms: stratégie ${strategy}, durée estimée ${estimatedDuration}ms`, { // ✅ Mis à jour
        strategy,
        duration: estimatedDuration,
        timeTaken: routingTimeMs
      });
      
      return plan;
      
    } catch (error) {
      const routingTimeMs = performance.now() - startTime;
      
      // Enregistrer l'échec
      this.recordRouting({
        timestamp: Date.now(),
        query: userQuery,
        intent: 'UNKNOWN',
        confidence: 0,
        modelKey: 'unknown',
        routingTimeMs,
        success: false,
        usedFallback: false,
        wasPreloaded: false
      });
      
      this.stats.failedRoutes++;
      
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Router', 'Erreur lors de la création du plan:', err, { // ✅ Mis à jour
        error: err.message
      });
      throw err;
    }
  }
  
  /**
   * Évaluation de complexité multi-factorielle.
   */
  public assessComplexity(prompt: string): { 
    level: 'LOW' | 'MEDIUM' | 'HIGH',
    score: number,
    factors: Record<string, number>
  } {
    const factors = {
      length: this.scoreLength(prompt),
      taskType: this.scoreTaskType(prompt),
      specificity: this.scoreSpecificity(prompt),
      reasoning: this.scoreReasoningRequired(prompt),
      constraints: this.scoreConstraints(prompt)
    };

    // Pondération
    const weights = {
      length: 0.1,
      taskType: 0.3,
      specificity: 0.2,
      reasoning: 0.3,
      constraints: 0.1
    };

    const score = Object.entries(factors).reduce(
      (sum, [key, value]) => sum + value * weights[key as keyof typeof weights],
      0
    );

    let level: 'LOW' | 'MEDIUM' | 'HIGH';
    if (score > 0.7) level = 'HIGH';
    else if (score > 0.4) level = 'MEDIUM';
    else level = 'LOW';

    return { level, score, factors };
  }

  private scoreLength(prompt: string): number {
    // 0-1 basé sur la longueur
    const words = prompt.split(/\s+/).length;
    if (words < 20) return 0.2;
    if (words < 50) return 0.5;
    if (words < 100) return 0.7;
    return 1.0;
  }

  private scoreTaskType(prompt: string): number {
    const taskPatterns = {
      // Tâches complexes (1.0)
      'debug': 0.9,
      'optimize': 0.9,
      'refactor': 0.8,
      'solve': 0.8,
      'prove': 0.9,
      'analyze': 0.7,
      'compare': 0.6,
      
      // Tâches moyennes (0.5)
      'explain': 0.4,
      'summarize': 0.3,
      'translate': 0.3,
      
      // Tâches simples (0.2)
      'list': 0.2,
      'what is': 0.1,
      'define': 0.1
    };

    const lower = prompt.toLowerCase();
    for (const [pattern, score] of Object.entries(taskPatterns)) {
      if (lower.includes(pattern)) {
        return score;
      }
    }

    return 0.5; // Défaut
  }

  private scoreReasoningRequired(prompt: string): number {
    const reasoningIndicators = [
      'pourquoi', 'why', 'how does', 'comment fonctionne',
      'étape par étape', 'step by step', 'raisonne', 'think through',
      'algorithme', 'logique', 'preuve', 'démonstration'
    ];

    const lower = prompt.toLowerCase();
    const matches = reasoningIndicators.filter(indicator => 
      lower.includes(indicator)
    ).length;

    return Math.min(matches * 0.3, 1.0);
  }

  private scoreSpecificity(prompt: string): number {
    // Plus c'est spécifique, plus c'est complexe
    const hasNumbers = /\d+/.test(prompt);
    const hasCodeSnippet = /```/.test(prompt) || /function|class|const/.test(prompt);
    const hasTechnicalTerms = /[A-Z]{2,}/.test(prompt); // Acronymes (API, CPU, etc.)
    const hasConstraints = /doit|must|should|ne.*pas/.test(prompt.toLowerCase());

    let score = 0;
    if (hasNumbers) score += 0.2;
    if (hasCodeSnippet) score += 0.4;
    if (hasTechnicalTerms) score += 0.2;
    if (hasConstraints) score += 0.2;

    return Math.min(score, 1.0);
  }

  private scoreConstraints(prompt: string): number {
    const constraintKeywords = [
      'sans utiliser', 'without using', 'en moins de', 'in under',
      'optimisé', 'optimized', 'performant', 'efficient',
      'sécurisé', 'secure', 'robuste', 'production-ready'
    ];

    const lower = prompt.toLowerCase();
    const matches = constraintKeywords.filter(kw => lower.includes(kw)).length;

    return Math.min(matches * 0.3, 1.0);
  }

  private async getDeviceStatus(): Promise<DeviceStatus> {
    // Simulation de l'état du device
    // Dans une implémentation réelle, cela utiliserait des APIs système
    try {
      const resourceStatus = await runtimeManager.getStatus();
      return {
        battery: {
          level: 0.8, // 80%
          isCharging: true
        },
        memory: {
          usageRatio: resourceStatus.memoryUsage || 0.3 // 30%
        }
      };
    } catch {
      // Valeurs par défaut si l'obtention du statut échoue
      return {
        battery: {
          level: 0.8, // 80%
          isCharging: true
        },
        memory: {
          usageRatio: 0.3 // 30%
        }
      };
    }
  }

  private selectPerformanceMode(
    complexityLevel: 'LOW' | 'MEDIUM' | 'HIGH',
    deviceStatus: DeviceStatus
  ): PerformanceMode {
    // Facteurs de décision
    const isBatteryLow = deviceStatus.battery?.level !== undefined && deviceStatus.battery?.level < 0.2;
    const isCharging = deviceStatus.battery?.isCharging === true;
    const hasHighMemory = deviceStatus.memory?.usageRatio !== undefined && deviceStatus.memory?.usageRatio < 0.5;

    // Matrice de décision
    if (complexityLevel === 'LOW') {
      if (isBatteryLow && !isCharging) return 'ECO';
      return 'BALANCED';
    }

    if (complexityLevel === 'MEDIUM') {
      if (isBatteryLow) return 'BALANCED';
      if (isCharging && hasHighMemory) return 'PERFORMANCE';
      return 'BALANCED';
    }

    // HIGH complexity
    if (isBatteryLow && !isCharging) {
      log.warn('Router', 'Tâche complexe avec batterie faible, mode BALANCED forcé');
      return 'BALANCED';
    }

    if (isCharging && hasHighMemory) return 'MAXIMUM';
    return 'PERFORMANCE';
  }
  
  /**
   * Sélectionne les experts en fonction de l'intention
   */
  private async selectExperts(
    intent: IntentCategory,
    capacityScore: number
  ): Promise<{
    primaryTask: Task;
    fallbackTasks: Task[];
    downgradedFromIntent?: IntentCategory;
    downgradeReason?: string;
  }> {
    // Implémentation existante...
    // Pour des raisons de brièveté, je ne montre que les parties modifiées
    
    switch (intent) {
      case 'CODE': {
        // Vérifier si le modèle code peut être chargé
        const decision = await kernelCoordinator.canLoadModel(MODEL_KEYS.CODE_EXPERT);
        if (!decision.canLoad) {
          if (this.config.fallbackToDialogue) {
            const fallbackTask: Task = {
              agentName: 'GeneralDialogue',
              modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
              priority: 'LOW',
              timeout: 20000,
              temperature: 0.7
            };
            
            return {
              primaryTask: fallbackTask,
              fallbackTasks: [],
              downgradedFromIntent: 'CODE',
              downgradeReason: decision.reason || 'Modèle code spécialisé non chargeable'
            };
          }
        }
        
        const primaryTask: Task = {
          agentName: 'CodeExpert',
          modelKey: MODEL_KEYS.CODE_EXPERT,
          priority: 'HIGH',
          timeout: 30000,
          temperature: 0.2
        };
        
        const fallbackTasks: Task[] = capacityScore >= 6 ? [{
          agentName: 'GeneralDialogue',
          modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
          priority: 'LOW',
          timeout: 20000,
          temperature: 0.7
        }] : [];
        
        return { primaryTask, fallbackTasks };
      }
      
      case 'MATH': {
        const mathModel = getModelBySpecialization('math');
        if (!mathModel) {
          throw new RouterError(
            'Aucun modèle mathématique disponible',
            'Model catalog missing math expert'
          );
        }
        
        const decision = await kernelCoordinator.canLoadModel(MODEL_KEYS.MATH_EXPERT);
        if (!decision.canLoad) {
          if (this.config.useModelPool && runtimeManager.isModelInPool(MODEL_KEYS.MATH_EXPERT)) {
            log.info('Router', 'Modèle math trouvé dans le pool malgré la décision négative du kernel'); // ✅ Mis à jour
          } else if (this.config.fallbackToDialogue) {
            const fallbackTask: Task = {
              agentName: 'GeneralDialogue',
              modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
              priority: 'LOW',
              timeout: 20000,
              temperature: 0.7
            };
            
            return {
              primaryTask: fallbackTask,
              fallbackTasks: [],
              downgradedFromIntent: 'MATH',
              downgradeReason: decision.reason || 'Modèle math spécialisé non chargeable'
            };
          }
        }
        
        const primaryTask: Task = {
          agentName: 'MathExpert',
          modelKey: MODEL_KEYS.MATH_EXPERT,
          priority: 'HIGH',
          timeout: 25000,
          temperature: 0.1
        };
        
        const fallbackTasks: Task[] = capacityScore >= 7 ? [{
          agentName: 'GeneralDialogue',
          modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
          priority: 'LOW',
          timeout: 20000,
          temperature: 0.7
        }] : [];
        
        return { primaryTask, fallbackTasks };
      }
      
      case 'FACTCHECK': {
        const primaryTask: Task = {
          agentName: 'FactCheckExpert',
          modelKey: MODEL_KEYS.FACT_CHECK_EXPERT,
          priority: 'HIGH',
          timeout: 20000,
          temperature: 0.3
        };
        
        const fallbackTasks: Task[] = capacityScore >= 5 ? [{
          agentName: 'GeneralDialogue',
          modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
          priority: 'LOW',
          timeout: 20000,
          temperature: 0.7
        }] : [];
        
        return { primaryTask, fallbackTasks };
      }
      
      default: { // DIALOGUE ou UNKNOWN
        const primaryTask: Task = {
          agentName: 'GeneralDialogue',
          modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
          priority: 'MEDIUM',
          timeout: 20000,
          temperature: 0.7
        };
        
        // Pour le dialogue, on peut ajouter un expert secondaire si la capacité est suffisante
        const fallbackTasks: Task[] = capacityScore >= 8 ? [{
          agentName: 'DeepThinkExpert',
          modelKey: MODEL_KEYS.DEEP_THINK_EXPERT,
          priority: 'LOW',
          timeout: 30000,
          temperature: 0.9
        }] : [];
        
        return { primaryTask, fallbackTasks };
      }
    }
  }
  
  /**
   * Met à jour les patterns d'utilisation
   */
  private updateUsagePatterns(intent: IntentCategory): void {
    const current = this.usagePatterns.get(intent) || 0;
    this.usagePatterns.set(intent, current + 1);
    this.stats.intentDistribution[intent]++;
  }
  
  /**
   * Obtient la clé du modèle pour une intention
   */
  private getModelKeyForIntent(intent: IntentCategory): string {
    switch (intent) {
      case 'CODE': return MODEL_KEYS.CODE_EXPERT;
      case 'MATH': return MODEL_KEYS.MATH_EXPERT;
      case 'FACTCHECK': return MODEL_KEYS.FACT_CHECK_EXPERT;
      default: return MODEL_KEYS.GENERAL_DIALOGUE;
    }
  }
  
  /**
   * Estime la durée d'exécution
   */
  private estimateDuration(
    strategy: ExecutionStrategy,
    primaryTask: Task,
    fallbackTasks: Task[]
  ): number {
    // Estimation basée sur les timeouts et la stratégie
    const primaryDuration = primaryTask.timeout || 20000;
    const fallbackDuration = fallbackTasks.reduce((sum, task) => sum + (task.timeout || 20000), 0);
    
    if (strategy === 'SERIAL') {
      return Math.round(primaryDuration + fallbackDuration);
    }
    
    return Math.round(Math.max(primaryDuration, fallbackDuration));
  }
  
  /**
   * Enregistre un routage dans l'historique
   */
  private recordRouting(record: RoutingRecord): void {
    this.routingHistory.push(record);
    
    // Limiter la taille de l'historique
    if (this.routingHistory.length > this.MAX_HISTORY_SIZE) {
      this.routingHistory = this.routingHistory.slice(-this.MAX_HISTORY_SIZE);
    }
    
    // Mettre à jour les statistiques
    this.stats.totalRoutes++;
    if (record.success) {
      this.stats.successfulRoutes++;
    }
    
    // Recalculer la moyenne du temps de routage
    const totalTime = this.routingHistory.reduce((sum, r) => sum + r.routingTimeMs, 0);
    this.stats.averageRoutingTime = totalTime / this.routingHistory.length;
  }
  
  /**
   * Obtient les statistiques du Router
   */
  public getStats(): RouterStats {
    return { ...this.stats };
  }
  
  /**
   * Obtient l'historique des routages
   */
  public getRoutingHistory(limit: number = 50): RoutingRecord[] {
    return this.routingHistory.slice(-limit);
  }
  
  /**
   * Obtient les patterns d'utilisation
   */
  public getUsagePatterns(): Map<IntentCategory, number> {
    return new Map(this.usagePatterns);
  }
  
  /**
   * Réinitialise les statistiques
   */
  public resetStats(): void {
    this.stats = {
      totalRoutes: 0,
      successfulRoutes: 0,
      failedRoutes: 0,
      averageRoutingTime: 0,
      preloadsTriggered: 0,
      fallbacksUsed: 0,
      intentDistribution: {
        CODE: 0,
        MATH: 0,
        DIALOGUE: 0,
        FACTCHECK: 0,
        UNKNOWN: 0,
      },
    };
    this.routingHistory = [];
  }
  
  /**
   * Exposition de l'évaluation de complexité pour l'UI
   */
  public getLastComplexityAssessment(): { 
    level: 'LOW' | 'MEDIUM' | 'HIGH',
    score: number,
    factors: Record<string, number>
  } {
    // Cette méthode serait appelée après createPlan pour obtenir l'évaluation
    // Pour l'instant, on retourne une valeur par défaut
    return {
      level: 'MEDIUM',
      score: 0.5,
      factors: {}
    };
  }
}

export const router = new Router();