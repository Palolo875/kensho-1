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
 * - Retry avec backoff exponentiel
 * - Fallback automatique GPU → CPU
 * - Pool de moteurs pour multi-modèles
 *
 * En mode développement, les appels aux vrais moteurs peuvent être
 * remplacés par des mocks via l'injection de dépendances.
 */

import { createLogger } from '../../lib/logger';
import { logger } from './monitoring/LoggerService';
import { storageManager, CompiledGraph, COMPILED_GRAPH_VERSION } from './StorageManager';
import { resourceManager } from './ResourceManager';
import { memoryManager } from './MemoryManager';
import {
  MockWebLLMEngine,
  MockTransformersJSEngine,
  createMockEngine,
} from '../runtime/mocks/mock-engines';
import { MockGPUEngine } from './engine/MockGPU.engine';
import { MockCPUEngine } from './engine/MockCPU.engine';
import { sseStreamer } from '../streaming/SSEStreamer';

const log = createLogger('RuntimeManager');

logger.info('RuntimeManager', '🚀 RuntimeManager (Production) initialisé.');

// Types pour les différents backends supportés
export type RuntimeBackend = 'webllm' | 'transformers' | 'mock' | 'auto';

export interface RuntimeConfig {
  backend: RuntimeBackend;
  modelId: string;
  options?: InferenceOptions;
}

export interface InferenceOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  useGPU?: boolean;
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

/**
 * Interface pour les événements de progression
 */
interface ProgressEvent {
  modelKey: string;
  stage: string;
  progress: number;
}

/**
 * Interface pour les callbacks de progression
 */
export interface ProgressCallback {
  (progress: { phase: string; progress: number; text: string }): void;
}

/**
 * Interface pour l'injection de dépendances (permet les mocks)
 */
export interface IInferenceEngine {
  load(modelId: string, onProgress?: ProgressCallback): Promise<void>;
  generate(prompt: string, options?: InferenceOptions): Promise<InferenceResult>;
  generateStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: InferenceOptions
  ): Promise<InferenceResult>;
  unload(): Promise<void>;
  isLoaded(): boolean;
  getModelId(): string | null;
}

/**
 * Configuration pour le retry avec backoff
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Métriques de performance
 */
export interface PerformanceMetrics {
  totalInferences: number;
  successfulInferences: number;
  failedInferences: number;
  totalRetries: number;
  fallbacksTriggered: number;
  averageLatencyMs: number;
  averageTokensPerSecond: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  lastHourInferences: number;
  errorRate: number;
  gpuUtilization: number;
}

/**
 * Entrée du pool de moteurs
 */
interface EnginePoolEntry {
  engine: IInferenceEngine;
  modelId: string;
  backend: RuntimeBackend;
  lastUsed: number;
  useCount: number;
  isActive: boolean;
}

/**
 * Enregistrement d'une inférence pour les métriques
 */
interface InferenceRecord {
  timestamp: number;
  latencyMs: number;
  tokensGenerated: number;
  success: boolean;
  retries: number;
  usedFallback: boolean;
}

/**
 * Événement de progression de compilation
 * Utilisé pour informer l'UI de l'avancement de la pré-compilation
 */
export interface CompilationProgress {
  modelKey: string;
  stage: 'checking' | 'loading' | 'parsing' | 'linking' | 'optimizing' | 'compiling' | 'caching' | 'done';
  progress: number; // 0.0 - 1.0
  estimatedRemainingMs: number;
  message: string;
}

/**
 * Callback pour la progression de compilation
 */
export type CompilationProgressCallback = (progress: CompilationProgress) => void;

/**
 * Stats du cache de graphes compilés
 */
export interface CompiledGraphStats {
  inMemory: number;
  inStorage: number;
  cacheHits: number;
  cacheMisses: number;
  lastCompilationMs: number | null;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'OUT_OF_MEMORY', 'GPU_ERROR'],
};

/**
 * RuntimeManager - Gestionnaire principal des runtimes d'inférence
 */
class RuntimeManager {
  private engine: IInferenceEngine | null = null;
  private currentBackend: RuntimeBackend | null = null;
  private gpuAvailable: boolean | null = null;
  private gpuInfo: GPUInfo | null = null;

  // Pool de moteurs pour multi-modèles
  private enginePool: Map<string, EnginePoolEntry> = new Map();
  private readonly MAX_POOL_SIZE = 3;

  // Configuration retry
  private retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG;

  // Métriques de performance
  private inferenceRecords: InferenceRecord[] = [];
  private readonly MAX_RECORDS = 1000;
  private metricsCache: PerformanceMetrics | null = null;
  private metricsCacheTime: number = 0;
  private readonly METRICS_CACHE_TTL = 5000; // 5 secondes

  // ============================================================================
  // PRÉ-COMPILATION: Cache des graphes compilés pour démarrage instantané
  // ============================================================================

  /**
   * Cache mémoire des graphes compilés (LRU)
   * Premier niveau de cache pour accès instantané
   */
  private loadedCompiledGraphs: Map<string, CompiledGraph> = new Map();
  private readonly MAX_CACHED_GRAPHS = 3;

