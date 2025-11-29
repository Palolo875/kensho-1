/**
 * KernelCoordinator - Orchestrateur Principal du Noyau Kensho
 *
 * Responsable de:
 * - Initialisation coordonnée de tous les sous-systèmes
 * - Gestion des événements système (mémoire, batterie, réseau)
 * - Décisions de chargement de modèles
 * - Coordination entre ModelManager et RuntimeManager
 */

import { modelManager, type DownloadCallback, type ModelType } from './ModelManager';
import { runtimeManager } from './RuntimeManager';
import { resourceManager } from './ResourceManager';
import { storageManager } from './StorageManager';
import { MODEL_CATALOG } from './ModelCatalog';
import { ROUTER_MODEL_CATALOG } from '../router/ModelCatalog';
import { ModelLoadDecision, DeviceStatus } from './KernelTypes';
import { createLogger } from '../../lib/logger';

const log = createLogger('KernelCoordinator');

log.info('Initialisation du KernelCoordinator...');

/**
 * Rapport de progression pour l'initialisation
 */
export interface InitProgressReport {
  phase: 'checking' | 'downloading' | 'loading' | 'compiling' | 'ready' | 'error';
  progress: number;
  text: string;
  modelId?: string;
}

/**
 * Configuration du KernelCoordinator
 */
export interface KernelConfig {
  autoInitRuntime: boolean;
  defaultBackend: 'auto' | 'webllm' | 'transformers' | 'mock';
  enableResourceMonitoring: boolean;
  memoryThresholdMB: number;
  enableStoragePersistence: boolean;
}

/**
 * État du Kernel
 */
export interface KernelStatus {
  isInitialized: boolean;
  currentModelKey: string | null;
  runtimeReady: boolean;
  storageReady: boolean;
  gpuAvailable: boolean;
  memoryUsage: number;
  lastError: string | null;
}

const DEFAULT_CONFIG: KernelConfig = {
  autoInitRuntime: true,
  defaultBackend: 'auto',
  enableResourceMonitoring: true,
  memoryThresholdMB: 500,
  enableStoragePersistence: true,
};

class KernelCoordinator {
  private isInitialized = false;
  private currentModelKey: string | null = null;
  private config: KernelConfig;
  private lastError: string | null = null;
  private eventHandlersRegistered = false;

