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

  constructor() {
    this.detectGPU();
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

  public isInitialized(): boolean {
    return this.initialized;
  }
}

export const memoryManager = new MemoryManager();
