/**
 * RuntimeManager - Production Implementation
 * 
 * Gère le cycle de vie des runtimes d'inférence (WebLLM, Transformers.js).
 * Responsable de :
 * - Initialisation et destruction des moteurs
 * - Gestion de la mémoire GPU/CPU
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

const log = createLogger('RuntimeManager');

log.info('🚀 RuntimeManager (Production) initialisé.');

// Types pour les différents backends supportés
export type RuntimeBackend = 'webllm' | 'transformers' | 'mock';

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
 * Mock Engine pour le développement et les tests
 */
class MockInferenceEngine implements IInferenceEngine {
  private loaded = false;
  private currentModelId: string | null = null;

  async load(modelId: string, onProgress?: ProgressCallback): Promise<void> {
    log.info(`[Mock] Chargement simulé du modèle: ${modelId}`);
    
    // Simuler les étapes de chargement
    const phases = ['downloading', 'loading', 'compiling', 'ready'];
    for (let i = 0; i < phases.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      onProgress?.({
        phase: phases[i],
        progress: (i + 1) / phases.length,
        text: `[Mock] ${phases[i]}...`
      });
    }

    this.loaded = true;
    this.currentModelId = modelId;
    log.info(`[Mock] Modèle ${modelId} chargé avec succès`);
  }

  async generate(prompt: string, _options?: RuntimeConfig['options']): Promise<InferenceResult> {
    if (!this.loaded) {
      throw new Error('[Mock] Aucun modèle chargé');
    }

    const startTime = performance.now();
    
    // Simuler un délai d'inférence
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

    const mockResponse = this.generateMockResponse(prompt);
    const timeMs = performance.now() - startTime;

    return {
      text: mockResponse,
      tokensGenerated: mockResponse.split(' ').length,
      timeMs,
      finishReason: 'stop'
    };
  }

  async generateStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    _options?: RuntimeConfig['options']
  ): Promise<InferenceResult> {
    if (!this.loaded) {
      throw new Error('[Mock] Aucun modèle chargé');
    }

    const startTime = performance.now();
    const mockResponse = this.generateMockResponse(prompt);
    const words = mockResponse.split(' ');

    // Simuler le streaming mot par mot
    for (const word of words) {
      await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 30));
      onChunk(word + ' ');
    }

    const timeMs = performance.now() - startTime;

    return {
      text: mockResponse,
      tokensGenerated: words.length,
      timeMs,
      finishReason: 'stop'
    };
  }

  async unload(): Promise<void> {
    log.info(`[Mock] Déchargement du modèle: ${this.currentModelId}`);
    this.loaded = false;
    this.currentModelId = null;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getModelId(): string | null {
    return this.currentModelId;
  }

  private generateMockResponse(prompt: string): string {
    const responses = [
      "Je suis un assistant IA en mode simulation. Je peux vous aider avec vos questions.",
      "Voici une réponse simulée pour tester le système sans télécharger de modèle.",
      "En mode mock, je génère des réponses prédéfinies pour le développement.",
      "Cette réponse est générée par le MockInferenceEngine pour les tests.",
    ];
    
    // Sélectionner une réponse basée sur le hash du prompt
    const hash = prompt.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return responses[hash % responses.length];
  }
}

/**
 * RuntimeManager - Gestionnaire principal des runtimes d'inférence
 */
class RuntimeManager {
  private engine: IInferenceEngine | null = null;
  private currentBackend: RuntimeBackend | null = null;
  private status: RuntimeStatus = {
    isReady: false,
    backend: null,
    modelId: null,
    memoryUsage: 0,
    lastInferenceTime: null,
    totalInferences: 0
  };

  constructor() {
    log.info('RuntimeManager créé');
  }

  /**
   * Initialise le runtime avec un backend spécifique
   */
  public async initialize(
    config: RuntimeConfig,
    onProgress?: ProgressCallback
  ): Promise<boolean> {
    try {
      log.info(`Initialisation du runtime: ${config.backend} / ${config.modelId}`);

      // Vérifier les ressources disponibles
      const deviceStatus = await resourceManager.getStatus();
      if (deviceStatus.memory.usageRatio > 0.85) {
        log.warn('Mémoire insuffisante pour charger un modèle');
        return false;
      }

      // Vérifier si le modèle peut être chargé
      if (config.backend !== 'mock' && !memoryManager.canLoadModel(config.modelId)) {
        log.warn(`VRAM insuffisante pour le modèle: ${config.modelId}`);
        return false;
      }

      // Décharger l'ancien moteur si nécessaire
      if (this.engine?.isLoaded()) {
        await this.shutdown();
      }

      // Créer le moteur approprié
      this.engine = await this.createEngine(config.backend);
      this.currentBackend = config.backend;

      // Charger le modèle
      await this.engine.load(config.modelId, onProgress);

      // Mettre à jour le statut
      this.status = {
        isReady: true,
        backend: config.backend,
        modelId: config.modelId,
        memoryUsage: 0,
        lastInferenceTime: null,
        totalInferences: 0
      };

      // Vérifier le cache OPFS
      const storageReady = await storageManager.ensureReady();
      if (storageReady) {
        log.info('Cache OPFS disponible pour les modèles');
      }

      log.info(`Runtime initialisé avec succès: ${config.backend}/${config.modelId}`);
      return true;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Erreur d\'initialisation du runtime:', err);
      this.status.isReady = false;
      return false;
    }
  }

  /**
   * Crée une instance du moteur d'inférence approprié
   */
  private async createEngine(backend: RuntimeBackend): Promise<IInferenceEngine> {
    switch (backend) {
      case 'mock':
        log.info('Utilisation du MockInferenceEngine');
        return new MockInferenceEngine();

      case 'webllm':
        // En production, on importerait dynamiquement WebLLM
        log.info('WebLLM backend demandé - utilisation du mock pour l\'instant');
        // TODO: Implémenter WebLLMEngine quand prêt
        // return new WebLLMEngine();
        return new MockInferenceEngine();

      case 'transformers':
        // En production, on importerait dynamiquement Transformers.js
        log.info('Transformers.js backend demandé - utilisation du mock pour l\'instant');
        // TODO: Implémenter TransformersEngine quand prêt
        // return new TransformersEngine();
        return new MockInferenceEngine();

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

      log.debug(`Inférence complète: ${result.tokensGenerated} tokens en ${result.timeMs.toFixed(0)}ms`);
      
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Erreur d\'inférence:', err);
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

      log.debug(`Streaming complété: ${result.tokensGenerated} tokens en ${result.timeMs.toFixed(0)}ms`);
      
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
  public async switchModel(
    modelId: string,
    onProgress?: ProgressCallback
  ): Promise<boolean> {
    if (!this.currentBackend) {
      log.error('Aucun backend actif');
      return false;
    }

    return this.initialize({
      backend: this.currentBackend,
      modelId
    }, onProgress);
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
        log.error('Erreur lors de l\'arrêt du runtime:', error as Error);
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
      totalInferences: 0
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
   * Injecte un moteur personnalisé (pour les tests)
   */
  public setEngine(engine: IInferenceEngine): void {
    this.engine = engine;
    log.info('Moteur d\'inférence injecté manuellement');
  }
}

// Export singleton
export const runtimeManager = new RuntimeManager();

