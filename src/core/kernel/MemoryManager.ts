import { MODEL_CATALOG, ModelKey, ModelPriority } from './ModelCatalog';
import { createLogger } from '../../lib/logger';

const log = createLogger('MemoryManager');

log.info('Initialisation du MemoryManager v2.0 (Elite - Enhanced)...');

interface GPUAdapterLike {
  requestDevice(): Promise<GPUDeviceLike>;
}

interface GPUDeviceLike {
  limits?: { maxBufferSize?: number };
  destroy(): void;
}

interface GPULike {
  requestAdapter(): Promise<GPUAdapterLike | null>;
}

export interface LoadedModelInfo {
  key: ModelKey;
  vram: number;
  loadedAt: number;
  lastAccessedAt: number;
  inferenceCount: number;
  totalInferenceTime: number;
  priority: ModelPriority;
  pinned: boolean;
}

export interface MemoryStats {
  totalVRAM: number;
  usedVRAM: number;
  availableVRAM: number;
  usagePercentage: number;
  loadedModelsCount: number;
  pinnedModelsCount: number;
}

export interface ModelUtilityScore {
  key: ModelKey;
  score: number;
  inferenceCount: number;
  timeSinceLastAccess: number;
  avgInferenceTime: number;
}

export type UnloadRecommendation = {
  modelKey: ModelKey;
  reason: string;
  priority: ModelPriority;
  utilityScore: number;
  reclaimableVRAM: number;
};

export type ReclaimResult = {
  success: boolean;
  reclaimedVRAM: number;
  unloadedModels: ModelKey[];
  errors: string[];
};

class MemoryManager {
  private loadedModels: Map<ModelKey, LoadedModelInfo> = new Map();
  private totalVRAM: number = 8;
  private initialized: boolean = false;

  // Buffer pools for memory management (Task #16)
  private bufferPools: Map<string, { 
    size: number, 
    available: number,
    activeAllocations: Array<{
      size: number,
      lastUse: number,
      scopeId?: string
    }>
  }> = new Map();

  // Event listeners for monitoring (Task #16)
  private listeners: Map<string, Function[]> = new Map();

  constructor() {
    this.detectGPU();
    
    // Initialize default buffer pools (Task #16)
    this.createPool('kv-cache', 50);      // Key-value cache
    this.createPool('activations', 30);   // Neural activations
    this.createPool('uniforms', 20);      // Uniform parameters
    
    // Start garbage collector (Task #16)
    this.startGarbageCollector();
  }

