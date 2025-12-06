import { IntentClassifier } from './IntentClassifier';
import { CapacityEvaluator } from './CapacityEvaluator';
import { catalogManager } from '../kernel/CatalogManager';
import { kernelCoordinator } from '../kernel';
import { runtimeManager } from '../kernel/RuntimeManager';
import { logger } from '../kernel/monitoring/LoggerService'; // ✅ Remplace createLogger
import { performanceTracker } from '../kernel/PerformanceTracker';
import type { 
  IntentCategory, 
  ExecutionPlan, 
  Task, 
  PerformanceMode,
  ExecutionStrategy
} from './RouterTypes';
import { RouterError } from './RouterTypes';

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
  private lastPrewarmedExpert: string | null = null; // Ajout de la propriété

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
   * Préchauffe les plugins en fonction du contexte applicatif de l'utilisateur.
   */
  public async prewarmFromContext(context: string): Promise<void> {
    let expertToPrewarm: string | null = null;

    switch (context) {
      case 'CODING':
        expertToPrewarm = this.selectExpertForIntent('CODE');
        break;
      case 'DASHBOARD':
        // Plus tard, on pourrait préchauffer un expert en analyse de données
        expertToPrewarm = 'math-bitnet-1.58b-mock'; 
        break;
      case 'WRITING':
        // Précharge un modèle plus "profond" pour l'écriture
        expertToPrewarm = 'dialogue-danube2-1.8b-mock';
        break;
    }

    if (expertToPrewarm && expertToPrewarm !== this.lastPrewarmedExpert) {
      logger.info('Router', `Contexte applicatif détecté: ${context}. Préchauffage de ${expertToPrewarm}...`);
      runtimeManager.prewarmModel(expertToPrewarm);
      this.lastPrewarmedExpert = expertToPrewarm;
    }
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
        capacityMetrics.overallScore,
        primaryTask.priority
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
    const hasCodeSnippet = /``/.test(prompt) || /function|class|const/.test(prompt);
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
        const decision = await kernelCoordinator.canLoadModel('code-qwen2.5-coder-1.5b-mock');
        if (!decision.canLoad) {
          if (this.config.fallbackToDialogue) {
            const fallbackTask: Task = {
              agentName: 'GeneralDialogue',
              modelKey: 'dialogue-gemma3-270m-mock',
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
          modelKey: 'code-qwen2.5-coder-1.5b-mock',
          priority: 'HIGH',
          timeout: 30000,
          temperature: 0.2
        };
        
        const fallbackTasks: Task[] = capacityScore >= 6 ? [{
          agentName: 'GeneralDialogue',
          modelKey: 'dialogue-gemma3-270m-mock',
          priority: 'LOW',
          timeout: 20000,
          temperature: 0.7
        }] : [];
        
        return { primaryTask, fallbackTasks };
      }
      
      case 'MATH': {
        const mathModel = catalogManager.getModelSpec('math-bitnet-1.58b-mock');
        if (!mathModel) {
          throw new RouterError(
            'Aucun modèle mathématique disponible',
            'Catalogue dynamique ne contient pas de modèle math'
          );
        }
        
        const decision = await kernelCoordinator.canLoadModel('math-bitnet-1.58b-mock');
        if (!decision.canLoad) {
          if (this.config.useModelPool && runtimeManager.isModelInPool('math-bitnet-1.58b-mock')) {
            log.info('Router', 'Modèle math trouvé dans le pool malgré la décision négative du kernel'); // ✅ Mis à jour
          } else if (this.config.fallbackToDialogue) {
            const fallbackTask: Task = {
              agentName: 'GeneralDialogue',
              modelKey: 'dialogue-gemma3-270m-mock',
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
          modelKey: 'math-bitnet-1.58b-mock',
          priority: 'HIGH',
          timeout: 25000,
          temperature: 0.1
        };
        
        const fallbackTasks: Task[] = capacityScore >= 7 ? [{
          agentName: 'GeneralDialogue',
          modelKey: 'dialogue-gemma3-270m-mock',
          priority: 'LOW',
          timeout: 20000,
          temperature: 0.7
        }] : [];
        
        return { primaryTask, fallbackTasks };
      }
      
      case 'FACTCHECK': {
        const primaryTask: Task = {
          agentName: 'FactCheckExpert',
          modelKey: 'fact-check-expert',
          priority: 'HIGH',
          timeout: 20000,
          temperature: 0.3
        };
        
        const fallbackTasks: Task[] = capacityScore >= 5 ? [{
          agentName: 'GeneralDialogue',
          modelKey: 'dialogue-gemma3-270m-mock',
          priority: 'LOW',
          timeout: 20000,
          temperature: 0.7
        }] : [];
        
        return { primaryTask, fallbackTasks };
      }
      
      default: { // DIALOGUE ou UNKNOWN
        const primaryTask: Task = {
          agentName: 'GeneralDialogue',
          modelKey: 'dialogue-gemma3-270m-mock',
          priority: 'MEDIUM',
          timeout: 20000,
          temperature: 0.7
        };
        
        // Pour le dialogue, on peut ajouter un expert secondaire si la capacité est suffisante
        const fallbackTasks: Task[] = capacityScore >= 8 ? [{
          agentName: 'DeepThinkExpert',
          modelKey: 'dialogue-danube2-1.8b-mock',
          priority: 'LOW',
          timeout: 30000,
          temperature: 0.9
        }] : [];
        
        return { primaryTask, fallbackTasks };
      }
    }
  }
  
  /**
   * Sélectionne l'expert approprié pour une intention donnée.
   */
  private selectExpertForIntent(intent: string): string {
    switch (intent) {
      case 'CODE':
        return 'code-qwen2.5-coder-1.5b-mock';
      case 'MATH':
        return 'math-bitnet-1.58b-mock';
      case 'FACTCHECK':
        return 'fact-check-expert';
      default:
        return 'dialogue-gemma3-270m-mock';
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
      case 'CODE': return 'code-qwen2.5-coder-1.5b-mock';
      case 'MATH': return 'math-bitnet-1.58b-mock';
      case 'FACTCHECK': return 'fact-check-expert';
      default: return 'dialogue-gemma3-270m-mock';
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
   * Prédit l'intention en temps réel pendant que l'utilisateur tape
   */
  public async predictIntent(text: string): Promise<void> {
    if (text.length < 5) return; // Ne pas prédire pour de très courts textes
    
    try {
      // Classifier l'intention en temps réel
      const classificationResult = await this.intentClassifier.classify(text);
      
      log.info('Router', `Prédiction d'intention en temps réel: ${classificationResult.intent} (conf: ${classificationResult.confidence})`, {
        intent: classificationResult.intent,
        confidence: classificationResult.confidence
      });
      
      // Si la confiance est suffisante, préchauffer le modèle approprié
      if (classificationResult.confidence > this.config.preloadThreshold) {
        const modelKey = this.getModelKeyForIntent(classificationResult.intent);
        
        // Vérifier si le modèle est déjà préchargé
        if (!runtimeManager.isModelInPool(modelKey)) {
          log.info('Router', `Préchauffage spéculatif du modèle: ${modelKey}`);
          runtimeManager.prewarmModel(modelKey);
          this.stats.preloadsTriggered++;
        }
      }
    } catch (error: unknown) {
      // Silencieux en cas d'erreur de prédiction - ne pas perturber l'utilisateur
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.debug('Router', 'Erreur lors de la prédiction d\'intention:', { error: errorMessage });
    }
  }
}

export const router = new Router();