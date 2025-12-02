import { IntentClassifier } from './IntentClassifier';
import { CapacityEvaluator } from './CapacityEvaluator';
import { getModelBySpecialization } from './ModelCatalog';
import { MODEL_KEYS } from '../models/ModelConstants';
import {
  IntentCategory,
  ExecutionPlan,
  ExecutionStrategy,
  Task,
  RouterError
} from './RouterTypes';
import { kernelCoordinator } from '../kernel';
import { runtimeManager } from '../kernel/RuntimeManager';
import { createLogger } from '../../lib/logger';

const log = createLogger('Router');

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

const DEFAULT_CONFIG: RouterConfig = {
  enablePreloading: true,
  preloadThreshold: 0.8,
  maxPreloadedModels: 2,
  useModelPool: true,
  fallbackToDialogue: true
};

export class Router {
  private intentClassifier: IntentClassifier;
  private capacityEvaluator: CapacityEvaluator;
  private config: RouterConfig;

  // Statistiques et historique
  private routingHistory: RoutingRecord[] = [];
  private readonly MAX_HISTORY_SIZE = 500;
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
      UNKNOWN: 0
    }
  };

  // Cache des patterns d'utilisation pour préchargement intelligent
  private usagePatterns: Map<IntentCategory, number> = new Map();
  private lastPreloadCheck: number = 0;
  private readonly PRELOAD_CHECK_INTERVAL = 60000; // 1 minute

  constructor(config: Partial<RouterConfig> = {}) {
    this.intentClassifier = new IntentClassifier();
    this.capacityEvaluator = new CapacityEvaluator();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialiser les patterns d'utilisation
    for (const category of ['CODE', 'MATH', 'DIALOGUE', 'FACTCHECK', 'UNKNOWN'] as IntentCategory[]) {
      this.usagePatterns.set(category, 0);
    }

    log.info('Router initialisé avec config:', this.config);
  }

  /**
   * Configure le router
   */
  public setConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('Configuration du Router mise à jour:', this.config);
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

      log.info(`Intent classifié: ${classificationResult.intent} (conf: ${classificationResult.confidence}, méthode: ${classificationResult.method})`);

      // Mettre à jour les patterns d'utilisation
      this.updateUsagePatterns(classificationResult.intent);

      // 2. Évaluer la capacité du système
      const capacityMetrics = await this.capacityEvaluator.evaluate();

      log.info(`Capacité système: ${capacityMetrics.overallScore}/10`);

      // 3. Vérifier si le modèle est déjà préchargé
      const targetModelKey = this.getModelKeyForIntent(classificationResult.intent);
      wasPreloaded = this.config.useModelPool && runtimeManager.isModelInPool(targetModelKey);

      if (wasPreloaded) {
        log.info(`Modèle ${targetModelKey} déjà dans le pool - routage optimisé`);
      }

      // 4. Sélectionner les experts
      const { primaryTask, fallbackTasks, downgradedFromIntent, downgradeReason } = await this.selectExperts(
        classificationResult.intent,
        capacityMetrics.overallScore
      );

      if (downgradedFromIntent) {
        usedFallback = true;
      }

      // 5. Déterminer la stratégie d'exécution
      const strategy = this.capacityEvaluator.determineStrategy(
        capacityMetrics.overallScore,
        primaryTask.priority
      );

      // 6. Estimer la durée
      const estimatedDuration = this.estimateDuration(primaryTask, fallbackTasks, strategy, wasPreloaded);

      // 7. Créer le plan
      const plan: ExecutionPlan = {
        primaryTask,
        fallbackTasks,
        strategy,
        capacityScore: capacityMetrics.overallScore,
        estimatedDuration,
        downgradedFromIntent,
        downgradeReason
      };

      // 8. Déclencher le préchargement intelligent si nécessaire
      if (this.config.enablePreloading) {
        this.triggerSmartPreloading(classificationResult.confidence);
      }

      // 9. Enregistrer le routage
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
        log.warn(`Plan dégradé: ${downgradedFromIntent} → ${primaryTask.agentName}. Raison: ${downgradeReason}`);
      }

      log.info(`Plan créé en ${routingTimeMs.toFixed(2)}ms: stratégie ${strategy}, durée estimée ${estimatedDuration}ms`);

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
      log.error('Erreur lors de la création du plan:', err);
      throw err;
    }
  }

  /**
   * Obtient la clé du modèle pour une intention donnée
   */
  private getModelKeyForIntent(intent: IntentCategory): string {
    switch (intent) {
      case 'CODE':
        return MODEL_KEYS.CODE_EXPERT;
      case 'MATH':
        return MODEL_KEYS.MATH_EXPERT;
      case 'FACTCHECK':
      case 'DIALOGUE':
      case 'UNKNOWN':
      default:
        return MODEL_KEYS.GENERAL_DIALOGUE;
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
   * Déclenche le préchargement intelligent basé sur les patterns
   */
  private async triggerSmartPreloading(currentConfidence: number): Promise<void> {
    const now = Date.now();

    // Limiter la fréquence des vérifications
    if (now - this.lastPreloadCheck < this.PRELOAD_CHECK_INTERVAL) {
      return;
    }
    this.lastPreloadCheck = now;

    // Ne précharger que si la confiance est élevée
    if (currentConfidence < this.config.preloadThreshold) {
      return;
    }

    // Trouver les intentions les plus fréquentes
    const sortedPatterns = Array.from(this.usagePatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.config.maxPreloadedModels);

    for (const [intent] of sortedPatterns) {
      const modelKey = this.getModelKeyForIntent(intent);

      // Vérifier si déjà dans le pool
      if (!runtimeManager.isModelInPool(modelKey)) {
        log.info(`Préchargement intelligent: ${modelKey} pour intent ${intent}`);

        // Précharger en arrière-plan (non-bloquant)
        runtimeManager.preloadModel(modelKey).then((success) => {
          if (success) {
            this.stats.preloadsTriggered++;
            log.info(`Préchargement réussi: ${modelKey}`);
          }
        }).catch((err) => {
          log.warn(`Échec du préchargement de ${modelKey}:`, err);
        });
      }
    }
  }

  /**
   * Sélectionne les experts pour une intention donnée
   */
  private async selectExperts(intent: IntentCategory, capacityScore: number): Promise<{
    primaryTask: Task;
    fallbackTasks: Task[];
    downgradedFromIntent?: IntentCategory;
    downgradeReason?: string;
  }> {
    switch (intent) {
      case 'CODE': {
        const codeModel = getModelBySpecialization('code');
        if (!codeModel) {
          throw new RouterError(
            'Aucun modèle de code disponible',
            'Model catalog missing code expert'
          );
        }

        const decision = await kernelCoordinator.canLoadModel(MODEL_KEYS.CODE_EXPERT);
        if (!decision.canLoad) {
          // Vérifier si le modèle est déjà dans le pool RuntimeManager
          if (this.config.useModelPool && runtimeManager.isModelInPool(MODEL_KEYS.CODE_EXPERT)) {
            log.info('Modèle code trouvé dans le pool malgré la décision négative du kernel');
          } else if (this.config.fallbackToDialogue) {
            const fallbackTask: Task = {
              agentName: 'GeneralDialogue',
              modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
              priority: 'HIGH',
              timeout: 20000,
              temperature: 0.7
            };
            this.stats.fallbacksUsed++;
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
            log.info('Modèle math trouvé dans le pool malgré la décision négative du kernel');
          } else if (this.config.fallbackToDialogue) {
            const fallbackTask: Task = {
              agentName: 'CalculatorAgent',
              modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
              priority: 'HIGH',
              timeout: 15000,
              temperature: 0.3
            };
            this.stats.fallbacksUsed++;
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

        const fallbackTasks: Task[] = [{
          agentName: 'CalculatorAgent',
          modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
          priority: 'LOW',
          timeout: 15000,
          temperature: 0.3
        }];

        return { primaryTask, fallbackTasks };
      }

      case 'FACTCHECK': {
        const primaryTask: Task = {
          agentName: 'FactCheckerAgent',
          modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
          priority: 'HIGH',
          timeout: 35000,
          temperature: 0.3
        };

        const fallbackTasks: Task[] = [];

        return { primaryTask, fallbackTasks };
      }

      case 'DIALOGUE':
      case 'UNKNOWN':
      default: {
        const primaryTask: Task = {
          agentName: 'GeneralDialogue',
          modelKey: MODEL_KEYS.GENERAL_DIALOGUE,
          priority: capacityScore >= 7 ? 'HIGH' : 'LOW',
          timeout: 20000,
          temperature: 0.7
        };

        const fallbackTasks: Task[] = [];

        return { primaryTask, fallbackTasks };
      }
    }
  }

  /**
   * Estime la durée d'exécution
   */
  private estimateDuration(
    primaryTask: Task,
    fallbackTasks: Task[],
    strategy: ExecutionStrategy,
    isPreloaded: boolean
  ): number {
    // Réduire l'estimation si le modèle est préchargé
    const preloadFactor = isPreloaded ? 0.7 : 1.0;
    const primaryDuration = primaryTask.timeout * 0.6 * preloadFactor;

    if (fallbackTasks.length === 0) {
      return Math.round(primaryDuration);
    }

    const fallbackDuration = fallbackTasks.reduce((sum, task) => sum + (task.timeout * 0.5), 0);

    if (strategy === 'PARALLEL_LIMITED' || strategy === 'PARALLEL_FULL') {
      return Math.round(Math.max(primaryDuration, fallbackDuration));
    }

    return Math.round(primaryDuration + fallbackDuration);
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
        UNKNOWN: 0
      }
    };
    this.routingHistory = [];
    this.usagePatterns.clear();
    for (const category of ['CODE', 'MATH', 'DIALOGUE', 'FACTCHECK', 'UNKNOWN'] as IntentCategory[]) {
      this.usagePatterns.set(category, 0);
    }
    log.info('Statistiques du Router réinitialisées');
  }

  /**
   * Précharge les modèles les plus utilisés
   */
  public async preloadTopModels(count: number = 2): Promise<{ success: string[]; failed: string[] }> {
    const sortedPatterns = Array.from(this.usagePatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count);

    const success: string[] = [];
    const failed: string[] = [];

    for (const [intent] of sortedPatterns) {
      const modelKey = this.getModelKeyForIntent(intent);

      if (!runtimeManager.isModelInPool(modelKey)) {
        const result = await runtimeManager.preloadModel(modelKey);
        if (result) {
          success.push(modelKey);
          this.stats.preloadsTriggered++;
        } else {
          failed.push(modelKey);
        }
      } else {
        success.push(modelKey); // Déjà dans le pool
      }
    }

    log.info(`Préchargement: ${success.length} succès, ${failed.length} échecs`);
    return { success, failed };
  }

  /**
   * Vérifie la disponibilité d'un modèle pour une intention
   */
  public async checkModelAvailability(intent: IntentCategory): Promise<{
    available: boolean;
    inPool: boolean;
    canLoad: boolean;
    modelKey: string;
  }> {
    const modelKey = this.getModelKeyForIntent(intent);
    const inPool = runtimeManager.isModelInPool(modelKey);
    const decision = await kernelCoordinator.canLoadModel(modelKey);

    return {
      available: inPool || decision.canLoad,
      inPool,
      canLoad: decision.canLoad,
      modelKey
    };
  }

  /**
   * Obtient des recommandations de routage basées sur les patterns
   */
  public getRoutingRecommendations(): {
    suggestedPreloads: string[];
    hotIntents: IntentCategory[];
    avgConfidence: number;
  } {
    // Intentions les plus fréquentes
    const hotIntents = Array.from(this.usagePatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .filter(([_, count]) => count > 5)
      .slice(0, 3)
      .map(([intent]) => intent);

    // Modèles suggérés pour préchargement
    const suggestedPreloads = hotIntents
      .map(intent => this.getModelKeyForIntent(intent))
      .filter(modelKey => !runtimeManager.isModelInPool(modelKey));

    // Confiance moyenne des classifications récentes
    const recentRecords = this.routingHistory.slice(-50);
    const avgConfidence = recentRecords.length > 0
      ? recentRecords.reduce((sum, r) => sum + r.confidence, 0) / recentRecords.length
      : 0;

    return {
      suggestedPreloads,
      hotIntents,
      avgConfidence: Math.round(avgConfidence * 100) / 100
    };
  }
}

// Export singleton
export const router = new Router();