  private async detectGPU(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        const gpu = navigator.gpu as GPULike;
        const adapter = await gpu.requestAdapter();
        if (adapter) {
          const device = await adapter.requestDevice();
          const maxBufferSize = device.limits?.maxBufferSize || 0;
          this.totalVRAM = Math.max(4, Math.min(16, maxBufferSize / (1024 ** 3)));
          device.destroy();
          log.info(`GPU détecté: VRAM estimée à ${this.totalVRAM.toFixed(2)}GB`);
        }
      }
    } catch (error) {
      log.warn('GPU non détecté, utilisation de 8GB par défaut', error);
    }
    this.initialized = true;
  }

  public registerLoaded(modelKey: ModelKey): void {
    if (this.loadedModels.has(modelKey)) {
      const model = this.loadedModels.get(modelKey)!;
      model.lastAccessedAt = Date.now();
      log.info(`${modelKey} est déjà chargé, mise à jour du timestamp.`);
      return;
    }

    const modelInfo = MODEL_CATALOG[modelKey];
    if (!modelInfo) {
      log.error(`Tentative de charger un modèle inconnu: ${modelKey}`);
      return;
    }

    this.loadedModels.set(modelKey, {
      key: modelKey,
      vram: modelInfo.virtual_vram_gb,
      loadedAt: Date.now(),
      lastAccessedAt: Date.now(),
      inferenceCount: 0,
      totalInferenceTime: 0,
      priority: modelInfo.priority,
      pinned: modelInfo.pin,
    });

    log.info(`✅ Modèle "${modelKey}" chargé (VRAM: ${modelInfo.virtual_vram_gb}GB, Priority: ${modelInfo.priority})`);
    this.logStats();
  }

  public registerUnloaded(modelKey: ModelKey): void {
    const model = this.loadedModels.get(modelKey);
    if (!model) {
      log.warn(`Tentative de décharger un modèle non chargé: ${modelKey}`);
      return;
    }

    if (model.pinned) {
      log.warn(`⚠️ Impossible de décharger le modèle épinglé: ${modelKey}`);
      return;
    }

    if (this.loadedModels.delete(modelKey)) {
      log.info(`⛔ Modèle "${modelKey}" déchargé.`);
      this.logStats();
    }
  }

  public recordInference(modelKey: ModelKey, durationMs: number): void {
    const model = this.loadedModels.get(modelKey);
    if (model) {
      model.inferenceCount++;
      model.totalInferenceTime += durationMs;
      model.lastAccessedAt = Date.now();
    }
  }

  public canLoadModel(modelKey: ModelKey): boolean {
    const modelInfo = MODEL_CATALOG[modelKey];
    if (!modelInfo) {
      log.warn(`Modèle inconnu: ${modelKey}`);
      return false;
    }

    const requiredVRAM = modelInfo.virtual_vram_gb;
    const stats = this.getMemoryStats();
    const canLoad = requiredVRAM <= stats.availableVRAM;

    if (!canLoad) {
      log.warn(
        `Impossible de charger ${modelKey}: ` +
        `requis ${requiredVRAM}GB, disponible ${stats.availableVRAM.toFixed(2)}GB`
      );
    }

    return canLoad;
  }

  public getLoadedModels(): ModelKey[] {
    return Array.from(this.loadedModels.keys());
  }

  public getModelInfo(modelKey: ModelKey): LoadedModelInfo | undefined {
    return this.loadedModels.get(modelKey);
  }

  public touch(modelKey: ModelKey): void {
    const model = this.loadedModels.get(modelKey);
    if (model) {
      model.lastAccessedAt = Date.now();
    }
  }

  public getMemoryStats(): MemoryStats {
    const usedVRAM = Array.from(this.loadedModels.values()).reduce(
      (sum, model) => sum + model.vram,
      0
    );

    const pinnedCount = Array.from(this.loadedModels.values()).filter(
      m => m.pinned
    ).length;

    return {
      totalVRAM: this.totalVRAM,
      usedVRAM,
      availableVRAM: this.totalVRAM - usedVRAM,
      usagePercentage: (usedVRAM / this.totalVRAM) * 100,
      loadedModelsCount: this.loadedModels.size,
      pinnedModelsCount: pinnedCount,
    };
  }

  public getAvailableVRAM(): number {
    return this.getMemoryStats().availableVRAM;
  }

  public getTotalVRAM(): number {
    return this.totalVRAM;
  }

  private calculateUtilityScore(model: LoadedModelInfo): number {
    const now = Date.now();
    const ageMinutes = (now - model.lastAccessedAt) / (1000 * 60);
    const avgInferenceTime = model.inferenceCount > 0
      ? model.totalInferenceTime / model.inferenceCount
      : 0;

    const priorityWeight = {
      CRITICAL: 100,
      HIGH: 50,
      NORMAL: 20,
      LOW: 5,
    }[model.priority];

    const recencyScore = Math.max(0, 100 - ageMinutes);
    const usageScore = Math.min(100, model.inferenceCount * 10);
    const performanceScore = avgInferenceTime > 0 ? Math.min(100, 1000 / avgInferenceTime) : 0;

    return (
      priorityWeight * 0.4 +
      recencyScore * 0.3 +
      usageScore * 0.2 +
      performanceScore * 0.1
    );
  }

  public getUtilityScores(): ModelUtilityScore[] {
    const now = Date.now();
    return Array.from(this.loadedModels.values()).map(model => ({
      key: model.key,
      score: this.calculateUtilityScore(model),
      inferenceCount: model.inferenceCount,
      timeSinceLastAccess: now - model.lastAccessedAt,
      avgInferenceTime: model.inferenceCount > 0
        ? model.totalInferenceTime / model.inferenceCount
        : 0,
    }));
  }

  public suggestModelsToUnload(requiredVRAM: number): UnloadRecommendation[] {
    const stats = this.getMemoryStats();

    if (stats.availableVRAM >= requiredVRAM) {
      return [];
    }

    const needToFree = requiredVRAM - stats.availableVRAM;
    const recommendations: UnloadRecommendation[] = [];
    let totalReclaimable = 0;

    const unloadablModels = Array.from(this.loadedModels.values())
      .filter(model => !model.pinned)
      .map(model => ({
        model,
        utilityScore: this.calculateUtilityScore(model),
      }))
      .sort((a, b) => a.utilityScore - b.utilityScore);

    for (const { model, utilityScore } of unloadablModels) {
      if (totalReclaimable >= needToFree) break;

      recommendations.push({
        modelKey: model.key,
        reason: `Score d'utilité faible (${utilityScore.toFixed(2)})`,
        priority: model.priority,
        utilityScore,
        reclaimableVRAM: model.vram,
      });

      totalReclaimable += model.vram;
    }

    log.info(
      `Suggestions de déchargement: ${recommendations.map(r => r.modelKey).join(', ')} ` +
      `(libèrera ${totalReclaimable.toFixed(2)}GB sur ${needToFree.toFixed(2)}GB nécessaires)`
    );

    return recommendations;
  }

  public async reclaimMemory(requiredVRAM: number): Promise<ReclaimResult> {
    const recommendations = this.suggestModelsToUnload(requiredVRAM);
    const unloadedModels: ModelKey[] = [];
    const errors: string[] = [];
    let reclaimedVRAM = 0;

    for (const rec of recommendations) {
      try {
        const model = this.loadedModels.get(rec.modelKey);
        if (model && !model.pinned) {
          this.registerUnloaded(rec.modelKey);
          unloadedModels.push(rec.modelKey);
          reclaimedVRAM += rec.reclaimableVRAM;
        }
      } catch (error) {
        const errorMsg = `Erreur lors du déchargement de ${rec.modelKey}: ${error}`;
        errors.push(errorMsg);
        log.error(errorMsg);
      }
    }

    const success = reclaimedVRAM >= requiredVRAM;
    return {
      success,
      reclaimedVRAM,
      unloadedModels,
      errors,
    };
  }

  public logStats(): void {
    const stats = this.getMemoryStats();
    log.info(
      `Stats: ${stats.loadedModelsCount} modèles chargés (${stats.pinnedModelsCount} épinglés), ` +
      `${stats.usedVRAM.toFixed(2)}/${stats.totalVRAM}GB VRAM utilisée (${stats.usagePercentage.toFixed(1)}%).`
    );
  }

  public getMemoryReport(): {
    stats: MemoryStats;
    models: Array<{
      key: ModelKey;
      vram: number;
      loadedAt: number;
      ageMs: number;
      inferenceCount: number;
      avgInferenceTime: number;
      priority: ModelPriority;
      pinned: boolean;
      utilityScore: number;
    }>;
  } {
    const now = Date.now();
    const stats = this.getMemoryStats();

    return {
      stats,
      models: Array.from(this.loadedModels.values()).map(model => ({
        key: model.key,
        vram: model.vram,
        loadedAt: model.loadedAt,
        ageMs: now - model.loadedAt,
        inferenceCount: model.inferenceCount,
        avgInferenceTime: model.inferenceCount > 0
          ? model.totalInferenceTime / model.inferenceCount
          : 0,
        priority: model.priority,
        pinned: model.pinned,
        utilityScore: this.calculateUtilityScore(model),
      })),
    };
  }

  public reset(): void {
    const pinnedModels = Array.from(this.loadedModels.entries())
      .filter(([_, model]) => model.pinned);

    this.loadedModels.clear();

    for (const [key, model] of pinnedModels) {
      this.loadedModels.set(key, model);
    }

    log.info(
      `🗑️ MemoryManager réinitialisé. ` +
      `Modèles épinglés conservés: ${pinnedModels.length}`
    );
    this.logStats();
  }

  // ==================================================================
  // Buffer Pool Management Methods (Task #16)
  // ==================================================================

  /**
   * Creates a new buffer pool with the specified size
   */
  public createPool(poolName: string, sizeMB: number): void {
    if (this.bufferPools.has(poolName)) {
      log.warn(`Pool ${poolName} already exists`);
      return;
    }

    this.bufferPools.set(poolName, {
      size: sizeMB,
      available: sizeMB,
      activeAllocations: []
    });

    log.info(`Created buffer pool ${poolName} with ${sizeMB}MB`);
    this.emit('pool-created', { poolName, size: sizeMB });
  }

  /**
   * Allocates memory from a pool
   */
  public allocateFromPool(poolName: string, sizeMB: number, scopeId?: string): boolean {
    const pool = this.bufferPools.get(poolName);
    if (!pool) {
      log.warn(`Pool ${poolName} does not exist`);
      return false;
    }

    if (pool.available < sizeMB) {
      log.warn(`Insufficient memory in pool ${poolName}: requested ${sizeMB}MB, available ${pool.available}MB`);
      return false;
    }

    pool.available -= sizeMB;
    pool.activeAllocations.push({
      size: sizeMB,
      lastUse: Date.now(),
      scopeId
    });

    log.debug(`Allocated ${sizeMB}MB from pool ${poolName}`);
    this.emit('alloc', { poolName, size: sizeMB, scopeId });
    return true;
  }

  /**
   * Frees memory back to a pool
   */
  public freeToPool(poolName: string, sizeMB: number, scopeId?: string): void {
    const pool = this.bufferPools.get(poolName);
    if (!pool) {
      log.warn(`Pool ${poolName} does not exist`);
      return;
    }

    // Find and remove the allocation
    const index = pool.activeAllocations.findIndex(alloc => alloc.scopeId === scopeId);
    if (index !== -1) {
      pool.activeAllocations.splice(index, 1);
    }

    pool.available = Math.min(pool.size, pool.available + sizeMB);
    log.debug(`Freed ${sizeMB}MB to pool ${poolName}`);
    this.emit('free', { poolName, size: sizeMB, scopeId });
  }

  /**
   * Checks if allocation is possible without actually allocating
   */
  public canAllocate(poolName: string, sizeMB: number): boolean {
    const pool = this.bufferPools.get(poolName);
    if (!pool) {
      log.warn(`Pool ${poolName} does not exist`);
      return false;
    }

    return pool.available >= sizeMB;
  }

  /**
   * Gets statistics for all pools
   */
  public getPoolStats(): Record<string, { size: number, used: number, utilization: number }> {
    const stats: any = {};
    for (const [name, pool] of this.bufferPools) {
      const used = pool.size - pool.available;
      stats[name] = {
        size: pool.size,
        used,
        utilization: parseFloat((used / pool.size * 100).toFixed(1))
      };
    }
    return stats;
  }

  /**
   * Starts garbage collector for buffer pools
   */
  public startGarbageCollector(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [name, pool] of this.bufferPools) {
        // Filter out inactive allocations (older than 30 seconds)
        const initialLength = pool.activeAllocations.length;
        pool.activeAllocations = pool.activeAllocations.filter(alloc => {
          if (now - alloc.lastUse > 30000) {
            pool.available += alloc.size;
            log.debug(`[GC] Released ${alloc.size}MB from ${name}`);
            return false;
          }
          return true;
        });
        
        if (initialLength !== pool.activeAllocations.length) {
          log.info(`[GC] Cleaned up ${initialLength - pool.activeAllocations.length} allocations from ${name}`);
        }
      }
    }, 10000); // Execute every 10 seconds
  }

  /**
   * Adds event listener for monitoring
   */
  public addEventListener(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  /**
   * Emits events for monitoring
   */
  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(data);
      }
    }
  }

  public isInitialized(): boolean {
    return this.initialized;
  }
}

export const memoryManager = new MemoryManager();