  constructor(config: Partial<KernelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Configure le coordinateur
   */
  public setConfig(config: Partial<KernelConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('Configuration mise à jour:', this.config);
  }

  /**
   * Initialise le noyau Kensho
   */
  public async init(
    defaultModelKey: string = 'mock',
    progressCallback?: (report: InitProgressReport) => void
  ): Promise<void> {
    if (this.isInitialized) {
      log.warn('Déjà initialisé, ignoré.');
      return;
    }

    try {
      log.info('Démarrage du noyau Kensho...');

      // Phase 1: Vérification des ressources
      progressCallback?.({
        phase: 'checking',
        progress: 0.1,
        text: 'Vérification des ressources système...',
      });

      const status = await resourceManager.getStatus();

      if (status.memory.jsHeapUsed > this.config.memoryThresholdMB) {
        throw new Error(
          `Mémoire insuffisante pour démarrer Kensho (${status.memory.jsHeapUsed}MB > ${this.config.memoryThresholdMB}MB)`
        );
      }

      // Phase 2: Enregistrement des gestionnaires d'événements
      if (this.config.enableResourceMonitoring && !this.eventHandlersRegistered) {
        this.registerEventHandlers();
        this.eventHandlersRegistered = true;
      }

      // Phase 3: Initialisation du stockage
      progressCallback?.({
        phase: 'checking',
        progress: 0.2,
        text: 'Initialisation du stockage...',
      });

      if (this.config.enableStoragePersistence) {
        const storageReady = await storageManager.ensureReady();
        if (storageReady) {
          log.info('Stockage OPFS initialisé');
        } else {
          log.warn('Stockage OPFS non disponible, utilisation de fallback');
        }
      }

      // Phase 4: Initialisation du RuntimeManager
      if (this.config.autoInitRuntime) {
        progressCallback?.({
          phase: 'loading',
          progress: 0.3,
          text: 'Détection des capacités GPU...',
        });

        const gpuAvailable = await runtimeManager.detectWebGPU();
        log.info(`GPU disponible: ${gpuAvailable}`);
      }

      // Phase 5: Chargement du modèle par défaut
      if (defaultModelKey !== 'mock' && defaultModelKey !== 'none') {
        await this.loadModel(defaultModelKey, (downloadProgress) => {
          progressCallback?.({
            phase: 'downloading',
            progress: 0.3 + downloadProgress.percent * 0.006, // 0.3 à 0.9
            text: `Téléchargement: ${downloadProgress.percent}%`,
            modelId: defaultModelKey,
          });
        });
      } else if (defaultModelKey === 'mock') {
        // Mode simulation
        await modelManager.initMockMode();
        this.currentModelKey = 'mock';
        log.info('Mode simulation activé');
      }

      // Phase 6: Finalisation
      progressCallback?.({
        phase: 'ready',
        progress: 1.0,
        text: 'Kensho prêt!',
      });

      this.isInitialized = true;
      this.lastError = null;
      log.info('Kensho kernel opérationnel');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastError = errorMessage;

      progressCallback?.({
        phase: 'error',
        progress: 0,
        text: `Erreur: ${errorMessage}`,
      });

      log.error("Échec de l'initialisation:", error as Error);
      throw error;
    }
  }

  /**
   * Charge un modèle spécifique
   */
  public async loadModel(modelKey: string, onProgress?: DownloadCallback): Promise<void> {
    log.info(`Chargement du modèle: ${modelKey}`);

    // Vérifier si c'est un modèle ModelManager (gpt2, mock)
    if (modelKey === 'gpt2' || modelKey === 'mock') {
      if (modelKey === 'mock') {
        await modelManager.initMockMode();
      } else {
        await modelManager.downloadAndInitQwen3(onProgress);
      }
      this.currentModelKey = modelKey;
      return;
    }

    // Sinon, c'est un modèle RuntimeManager (webllm, transformers)
    const success = await runtimeManager.initializeAuto(modelKey, (progress) => {
      onProgress?.({
        percent: Math.round(progress.progress * 100),
        speed: 0,
        timeRemaining: 0,
        loaded: 0,
        total: 0,
        file: progress.text,
      });
    });

    if (!success) {
      throw new Error(`Échec du chargement du modèle: ${modelKey}`);
    }

    this.currentModelKey = modelKey;
  }

  /**
   * Enregistre les gestionnaires d'événements système
   */
  private registerEventHandlers(): void {
    resourceManager.on('memory-critical', async (status: DeviceStatus) => {
      log.warn('Mémoire critique détectée:', {
        usageRatio: status.memory.usageRatio,
        jsHeapUsed: status.memory.jsHeapUsed,
        trend: status.memory.trend,
      });

      // Libérer le cache si possible
      storageManager.clearCache();
    });

    resourceManager.on('battery-low', async (status: DeviceStatus) => {
      log.warn('Batterie faible détectée:', {
        level: status.battery?.level,
        isCharging: status.battery?.isCharging,
      });
    });

    resourceManager.on('network-offline', async () => {
      log.warn('Perte de connexion réseau');
    });

    resourceManager.on('network-online', async () => {
      log.info('Connexion réseau rétablie');
    });

    log.info('Gestionnaires d\'événements enregistrés');
  }

  /**
   * Vérifie si un modèle peut être chargé
   */
  public async canLoadModel(modelKey: string, allowOfflineSwitch = true): Promise<ModelLoadDecision> {
    const status = await resourceManager.getStatus();

    // Vérifier dans les deux catalogues
    const modelMeta = MODEL_CATALOG[modelKey] || ROUTER_MODEL_CATALOG[modelKey];

    if (!modelMeta) {
      return {
        canLoad: false,
        reason: `Modèle inconnu: ${modelKey}`,
      };
    }

    // Vérifier si déjà chargé
    const currentModel = this.getCurrentModel();
    if (currentModel === modelKey) {
      return { canLoad: true };
    }

    // Vérifier si dans le pool du RuntimeManager
    if (runtimeManager.isModelInPool(modelKey)) {
      return { canLoad: true };
    }

    // Vérification mémoire
    if (status.memory.usageRatio > 0.8) {
      return {
        canLoad: false,
        reason: 'Mémoire saturée (>80%)',
      };
    }

    // Vérification batterie
    if (status.battery && status.battery.level < 0.15 && !status.battery.isCharging) {
      return {
        canLoad: false,
        reason: 'Batterie critique (<15%)',
      };
    }

    // Vérification réseau
    if (!status.network.isOnline) {
      if (allowOfflineSwitch) {
        log.info('Mode hors ligne - Tentative de switch vers modèle possiblement en cache');
        return { canLoad: true };
      }
      return {
        canLoad: false,
        reason: 'Aucune connexion réseau',
      };
    }

    // Vérification vitesse réseau
    if (status.network.effectiveType === 'slow-2g' || status.network.effectiveType === '2g') {
      return {
        canLoad: false,
        reason: 'Réseau trop lent pour télécharger un modèle',
      };
    }

    // Vérification mode économie d'énergie
    if (status.powerSaveMode) {
      return {
        canLoad: false,
        reason: "Mode économie d'énergie actif",
      };
    }

    return { canLoad: true };
  }

  /**
   * Change de modèle
   */
  public async switchModel(modelKey: string): Promise<void> {
    const decision = await this.canLoadModel(modelKey);
    if (!decision.canLoad) {
      throw new Error(`Cannot load model: ${decision.reason}`);
    }

    // Pour les modèles ModelManager
    if (modelKey === 'gpt2' || modelKey === 'mock') {
      await modelManager.switchToModel(modelKey as ModelType);
      this.currentModelKey = modelKey;
      return;
    }

    // Pour les modèles RuntimeManager
    const success = await runtimeManager.switchModel(modelKey);
    if (!success) {
      throw new Error(`Échec du switch vers le modèle: ${modelKey}`);
    }
    this.currentModelKey = modelKey;
  }

  /**
   * Obtient le modèle actuellement chargé
   */
  public getCurrentModel(): string | null {
    // Priorité au RuntimeManager
    const runtimeStatus = runtimeManager.getStatus();
    if (runtimeStatus.isReady && runtimeStatus.modelId) {
      return runtimeStatus.modelId;
    }

    // Sinon ModelManager
    const modelManagerModel = modelManager.getCurrentModel();
    if (modelManagerModel !== 'mock' || this.currentModelKey === 'mock') {
      return modelManagerModel;
    }

    return this.currentModelKey;
  }

  /**
   * Obtient l'état du kernel
   */
  public getStatus(): KernelStatus {
    const runtimeStatus = runtimeManager.getStatus();

    return {
      isInitialized: this.isInitialized,
      currentModelKey: this.getCurrentModel(),
      runtimeReady: runtimeStatus.isReady,
      storageReady: storageManager.isReady(),
      gpuAvailable: runtimeStatus.gpuAvailable,
      memoryUsage: runtimeStatus.memoryUsage,
      lastError: this.lastError,
    };
  }

  /**
   * Vérifie si le kernel est initialisé
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Arrête proprement le kernel
   */
  public async shutdown(): Promise<void> {
    log.info('Arrêt du kernel...');

    try {
      // Arrêter le RuntimeManager
      await runtimeManager.shutdown();

      // Vider les caches
      storageManager.clearCache();

      this.isInitialized = false;
      this.currentModelKey = null;
      this.lastError = null;

      log.info('Kernel arrêté proprement');
    } catch (error) {
      log.error("Erreur lors de l'arrêt:", error as Error);
      throw error;
    }
  }

  /**
   * Redémarre le kernel
   */
  public async restart(
    modelKey?: string,
    progressCallback?: (report: InitProgressReport) => void
  ): Promise<void> {
    await this.shutdown();
    await this.init(modelKey || 'mock', progressCallback);
  }

  /**
   * Obtient les métriques combinées
   */
  public async getMetrics(): Promise<{
    runtime: ReturnType<typeof runtimeManager.getPerformanceMetrics>;
    storage: Awaited<ReturnType<typeof storageManager.getStats>>;
    resources: Awaited<ReturnType<typeof resourceManager.getStatus>>;
  }> {
    return {
      runtime: runtimeManager.getPerformanceMetrics(),
      storage: await storageManager.getStats(),
      resources: await resourceManager.getStatus(),
    };
  }
}

export const kernelCoordinator = new KernelCoordinator();