  /**
   * Stats du cache de graphes
   */
  private graphStats: {
    cacheHits: number;
    cacheMisses: number;
    lastCompilationMs: number | null;
  } = {
      cacheHits: 0,
      cacheMisses: 0,
      lastCompilationMs: null,
    };

  /**
   * Flag pour éviter le warming concurrent
   */
  private isWarmingUp: boolean = false;
  private warmupPromise: Promise<void> | null = null;

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

  // --- Logique du Circuit Breaker ---
  private failureCount = 0;
  private successCount = 0; // ✅ Nouveau
  private rejectionCount = 0; // ✅ Nouveau
  private readonly FAILURE_THRESHOLD = 3;
  private readonly SUCCESS_THRESHOLD = 2; // ✅ Succès nécessaires pour fermer
  private readonly REJECTION_THRESHOLD = 5; // ✅ Seuil de rejets
  private readonly FALLBACK_DURATION = 60_000;
  private readonly HALF_OPEN_TIMEOUT = 5_000; // ✅ Timeout pour un test
  private fallbackUntil: number = 0;
  private gpuEngine: MockGPUEngine;
  private cpuEngine: MockCPUEngine;
  private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'; // ✅ Nouvel état

  // Ajout des propriétés pour le préchauffage
  private prewarmingModels: Map<string, AbortController> = new Map();
  private prewarmMetrics = {
    totalPrewarms: 0,
    successfulPrewarms: 0,
    cancelledPrewarms: 0,
    hitRate: 0 // % des prewarms qui ont été utilisés
  };

  constructor() {
    log.info('RuntimeManager créé');
    // Détecter WebGPU au démarrage
    this.detectWebGPU().then((available) => {
      this.status.gpuAvailable = available;
      this.status.gpuInfo = this.gpuInfo;
      log.info(`WebGPU disponible: ${available}`);
    });

    // Lancer le nettoyage des graphes obsolètes en arrière-plan
    this.initializeGraphCache();

    this.gpuEngine = new MockGPUEngine();
    this.cpuEngine = new MockCPUEngine();
    logger.info('RuntimeManager', '🚀 RuntimeManager (Production) initialisé.'); // ✅ Nouveau
  }

  /**
   * Initialise le cache de graphes (nettoyage au boot)
   */
  private async initializeGraphCache(): Promise<void> {
    try {
      const cleanup = await storageManager.cleanupObsoleteGraphs(30);
      if (cleanup.deleted > 0) {
        log.info(`[Pre-Compile] Nettoyage initial: ${cleanup.deleted} graphes obsolètes supprimés`);
      }
    } catch {
      // Ignorer les erreurs de nettoyage
    }
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
   * Configure les paramètres de retry
   */
  public setRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
    log.info('Configuration retry mise à jour:', this.retryConfig);
  }

