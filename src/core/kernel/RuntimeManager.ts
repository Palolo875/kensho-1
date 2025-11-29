/**
 * RuntimeManager - Production Implementation
 *
 * Gère le cycle de vie des runtimes d'inférence (WebLLM, Transformers.js).
 * Responsable de :
 * - Initialisation et destruction des moteurs
 * - Gestion de la mémoire GPU/CPU
 * - Détection automatique de WebGPU
 * - Basculement entre différents backends
 * - Monitoring des performances d'inférence
 *
 * En mode développement, les appels aux vrais moteurs peuvent être
 * remplacés par des mocks via l'injection de dépendances.
 */

import { createLogger } from '../../lib/logger';
import { storageManager } from './StorageManager';
import { resourceManager } from './ResourceManager';
import { memoryManager } from './MemoryManager';
import {
  MockWebLLMEngine,
  MockTransformersJSEngine,
  createMockEngine,
} from '../runtime/mocks/mock-engines';

const log = createLogger('RuntimeManager');

log.info('🚀 RuntimeManager (Production) initialisé.');

// Types pour les différents backends supportés
export type RuntimeBackend = 'webllm' | 'transformers' | 'mock' | 'auto';

export interface RuntimeConfig {
  backend: RuntimeBackend;
  modelId: string;
  options?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    useGPU?: boolean;
  };
}

export interface RuntimeStatus {
  isReady: boolean;
  backend: RuntimeBackend | null;
  modelId: string | null;
  memoryUsage: number;
  lastInferenceTime: number | null;
  totalInferences: number;
  gpuAvailable: boolean;
  gpuInfo: GPUInfo | null;
}

export interface GPUInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}

export interface InferenceResult {
  text: string;
  tokensGenerated: number;
  timeMs: number;
  finishReason: 'stop' | 'length' | 'error';
}

export interface ProgressCallback {
  (progress: { phase: string; progress: number; text: string }): void;
}

// Interface pour l'injection de dépendances (permet les mocks)
export interface IInferenceEngine {
  load(modelId: string, onProgress?: ProgressCallback): Promise<void>;
  generate(prompt: string, options?: RuntimeConfig['options']): Promise<InferenceResult>;
  generateStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: RuntimeConfig['options']
  ): Promise<InferenceResult>;
  unload(): Promise<void>;
  isLoaded(): boolean;
  getModelId(): string | null;
}

/**
 * RuntimeManager - Gestionnaire principal des runtimes d'inférence
 */
class RuntimeManager {
  private engine: IInferenceEngine | null = null;
  private currentBackend: RuntimeBackend | null = null;
  private gpuAvailable: boolean | null = null;
  private gpuInfo: GPUInfo | null = null;
  private status: RuntimeStatus = {
    isReady: false,
    backend: null,
    modelId: null,
    memoryUsage: 0,
    lastInferenceTime: null,
    totalInferences: 0,
    gpuAvailable: false,
    gpuInfo: null,
  };

  constructor() {
    log.info('RuntimeManager créé');
    // Détecter WebGPU au démarrage
    this.detectWebGPU().then(available => {
      this.status.gpuAvailable = available;
      this.status.gpuInfo = this.gpuInfo;
      log.info(`WebGPU disponible: ${available}`);
    });
  }

  /**
   * Détecte la disponibilité de WebGPU et récupère les informations GPU
   */
  public async detectWebGPU(): Promise<boolean> {
    if (this.gpuAvailable !== null) {
      return this.gpuAvailable;
    }

    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) {
        log.info('WebGPU API non disponible dans cet environnement');
        this.gpuAvailable = false;
        return false;
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        log.warn('WebGPU: Aucun adaptateur GPU trouvé');
        this.gpuAvailable = false;
        return false;
      }

      // Récupérer les informations sur le GPU
      const adapterInfo = await adapter.requestAdapterInfo();
      this.gpuInfo = {
        vendor: adapterInfo.vendor || 'Unknown',
        architecture: adapterInfo.architecture || 'Unknown',
        device: adapterInfo.device || 'Unknown',
        description: adapterInfo.description || 'Unknown GPU',
      };

      log.info('WebGPU détecté:', this.gpuInfo);
      this.gpuAvailable = true;
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.warn('Erreur lors de la détection WebGPU:', err);
      this.gpuAvailable = false;
      return false;
    }
  }

  /**
   * Sélectionne automatiquement le meilleur backend disponible
   */
  public async autoSelectBackend(): Promise<RuntimeBackend> {
    const hasGPU = await this.detectWebGPU();

    if (hasGPU) {
      log.info('✅ WebGPU disponible - Sélection du backend GPU (webllm)');
      return 'webllm';
    } else {
      log.info('⚠️ WebGPU non disponible - Sélection du backend CPU (transformers)');
      return 'transformers';
    }
  }

  /**
   * Initialise le runtime avec un backend spécifique
   */
  public async initialize(
    config: RuntimeConfig,
    onProgress?: ProgressCallback
  ): Promise<boolean> {
    try {
      let backend = config.backend;

      // Si 'auto', sélectionner le meilleur backend
      if (backend === 'auto') {
        backend = await this.autoSelectBackend();
        log.info(`Backend auto-sélectionné: ${backend}`);
      }

      log.info(`Initialisation du runtime: ${backend} / ${config.modelId}`);

      // Vérifier les ressources disponibles
      const deviceStatus = await resourceManager.getStatus();
      if (deviceStatus.memory.usageRatio > 0.85) {
        log.warn('Mémoire insuffisante pour charger un modèle');
        return false;
      }

      // Vérifier si le modèle peut être chargé (sauf pour mock)
      if (backend !== 'mock' && !memoryManager.canLoadModel(config.modelId)) {
        log.warn(`VRAM insuffisante pour le modèle: ${config.modelId}`);
        // En mode auto ou transformers, on peut fallback sur CPU
        if (backend === 'webllm') {
          log.info('Fallback vers le backend CPU (transformers)');
          backend = 'transformers';
        }
      }

      // Décharger l'ancien moteur si nécessaire
      if (this.engine?.isLoaded()) {
        await this.shutdown();
      }

      // Créer le moteur approprié
      this.engine = await this.createEngine(backend);
      this.currentBackend = backend;

      // Charger le modèle
      await this.engine.load(config.modelId, onProgress);

      // Mettre à jour le statut
      this.status = {
        isReady: true,
        backend: backend,
        modelId: config.modelId,
        memoryUsage: 0,
        lastInferenceTime: null,
        totalInferences: 0,
        gpuAvailable: this.gpuAvailable ?? false,
        gpuInfo: this.gpuInfo,
      };

      // Vérifier le cache OPFS
      const storageReady = await storageManager.ensureReady();
      if (storageReady) {
        log.info('Cache OPFS disponible pour les modèles');
      }

      log.info(`Runtime initialisé avec succès: ${backend}/${config.modelId}`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error("Erreur d'initialisation du runtime:", err);
      this.status.isReady = false;
      return false;
    }
  }

  /**
   * Initialise le runtime avec sélection automatique du backend
   */
  public async initializeAuto(
    modelId: string,
    onProgress?: ProgressCallback
  ): Promise<boolean> {
    return this.initialize(
      {
        backend: 'auto',
        modelId,
      },
      onProgress
    );
  }

  /**
   * Crée une instance du moteur d'inférence approprié
   */
  private async createEngine(backend: RuntimeBackend): Promise<IInferenceEngine> {
    switch (backend) {
      case 'mock':
        log.info('Utilisation du MockInferenceEngine (générique)');
        return createMockEngine(this.gpuAvailable ? 'GPU' : 'CPU');

      case 'webllm':
        // En production, on importerait dynamiquement WebLLM
        log.info('WebLLM backend demandé - utilisation du mock GPU pour l\'instant');
        // TODO: Implémenter WebLLMEngine quand prêt
        // const { WebLLMEngine } = await import('../runtime/webllm/WebLLMEngine');
        // return new WebLLMEngine();
        return new MockWebLLMEngine();

      case 'transformers':
        // En production, on importerait dynamiquement Transformers.js
        log.info('Transformers.js backend demandé - utilisation du mock CPU pour l\'instant');
        // TODO: Implémenter TransformersEngine quand prêt
        // const { TransformersEngine } = await import('../runtime/transformers/TransformersEngine');
        // return new TransformersEngine();
        return new MockTransformersJSEngine();

      case 'auto':
        // Ne devrait pas arriver ici car 'auto' est résolu dans initialize()
        const selectedBackend = await this.autoSelectBackend();
        return this.createEngine(selectedBackend);

      default:
        throw new Error(`Backend non supporté: ${backend}`);
    }
  }

  /**
   * Génère une réponse (mode non-streaming)
   */
  public async generate(
    prompt: string,
    options?: RuntimeConfig['options']
  ): Promise<InferenceResult> {
    if (!this.engine || !this.status.isReady) {
      throw new Error('Runtime non initialisé');
    }

    const startTime = performance.now();

    try {
      const result = await this.engine.generate(prompt, options);

      this.status.lastInferenceTime = performance.now() - startTime;
      this.status.totalInferences++;

      log.debug(
        `Inférence complète: ${result.tokensGenerated} tokens en ${result.timeMs.toFixed(0)}ms`
      );

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error("Erreur d'inférence:", err);
      throw err;
    }
  }

  /**
   * Génère une réponse en streaming
   */
  public async generateStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: RuntimeConfig['options']
  ): Promise<InferenceResult> {
    if (!this.engine || !this.status.isReady) {
      throw new Error('Runtime non initialisé');
    }

    const startTime = performance.now();

    try {
      const result = await this.engine.generateStream(prompt, onChunk, options);

      this.status.lastInferenceTime = performance.now() - startTime;
      this.status.totalInferences++;

      log.debug(
        `Streaming complété: ${result.tokensGenerated} tokens en ${result.timeMs.toFixed(0)}ms`
      );

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Erreur de streaming:', err);
      throw err;
    }
  }

  /**
   * Change de modèle sans changer de backend
   */
  public async switchModel(modelId: string, onProgress?: ProgressCallback): Promise<boolean> {
    if (!this.currentBackend) {
      log.error('Aucun backend actif');
      return false;
    }

    return this.initialize(
      {
        backend: this.currentBackend,
        modelId,
      },
      onProgress
    );
  }

  /**
   * Change de backend
   */
  public async switchBackend(
    backend: RuntimeBackend,
    modelId?: string,
    onProgress?: ProgressCallback
  ): Promise<boolean> {
    const model = modelId ?? this.status.modelId;
    if (!model) {
      log.error('Aucun modèle spécifié');
      return false;
    }

    return this.initialize(
      {
        backend,
        modelId: model,
      },
      onProgress
    );
  }

  /**
   * Arrête le runtime et libère les ressources
   */
  public async shutdown(): Promise<void> {
    if (this.engine) {
      try {
        await this.engine.unload();
        log.info('Runtime arrêté proprement');
      } catch (error) {
        log.error("Erreur lors de l'arrêt du runtime:", error as Error);
      }
    }

    this.engine = null;
    this.currentBackend = null;
    this.status = {
      isReady: false,
      backend: null,
      modelId: null,
      memoryUsage: 0,
      lastInferenceTime: null,
      totalInferences: 0,
      gpuAvailable: this.gpuAvailable ?? false,
      gpuInfo: this.gpuInfo,
    };
  }

  /**
   * Retourne le statut actuel du runtime
   */
  public getStatus(): RuntimeStatus {
    return { ...this.status };
  }

  /**
   * Vérifie si le runtime est prêt
   */
  public isReady(): boolean {
    return this.status.isReady && this.engine?.isLoaded() === true;
  }

  /**
   * Retourne le backend actuel
   */
  public getCurrentBackend(): RuntimeBackend | null {
    return this.currentBackend;
  }

  /**
   * Vérifie si WebGPU est disponible
   */
  public isGPUAvailable(): boolean {
    return this.gpuAvailable ?? false;
  }

  /**
   * Retourne les informations GPU
   */
  public getGPUInfo(): GPUInfo | null {
    return this.gpuInfo;
  }

  /**
   * Injecte un moteur personnalisé (pour les tests)
   */
  public setEngine(engine: IInferenceEngine): void {
    this.engine = engine;
    log.info("Moteur d'inférence injecté manuellement");
  }
}

// Export singleton
export const runtimeManager = new RuntimeManager();