  /**
   * Calcule le délai de retry avec backoff exponentiel
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt),
      this.retryConfig.maxDelayMs
    );
    // Ajouter un jitter de ±20%
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  }

  /**
   * Vérifie si une erreur est retryable
   */
  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toUpperCase();
    return this.retryConfig.retryableErrors.some((e) => errorMessage.includes(e));
  }

  /**
   * Exécute une opération avec retry et backoff
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    enableFallback: boolean = true
  ): Promise<{ result: T; retries: number; usedFallback: boolean }> {
    let lastError: Error | null = null;
    let retries = 0;
    let usedFallback = false;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        return { result, retries, usedFallback };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retries = attempt;

        if (attempt < this.retryConfig.maxRetries && this.isRetryableError(lastError)) {
          const delay = this.calculateRetryDelay(attempt);
          log.warn(
            `${operationName} échoué (tentative ${attempt + 1}/${this.retryConfig.maxRetries + 1}), ` +
            `retry dans ${delay}ms: ${lastError.message}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (
          enableFallback &&
          this.currentBackend === 'webllm' &&
          lastError.message.includes('GPU')
        ) {
          // Fallback GPU → CPU
          log.warn('Erreur GPU détectée, fallback vers CPU...');
          try {
            await this.switchBackend('transformers');
            usedFallback = true;
            const result = await operation();
            return { result, retries, usedFallback };
          } catch (fallbackError) {
            log.error('Fallback CPU également échoué:', fallbackError as Error);
          }
        }
      }
    }

    throw lastError || new Error(`${operationName} échoué après ${retries + 1} tentatives`);
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
        // En mode auto ou webllm, on peut fallback sur CPU
        if (backend === 'webllm') {
          log.info('Fallback vers le backend CPU (transformers)');
          backend = 'transformers';
        }
      }

      // Vérifier si le modèle est déjà dans le pool
      const poolKey = `${backend}:${config.modelId}`;
      const pooledEngine = this.enginePool.get(poolKey);

      if (pooledEngine && pooledEngine.engine.isLoaded()) {
        log.info(`Modèle ${config.modelId} récupéré depuis le pool`);
        this.engine = pooledEngine.engine;
        this.currentBackend = backend;
        pooledEngine.lastUsed = Date.now();
        pooledEngine.useCount++;
        pooledEngine.isActive = true;

        this.updateStatus(backend, config.modelId);
        return true;
      }

      // Décharger l'ancien moteur si nécessaire
      if (this.engine?.isLoaded()) {
        await this.releaseToPool();
      }

      // Créer le moteur approprié
      this.engine = await this.createEngine(backend);
      this.currentBackend = backend;

      // Charger le modèle avec retry
      await this.withRetry(
        () => this.engine!.load(config.modelId, onProgress),
        `Chargement du modèle ${config.modelId}`,
        true
      );

      // Ajouter au pool
      this.addToPool(poolKey, this.engine, config.modelId, backend);

      this.updateStatus(backend, config.modelId);

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
   * Met à jour le statut après initialisation
   */
  private updateStatus(backend: RuntimeBackend, modelId: string): void {
    this.status = {
      isReady: true,
      backend: backend,
      modelId: modelId,
      memoryUsage: 0,
      lastInferenceTime: null,
      totalInferences: this.status.totalInferences,
      gpuAvailable: this.gpuAvailable ?? false,
      gpuInfo: this.gpuInfo,
    };
  }

  /**
   * Ajoute un moteur au pool
   */
  private addToPool(
    key: string,
    engine: IInferenceEngine,
    modelId: string,
    backend: RuntimeBackend
  ): void {
    // Éviction LRU si nécessaire
    if (this.enginePool.size >= this.MAX_POOL_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [k, entry] of this.enginePool.entries()) {
        if (!entry.isActive && entry.lastUsed < oldestTime) {
          oldestTime = entry.lastUsed;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        const evicted = this.enginePool.get(oldestKey);
        if (evicted) {
          evicted.engine.unload().catch((e) => log.warn('Erreur lors de l\'éviction:', e));
          this.enginePool.delete(oldestKey);
          log.info(`Pool: éviction de ${oldestKey}`);
        }
      }
    }

    this.enginePool.set(key, {
      engine,
      modelId,
      backend,
      lastUsed: Date.now(),
      useCount: 1,
      isActive: true,
    });
  }

  /**
   * Libère le moteur actuel vers le pool (sans le décharger)
   */
  private async releaseToPool(): Promise<void> {
    if (!this.engine || !this.currentBackend || !this.status.modelId) return;

    const poolKey = `${this.currentBackend}:${this.status.modelId}`;
    const entry = this.enginePool.get(poolKey);

    if (entry) {
      entry.isActive = false;
      entry.lastUsed = Date.now();
    }

    this.engine = null;
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
        log.info("WebLLM backend demandé - utilisation du mock GPU pour l'instant");
        // TODO: Implémenter WebLLMEngine quand prêt
        // const { WebLLMEngine } = await import('../runtime/webllm/WebLLMEngine');
        // return new WebLLMEngine();
        return new MockWebLLMEngine();

      case 'transformers':
        log.info("Transformers.js backend demandé - utilisation du mock CPU pour l'instant");
        // TODO: Implémenter TransformersEngine quand prêt
        // const { TransformersEngine } = await import('../runtime/transformers/TransformersEngine');
        // return new TransformersEngine();
        return new MockTransformersJSEngine();

      case 'auto': {
        const selectedBackend = await this.autoSelectBackend();
        return this.createEngine(selectedBackend);
      }

      default:
        throw new Error(`Backend non supporté: ${backend}`);
    }
  }

  /**
   * Enregistre une inférence dans les métriques
   */
  private recordInference(
    latencyMs: number,
    tokensGenerated: number,
    success: boolean,
    retries: number,
    usedFallback: boolean
  ): void {
    const record: InferenceRecord = {
      timestamp: Date.now(),
      latencyMs,
      tokensGenerated,
      success,
      retries,
      usedFallback,
    };

    this.inferenceRecords.push(record);

    // Limiter la taille
    if (this.inferenceRecords.length > this.MAX_RECORDS) {
      this.inferenceRecords = this.inferenceRecords.slice(-this.MAX_RECORDS);
    }

    // Invalider le cache des métriques
    this.metricsCache = null;
  }

  /**
   * Génère une réponse (mode non-streaming) avec retry
   */
  public async generate(
    prompt: string,
    options?: InferenceOptions
  ): Promise<InferenceResult> {
    if (!this.engine || !this.status.isReady) {
      throw new Error('Runtime non initialisé');
    }

    const startTime = performance.now();
    let retries = 0;
    let usedFallback = false;

    try {
      const { result, retries: r, usedFallback: f } = await this.withRetry(
        () => this.engine!.generate(prompt, options),
        'Inférence',
        true
      );
      retries = r;
      usedFallback = f;

      const latencyMs = performance.now() - startTime;
      this.status.lastInferenceTime = latencyMs;
      this.status.totalInferences++;

      // Enregistrer les métriques
      this.recordInference(latencyMs, result.tokensGenerated, true, retries, usedFallback);

      log.debug(
        `Inférence complète: ${result.tokensGenerated} tokens en ${result.timeMs.toFixed(0)}ms` +
        (retries > 0 ? ` (${retries} retries)` : '') +
        (usedFallback ? ' (fallback CPU)' : '')
      );

      return result;
    } catch (error) {
      const latencyMs = performance.now() - startTime;
      this.recordInference(latencyMs, 0, false, retries, usedFallback);

      const err = error instanceof Error ? error : new Error(String(error));
      log.error("Erreur d'inférence:", err);
      throw err;
    }
  }

  /**
   * Génère une réponse en streaming avec retry
   */
  public async generateStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: InferenceOptions
  ): Promise<InferenceResult> {
    if (!this.engine || !this.status.isReady) {
      throw new Error('Runtime non initialisé');
    }

    const startTime = performance.now();
    let retries = 0;
    let usedFallback = false;

    try {
      const { result, retries: r, usedFallback: f } = await this.withRetry(
        () => this.engine!.generateStream(prompt, onChunk, options),
        'Streaming',
        true
      );
      retries = r;
      usedFallback = f;

      const latencyMs = performance.now() - startTime;
      this.status.lastInferenceTime = latencyMs;
      this.status.totalInferences++;

      // Enregistrer les métriques
      this.recordInference(latencyMs, result.tokensGenerated, true, retries, usedFallback);

      log.debug(
        `Streaming complété: ${result.tokensGenerated} tokens en ${result.timeMs.toFixed(0)}ms` +
        (retries > 0 ? ` (${retries} retries)` : '') +
        (usedFallback ? ' (fallback CPU)' : '')
      );

      return result;
    } catch (error) {
      const latencyMs = performance.now() - startTime;
      this.recordInference(latencyMs, 0, false, retries, usedFallback);

      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Erreur de streaming:', err);
      throw err;
    }
  }

  /**
   * Calcule les percentiles pour les métriques de latence
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Obtient les métriques de performance
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    // Utiliser le cache si valide
    if (this.metricsCache && Date.now() - this.metricsCacheTime < this.METRICS_CACHE_TTL) {
      return this.metricsCache;
    }

    const now = Date.now();
    const oneHourAgo = now - 3600000;

    const records = this.inferenceRecords;
    const recentRecords = records.filter((r) => r.timestamp > oneHourAgo);

    const successfulRecords = records.filter((r) => r.success);
    const latencies = successfulRecords.map((r) => r.latencyMs);

    const totalTokens = successfulRecords.reduce((sum, r) => sum + r.tokensGenerated, 0);
    const totalTime = successfulRecords.reduce((sum, r) => sum + r.latencyMs, 0);
    const avgTokensPerSecond = totalTime > 0 ? (totalTokens / totalTime) * 1000 : 0;

    const totalRetries = records.reduce((sum, r) => sum + r.retries, 0);
    const fallbacksTriggered = records.filter((r) => r.usedFallback).length;

    const metrics: PerformanceMetrics = {
      totalInferences: records.length,
      successfulInferences: successfulRecords.length,
      failedInferences: records.filter((r) => !r.success).length,
      totalRetries,
      fallbacksTriggered,
      averageLatencyMs:
        latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      averageTokensPerSecond: Math.round(avgTokensPerSecond * 100) / 100,
      p50LatencyMs: this.calculatePercentile(latencies, 50),
      p95LatencyMs: this.calculatePercentile(latencies, 95),
      p99LatencyMs: this.calculatePercentile(latencies, 99),
      lastHourInferences: recentRecords.length,
      errorRate: records.length > 0 ? records.filter((r) => !r.success).length / records.length : 0,
      gpuUtilization: this.currentBackend === 'webllm' ? 0.7 : 0, // Placeholder
    };

    // Mettre en cache
    this.metricsCache = metrics;
    this.metricsCacheTime = now;

    return metrics;
  }

  /**
   * Réinitialise les métriques
   */
  public resetMetrics(): void {
    this.inferenceRecords = [];
    this.metricsCache = null;
    log.info('Métriques réinitialisées');
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
   * Obtient les informations sur le pool de moteurs
   */
  public getPoolInfo(): {
    size: number;
    maxSize: number;
    engines: Array<{
      key: string;
      modelId: string;
      backend: RuntimeBackend;
      isActive: boolean;
      useCount: number;
      lastUsed: number;
    }>;
  } {
    const engines = Array.from(this.enginePool.entries()).map(([key, entry]) => ({
      key,
      modelId: entry.modelId,
      backend: entry.backend,
      isActive: entry.isActive,
      useCount: entry.useCount,
      lastUsed: entry.lastUsed,
    }));

    return {
      size: this.enginePool.size,
      maxSize: this.MAX_POOL_SIZE,
      engines,
    };
  }

  /**
   * Précharge un modèle dans le pool
   */
  public async preloadModel(
    modelId: string,
    backend: RuntimeBackend = 'auto',
    onProgress?: ProgressCallback
  ): Promise<boolean> {
    const resolvedBackend = backend === 'auto' ? await this.autoSelectBackend() : backend;
    const poolKey = `${resolvedBackend}:${modelId}`;

    if (this.enginePool.has(poolKey)) {
      log.info(`Modèle ${modelId} déjà dans le pool`);
      return true;
    }

    try {
      const engine = await this.createEngine(resolvedBackend);
      await engine.load(modelId, onProgress);
      this.addToPool(poolKey, engine, modelId, resolvedBackend);
      log.info(`Modèle ${modelId} préchargé dans le pool`);
      return true;
    } catch (error) {
      log.error(`Erreur de préchargement du modèle ${modelId}:`, error as Error);
      return false;
    }
  }

  // ============================================================================
  // MÉTHODES DE PRÉ-COMPILATION (Démarrage instantané)
  // ============================================================================

  /**
   * Charge un modèle avec le système de pré-compilation 3-niveaux:
   * 1. Cache mémoire (instantané)
   * 2. Cache OPFS (< 200ms)
   * 3. Compilation complète (~ 4 secondes simulées)
   */
  public async loadCompiledModel(
    modelKey: string,
    onProgress?: CompilationProgressCallback,
    signal?: AbortSignal
  ): Promise<CompiledGraph> {
    const emitProgress = (
      stage: CompilationProgress['stage'],
      progress: number,
      estimatedRemainingMs: number,
      message: string
    ) => {
      onProgress?.({
        modelKey,
        stage,
        progress,
        estimatedRemainingMs,
        message,
      });
    };

    emitProgress('checking', 0, 0, 'Vérification du cache mémoire...');

    // ============ NIVEAU 1: Cache mémoire (instantané) ============
    const cachedInMemory = this.loadedCompiledGraphs.get(modelKey);
    if (cachedInMemory) {
      this.graphStats.cacheHits++;
      log.info(`[Pre-Compile] ✅ ${modelKey} trouvé en mémoire (instantané)`);
      emitProgress('done', 1, 0, 'Graphe en mémoire, démarrage instantané');
      return cachedInMemory;
    }

    // ============ NIVEAU 2: Cache OPFS (< 200ms) ============
    emitProgress('loading', 0.1, 200, 'Recherche du graphe pré-compilé dans le stockage...');

    const cachedInStorage = await storageManager.getCompiledGraph(modelKey);
    if (cachedInStorage) {
      this.graphStats.cacheHits++;
      log.info(`[Pre-Compile] 📦 ${modelKey} trouvé dans OPFS, chargement rapide...`);

      // Simuler le temps de chargement depuis OPFS vers la mémoire (< 200ms)
      emitProgress('loading', 0.5, 100, 'Transfert du graphe vers la VRAM...');
      await this.simulateDelay(150, 50); // 150ms ± 50ms

      // Ajouter au cache mémoire
      this.evictOldestGraphIfNeeded();
      this.loadedCompiledGraphs.set(modelKey, cachedInStorage);

      emitProgress('done', 1, 0, 'Graphe chargé depuis le stockage (démarrage à froid évité)');
      log.info(`[Pre-Compile] ✅ ${modelKey} prêt (warm start depuis OPFS)`);
      return cachedInStorage;
    }

    // ============ NIVEAU 3: Compilation complète (~ 4 secondes) ============
    this.graphStats.cacheMisses++;
    log.warn(`[Pre-Compile] ⚠️ Aucun graphe pour ${modelKey}, compilation nécessaire...`);

    const compilationStart = performance.now();

    // Simulation des différentes phases de compilation
    const phases = [
      { stage: 'parsing' as const, duration: 800, msg: 'Parsing du modèle...' },
      { stage: 'linking' as const, duration: 600, msg: 'Linking des dépendances...' },
      { stage: 'optimizing' as const, duration: 1000, msg: 'Optimisation du graphe...' },
      { stage: 'compiling' as const, duration: 1400, msg: 'Compilation des shaders WebGPU...' },
      { stage: 'caching' as const, duration: 200, msg: 'Mise en cache du graphe compilé...' },
    ];

    const totalEstimated = phases.reduce((sum, p) => sum + p.duration, 0);
    let elapsed = 0;

    for (const phase of phases) {
      emitProgress(phase.stage, elapsed / totalEstimated, totalEstimated - elapsed, phase.msg);

      // Ajouter un jitter réaliste (±15%)
      await this.simulateDelay(phase.duration, phase.duration * 0.15);
      elapsed += phase.duration;

      // Vérifier l'annulation
      if (signal?.aborted) {
        throw new Error('Préchauffage annulé');
      }
    }

    const compilationTimeMs = performance.now() - compilationStart;
    this.graphStats.lastCompilationMs = compilationTimeMs;

    // Créer le nouveau graphe compilé
    const newGraph: CompiledGraph = {
      id: modelKey,
      version: COMPILED_GRAPH_VERSION,
      schemaHash: this.generateSchemaHash(modelKey),
      compiledAt: Date.now(),
      compilationTimeMs: Math.round(compilationTimeMs),
      metadata: {
        modelName: modelKey,
        backend: this.currentBackend || 'mock',
        optimizationLevel: 'balanced',
      },
    };

    // Sauvegarder dans OPFS pour les prochains lancements
    await storageManager.saveCompiledGraph(modelKey, newGraph);

    // Ajouter au cache mémoire
    this.evictOldestGraphIfNeeded();
    this.loadedCompiledGraphs.set(modelKey, newGraph);

    emitProgress('done', 1, 0, `Compilation terminée (${Math.round(compilationTimeMs)}ms)`);
    log.info(`[Pre-Compile] ✅ ${modelKey} compilé et prêt (${Math.round(compilationTimeMs)}ms)`);

    return newGraph;
  }

  /**
   * Pré-compile une liste de modèles en arrière-plan (warming)
   * Non-bloquant, idéal pour exécuter pendant l'onboarding utilisateur
   */
  public async warmupModels(
    modelKeys: string[],
    onProgress?: (current: string, index: number, total: number) => void
  ): Promise<{ success: string[]; failed: string[] }> {
    // Éviter le warming concurrent
    if (this.isWarmingUp && this.warmupPromise) {
      log.info('[Warmup] Warming déjà en cours, attente...');
      await this.warmupPromise;
    }

    this.isWarmingUp = true;
    const success: string[] = [];
    const failed: string[] = [];

    log.info(`[Warmup] Démarrage du pré-chauffage de ${modelKeys.length} modèle(s)...`);

    this.warmupPromise = (async () => {
      for (let i = 0; i < modelKeys.length; i++) {
        const modelKey = modelKeys[i];
        onProgress?.(modelKey, i, modelKeys.length);

        try {
          // Utiliser requestIdleCallback si disponible pour ne pas bloquer l'UI
          if (typeof requestIdleCallback !== 'undefined') {
            await new Promise<void>((resolve) => {
              requestIdleCallback(() => resolve(), { timeout: 100 });
            });
          }

          // Charger silencieusement (sans callback de progression visible)
          await this.loadCompiledModel(modelKey);
          success.push(modelKey);
          log.debug(`[Warmup] ${modelKey} prêt (${i + 1}/${modelKeys.length})`);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          log.warn(`[Warmup] Échec pour ${modelKey}: ${err.message}`);
          failed.push(modelKey);
        }
      }
    })();

    await this.warmupPromise;
    this.isWarmingUp = false;
    this.warmupPromise = null;

    log.info(`[Warmup] Terminé: ${success.length} succès, ${failed.length} échecs`);
    return { success, failed };
  }

  /**
   * Préchauffe un modèle en arrière-plan.
   * C'est une opération non bloquante.
   */
  public prewarmModel(modelKey: string): void {
    this.prewarmMetrics.totalPrewarms++;
    
    // Annule les autres préchauffages en cours
    for (const [key, controller] of this.prewarmingModels.entries()) {
      if (key !== modelKey) {
        logger.info('RuntimeManager', `Annulation du préchauffage de ${key}`);
        controller.abort();
        this.prewarmingModels.delete(key);
        this.prewarmMetrics.cancelledPrewarms++;
      }
    }

    // Si déjà en cours pour ce modèle, ne rien faire
    if (this.prewarmingModels.has(modelKey)) {
      logger.debug('RuntimeManager', `${modelKey} déjà en préchauffage`);
      return;
    }

    // Si déjà chargé, ne rien faire
    if (this.loadedCompiledGraphs.has(modelKey)) {
      logger.debug('RuntimeManager', `${modelKey} déjà chargé`);
      this.prewarmMetrics.successfulPrewarms++;
      return;
    }

    // Lance le préchauffage avec AbortController
    const controller = new AbortController();
    this.prewarmingModels.set(modelKey, controller);

    logger.info('RuntimeManager', `🔥 Préchauffage de ${modelKey}...`);

    this.loadCompiledModel(modelKey, undefined, controller.signal)
      .then(() => {
        logger.info('RuntimeManager', `✅ ${modelKey} préchauffé et prêt`);
        this.prewarmingModels.delete(modelKey);
        this.prewarmMetrics.successfulPrewarms++;
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          logger.debug('RuntimeManager', `Préchauffage de ${modelKey} annulé`);
          this.prewarmMetrics.cancelledPrewarms++;
        } else {
          logger.error('RuntimeManager', `Échec du préchauffage`, err);
        }
        this.prewarmingModels.delete(modelKey);
      });
  }

  public getMetrics() {
    return {
      ...this.prewarmMetrics,
      hitRate: (this.prewarmMetrics.successfulPrewarms / this.prewarmMetrics.totalPrewarms * 100).toFixed(1) + '%'
    };
  }

  /**
   * Éviction LRU du cache mémoire si nécessaire
   */
  private evictOldestGraphIfNeeded(): void {
    if (this.loadedCompiledGraphs.size >= this.MAX_CACHED_GRAPHS) {
      // L'ordre d'insertion de Map préserve l'ordre, donc le premier est le plus ancien
      const oldestKey = this.loadedCompiledGraphs.keys().next().value;
      if (oldestKey) {
        this.loadedCompiledGraphs.delete(oldestKey);
        log.debug(`[Pre-Compile] Éviction LRU: ${oldestKey}`);
      }
    }
  }

  /**
   * Retourne les statistiques du cache de graphes compilés
   */
  public async getCompiledGraphStats(): Promise<CompiledGraphStats> {
    const storedGraphs = await storageManager.listCompiledGraphs();

    return {
      inMemory: this.loadedCompiledGraphs.size,
      inStorage: storedGraphs.length,
      cacheHits: this.graphStats.cacheHits,
      cacheMisses: this.graphStats.cacheMisses,
      lastCompilationMs: this.graphStats.lastCompilationMs,
    };
  }

  /**
   * Async generator for pipelined token generation (Task #16)
   * This method simulates CPU/GPU pipelining where the CPU prepares the next token
   * while the GPU computes the current one, reducing idle time.
   */
  public async *generate(prompt: string, modelKey: string): AsyncGenerator<string> {
    log.info(`[RuntimeManager] Début de la génération pour ${modelKey} avec pipelining...`);
    
    // Get the engine for this model
    const engine = await this.getEngineFor(modelKey);
    
    // If the engine has the new generate method, use it
    if (typeof (engine as any).generate === 'function' && (engine as any).generate.constructor.name === 'AsyncGeneratorFunction') {
      // Use the engine's built-in pipelining
      for await (const chunk of (engine as any).generate(prompt, modelKey)) {
        yield chunk;
      }
    } else {
      // Fallback to traditional streaming
      let fullResponse = '';
      await new Promise<void>((resolve) => {
        engine.generateStream(
          prompt,
          (chunk: string) => {
            fullResponse += chunk;
          }
        ).then(() => resolve());
      });
      
      // Split response into tokens and yield them
      const tokens = fullResponse.split(' ');
      for (const token of tokens) {
        yield token + ' ';
      }
    }
    
    log.info(`[RuntimeManager] Fin de la génération pour ${modelKey}.`);
  }

  /**
   * Récupère un moteur d'inférence, en s'assurant que le graphe est pré-compilé
   */
  public async getEngineFor(
    modelKey: string,
    onProgress?: CompilationProgressCallback
  ): Promise<IInferenceEngine> {
    // S'assurer que le graphe est chargé
    await this.loadCompiledModel(modelKey, onProgress);

    // Renvoyer le moteur actuel (la logique de génération est séparée)
    if (!this.engine) {
      throw new Error(`Aucun moteur disponible pour ${modelKey}`);
    }

    return this.engine;
  }

  /**
   * Vérifie si un modèle a un graphe pré-compilé disponible
   */
  public isGraphCached(modelKey: string): boolean {
    return this.loadedCompiledGraphs.has(modelKey);
  }

  /**
   * Vide le cache de graphes compilés (mémoire + OPFS)
   */
  public async clearCompiledGraphs(): Promise<void> {
    this.loadedCompiledGraphs.clear();
    this.graphStats.cacheHits = 0;
    this.graphStats.cacheMisses = 0;
    this.graphStats.lastCompilationMs = null;

    // Vider le répertoire graphs dans OPFS
    await storageManager.deleteDirectory('graphs', true);

    log.info('[Pre-Compile] Cache de graphes vidé');
  }

  /**
   * Utilitaire: simule un délai avec jitter
   */
  private async simulateDelay(baseMs: number, jitterMs: number): Promise<void> {
    const jitter = jitterMs * (Math.random() * 2 - 1);
    const delay = Math.max(0, baseMs + jitter);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Utilitaire: génère un hash de schéma simple
   */
  private generateSchemaHash(modelKey: string): string {
    // Hash simple basé sur le nom et la version
    const str = `${modelKey}:${COMPILED_GRAPH_VERSION}:${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Arrête le runtime et libère les ressources
   */
  public async shutdown(): Promise<void> {
    // Décharger tous les moteurs du pool
    for (const [key, entry] of this.enginePool.entries()) {
      try {
        await entry.engine.unload();
        log.debug(`Pool: déchargement de ${key}`);
      } catch (error) {
        log.warn(`Erreur lors du déchargement de ${key}:`, error as Error);
      }
    }
    this.enginePool.clear();

    this.engine = null;
    this.currentBackend = null;
    this.status = {
      isReady: false,
      backend: null,
      modelId: null,
      memoryUsage: 0,
      lastInferenceTime: null,
      totalInferences: this.status.totalInferences,
      gpuAvailable: this.gpuAvailable ?? false,
      gpuInfo: this.gpuInfo,
    };

    log.info('Runtime arrêté proprement');
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

  /**
   * Vérifie si un modèle est dans le pool
   */
  public isModelInPool(modelId: string, backend?: RuntimeBackend): boolean {
    if (backend) {
      return this.enginePool.has(`${backend}:${modelId}`);
    }
    for (const [key] of this.enginePool.entries()) {
      if (key.endsWith(`:${modelId}`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Vide le pool de moteurs
   */
  public async clearPool(): Promise<void> {
    for (const [key, entry] of this.enginePool.entries()) {
      if (!entry.isActive) {
        try {
          await entry.engine.unload();
          this.enginePool.delete(key);
          log.debug(`Pool: suppression de ${key}`);
        } catch (error) {
          log.warn(`Erreur lors de la suppression de ${key}:`, error as Error);
        }
      }
    }
    log.info('Pool vidé (moteurs inactifs)');
  }

  /**
   * Obtient le moteur approprié selon l'état du Circuit Breaker
   */
  public async getEngineFor(task: any): Promise<MockGPUEngine | MockCPUEngine> {
    // Met à jour les métriques
    this.metrics.state = this.circuitState;
    this.metrics.fallbackUntil = this.fallbackUntil;

    switch (this.circuitState) {
      case 'CLOSED':
        // Opération normale
        return this.gpuEngine;

      case 'OPEN':
        if (Date.now() < this.fallbackUntil) {
          logger.warn('RuntimeManager', 'Circuit OPEN. Fallback CPU.'); // ✅ Nouveau
          return this.cpuEngine;
        }
        // Le temps est écoulé, passe en HALF_OPEN
        this.circuitState = 'HALF_OPEN';
        this.successCount = 0;
        logger.info('RuntimeManager', 'Circuit HALF_OPEN. Test du GPU...'); // ✅ Nouveau
        sseStreamer.streamStatus("Test de stabilité du moteur principal...");
        // Continue vers HALF_OPEN ↓

      case 'HALF_OPEN':
        // On teste le GPU avec un timeout strict
        return this.gpuEngine;
    }
  }

  /**
   * Exécute une promesse avec un timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
  }

  /**
   * Notifie le Circuit Breaker d'un succès.
   */
  public handleSuccess(): void {
    this.metrics.totalSuccesses++;
    this.metrics.lastSuccessTime = Date.now();

    if (this.circuitState === 'HALF_OPEN') {
      this.successCount++;
      logger.info('RuntimeManager', `Test GPU réussi (${this.successCount}/${this.SUCCESS_THRESHOLD})`); // ✅ Nouveau

      if (this.successCount >= this.SUCCESS_THRESHOLD) {
        this.closeCircuit();
      }
    } else if (this.circuitState === 'CLOSED') {
      // Reset le compteur d'échecs si on était en état normal
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  /**
   * Notifie le Circuit Breaker d'un échec.
   */
  public handleFailure(): void {
    this.metrics.totalFailures++;
    this.metrics.lastFailureTime = Date.now();

    if (this.circuitState === 'HALF_OPEN') {
      // Échec pendant le test → retour immédiat en OPEN
      logger.error('RuntimeManager', 'Test GPU échoué. Retour en OPEN.', new Error('Test GPU failed')); // ✅ Nouveau
      this.tripCircuitBreaker();
      return;
    }

    this.failureCount++;
    logger.warn('RuntimeManager', `Échec GPU (${this.failureCount}/${this.FAILURE_THRESHOLD})`); // ✅ Nouveau

    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      this.tripCircuitBreaker();
    }
  }

  /**
   * Enregistre un rejet de tâche (backpressure)
   */
  public registerRejection(): void {
    this.rejectionCount++;
    this.metrics.rejectionCount = this.rejectionCount;
    logger.warn('RuntimeManager', `Rejet enregistré (${this.rejectionCount}/${this.REJECTION_THRESHOLD})`); // ✅ Nouveau
    
    if (this.rejectionCount >= this.REJECTION_THRESHOLD) {
      this.tripCircuitBreakerHard();
    }
  }

  /**
   * Ouvre le circuit de manière stricte (hard-open)
   */
  private tripCircuitBreakerHard(): void {
    logger.error('RuntimeManager', 'Tous les moteurs saturés, hard-open mode.', new Error('All engines saturated')); // ✅ Nouveau
    this.circuitState = 'OPEN';
    this.fallbackUntil = Date.now() + this.FALLBACK_DURATION;
    this.metrics.fallbackUntil = this.fallbackUntil;
    sseStreamer.streamStatus('Système en surcharge. Mise en pause temporaire.');
  }

  /**
   * Ouvre le circuit et passe en mode fallback.
   */
  private tripCircuitBreaker(): void {
    logger.error('RuntimeManager', '🚨 CIRCUIT OPEN ! Fallback CPU.', new Error('Circuit breaker opened')); // ✅ Nouveau
    this.circuitState = 'OPEN';
    this.fallbackUntil = Date.now() + this.FALLBACK_DURATION;
    this.failureCount = 0; // Reset pour le prochain cycle
    this.metrics.fallbackUntil = this.fallbackUntil;
    sseStreamer.streamStatus("Mode dégradé activé (CPU).");
  }

  /**
   * Ferme le circuit.
   */
  private closeCircuit(): void {
    logger.info('RuntimeManager', '✅ Circuit CLOSED. GPU stable.'); // ✅ Nouveau
    this.circuitState = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.rejectionCount = 0;
    sseStreamer.streamStatus("Moteur principal rétabli (GPU).";
  }

  /**
   * Vérifie si le système est en mode fallback
   */
  public isInFallbackMode(): boolean {
    return this.circuitState === 'OPEN' && Date.now() < this.fallbackUntil;
  }

  /**
   * Obtient les métriques du Circuit Breaker.
   */
  public getMetrics(): CircuitMetrics {
    return {
      ...this.metrics,
      state: this.circuitState,
      fallbackUntil: this.fallbackUntil,
      rejectionCount: this.rejectionCount
    };
  }

  // Méthode pour les tests
  public forceGpuFailure(fail: boolean) {
    this.gpuEngine.forceFailure(fail);
  }
}

// Export singleton
export const runtimeManager = new RuntimeManager();