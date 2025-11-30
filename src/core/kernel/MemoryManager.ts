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
  private gpuDevice: GPUDeviceLike | null = null;
  private estimatedVRAM: number = 8;
  private readonly VRAM_SAFETY_MARGIN = 0.15;
  private readonly STATE_CACHE_KEY = 'kensho_memory_state_v2';
  private readonly BUNDLE_CACHE_KEY = 'kensho_bundle_sizes_v2';

  private realBundleSizes: Map<string, number> = new Map();

  constructor() {
    this.initGPU();
    this.loadState();
    this.loadBundleSizeCache();
    log.info('MemoryManager v2.0 prêt.');
  }

  private async initGPU(): Promise<void> {
    if (typeof navigator === 'undefined') {
      log.warn('Navigator non disponible (Node/Bun), mode dégradé 8GB simulé');
      return;
    }

    const gpu = (navigator as unknown as { gpu?: GPULike }).gpu;
    if (!gpu) {
      log.warn('WebGPU non disponible, mode dégradé 8GB simulé');
      return;
    }

    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        log.warn('Pas d\'adaptateur GPU, utilisation de 8GB simulé');
        this.estimatedVRAM = 8;
        return;
      }

      this.gpuDevice = await adapter.requestDevice();

      const maxBufferSize = this.gpuDevice.limits?.maxBufferSize || 2147483648;
      this.estimatedVRAM = Math.max(maxBufferSize / (1024 ** 3), 8);

      log.info(`GPU détecté: ~${this.estimatedVRAM.toFixed(2)}GB VRAM estimée`);
    } catch (error) {
      log.warn('Erreur init GPU:', error as Error);
      this.estimatedVRAM = 8;
    }
  }

  private loadState(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const cached = localStorage.getItem(this.STATE_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached) as Array<[ModelKey, LoadedModelInfo]>;
        let validEntries = 0;
        let invalidEntries = 0;

        for (const [key, info] of data) {
          if (this.validateLoadedModelInfo(key, info)) {
            const resyncedInfo = this.resyncModelFromCatalog(info);
            this.loadedModels.set(key as ModelKey, resyncedInfo);
            validEntries++;
          } else {
            invalidEntries++;
          }
        }

        if (invalidEntries > 0) {
          log.warn(`${invalidEntries} entrées invalides ignorées lors de la restauration`);
        }
        log.info(`État restauré: ${validEntries} modèles valides en mémoire virtuelle`);
      }
    } catch (error) {
      log.warn('Erreur chargement état, réinitialisation:', error as Error);
      this.loadedModels.clear();
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.STATE_CACHE_KEY);
      }
    }
  }

  private validateLoadedModelInfo(key: string, info: unknown): info is LoadedModelInfo {
    if (!info || typeof info !== 'object') return false;
    const obj = info as Record<string, unknown>;

    if (typeof obj.key !== 'string' || obj.key !== key) return false;
    if (typeof obj.vram !== 'number' || obj.vram <= 0 || !Number.isFinite(obj.vram)) return false;
    if (!MODEL_CATALOG[key as ModelKey]) return false;

    if (typeof obj.loadedAt !== 'number' || !Number.isFinite(obj.loadedAt) || obj.loadedAt <= 0) return false;
    if (typeof obj.lastAccessedAt !== 'number' || !Number.isFinite(obj.lastAccessedAt) || obj.lastAccessedAt <= 0) return false;
    if (typeof obj.inferenceCount !== 'number' || !Number.isFinite(obj.inferenceCount) || obj.inferenceCount < 0) return false;
    if (typeof obj.totalInferenceTime !== 'number' || !Number.isFinite(obj.totalInferenceTime) || obj.totalInferenceTime < 0) return false;

    return true;
  }

  private resyncModelFromCatalog(info: LoadedModelInfo): LoadedModelInfo {
    const catalogMeta = MODEL_CATALOG[info.key];
    if (catalogMeta) {
      return {
        ...info,
        priority: catalogMeta.priority,
        pinned: catalogMeta.pin,
        vram: catalogMeta.virtual_vram_gb || info.vram
      };
    }
    return info;
  }

  private saveState(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const data = Array.from(this.loadedModels.entries());
      localStorage.setItem(this.STATE_CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      log.warn('Erreur sauvegarde état:', error as Error);
    }
  }

  private loadBundleSizeCache(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const cached = localStorage.getItem(this.BUNDLE_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached) as Record<string, number>;
        this.realBundleSizes = new Map(Object.entries(data));
        log.info(`${this.realBundleSizes.size} tailles de bundles chargées depuis cache`);
      }
    } catch (error) {
      log.warn('Erreur chargement cache bundles:', error as Error);
    }
  }

  public registerBundleSize(modelKey: string, sizeGB: number): void {
    this.realBundleSizes.set(modelKey, sizeGB);

    if (typeof localStorage !== 'undefined') {
      try {
        const data = Object.fromEntries(this.realBundleSizes);
        localStorage.setItem(this.BUNDLE_CACHE_KEY, JSON.stringify(data));
        log.info(`Taille réelle enregistrée pour ${modelKey}: ${sizeGB.toFixed(3)}GB`);
      } catch (error) {
        log.warn('Erreur sauvegarde cache bundles:', error as Error);
      }
    }
  }

  private calculateVRAM(modelKey: string): number {
    if (this.realBundleSizes.has(modelKey)) {
      const realSize = this.realBundleSizes.get(modelKey)!;
      return realSize;
    }

    const meta = MODEL_CATALOG[modelKey as ModelKey];
    if (!meta) {
      log.warn(`Modèle inconnu: ${modelKey}, utilisation de 1GB par défaut`);
      return 1.0;
    }

    if (meta.virtual_vram_gb) {
      return meta.virtual_vram_gb;
    }

    const sizeStr = meta.size.toUpperCase();
    const params = sizeStr.includes('B')
      ? parseFloat(sizeStr)
      : parseFloat(sizeStr) / 1000;

    const quantMatch = meta.quantization.match(/q?(\d+)/);
    const bits = quantMatch ? parseInt(quantMatch[1], 10) : 16;

    const vram = (params * 1e9 * bits) / (8 * 1e9);
    return vram * 1.3;
  }

  public registerLoaded(modelKey: ModelKey): void {
    if (this.loadedModels.has(modelKey)) {
      log.info(`${modelKey} est déjà chargé, mise à jour du timestamp d'accès.`);
      const existing = this.loadedModels.get(modelKey)!;
      existing.lastAccessedAt = Date.now();
      this.saveState();
      return;
    }

    const meta = MODEL_CATALOG[modelKey];
    if (!meta) {
      log.error(`Tentative de charger un modèle inconnu: ${modelKey}`);
      return;
    }

    const vram = this.calculateVRAM(modelKey);
    const now = Date.now();

    this.loadedModels.set(modelKey, {
      key: modelKey,
      vram,
      loadedAt: now,
      lastAccessedAt: now,
      inferenceCount: 0,
      totalInferenceTime: 0,
      priority: meta.priority,
      pinned: meta.pin
    });

    log.info(`✅ Modèle "${modelKey}" chargé (VRAM: ${vram.toFixed(2)}GB, Priorité: ${meta.priority})`);
    this.saveState();
    this.logStats();
  }

  public registerUnloaded(modelKey: ModelKey, force: boolean = false): void {
    const model = this.loadedModels.get(modelKey);
    if (!model) {
      log.warn(`Tentative de décharger un modèle non chargé: ${modelKey}`);
      return;
    }

    if (model.pinned && !force) {
      log.warn(`⚠️ Modèle ${modelKey} est épinglé. Utilisez force=true pour forcer le déchargement.`);
      return;
    }

    if (model.pinned && force) {
      log.warn(`🔓 Déchargement forcé du modèle épinglé: ${modelKey}`);
    }

    const freedVRAM = model.vram;
    if (this.loadedModels.delete(modelKey)) {
      log.info(`⛔ Modèle "${modelKey}" déchargé (${freedVRAM.toFixed(2)}GB libérés).`);
      this.saveState();
      this.logStats();
    }
  }

  public registerInference(modelKey: ModelKey, durationMs: number): void {
    const model = this.loadedModels.get(modelKey);
    if (model) {
      model.inferenceCount++;
      model.totalInferenceTime += durationMs;
      model.lastAccessedAt = Date.now();
      this.saveState();
    }
  }

  public canLoadModel(modelKey: ModelKey): boolean {
    const requiredVRAM = this.calculateVRAM(modelKey);
    const availableVRAM = this.getAvailableVRAM();
    const canLoad = requiredVRAM <= availableVRAM;

    if (!canLoad) {
      log.warn(`⚠️ Pas assez de VRAM pour ${modelKey}: requis ${requiredVRAM.toFixed(2)}GB, disponible ${availableVRAM.toFixed(2)}GB`);
    }

    return canLoad;
  }

  public getUsedVRAM(): number {
    return Array.from(this.loadedModels.values()).reduce((sum, model) => sum + model.vram, 0);
  }

  public getAvailableVRAM(): number {
    const safeTotal = this.estimatedVRAM * (1 - this.VRAM_SAFETY_MARGIN);
    return safeTotal - this.getUsedVRAM();
  }

  public getStats(): MemoryStats {
    const usedVRAM = this.getUsedVRAM();
    const safeTotal = this.estimatedVRAM * (1 - this.VRAM_SAFETY_MARGIN);

    return {
      totalVRAM: this.estimatedVRAM,
      usedVRAM,
      availableVRAM: safeTotal - usedVRAM,
      usagePercentage: (usedVRAM / safeTotal) * 100,
      loadedModelsCount: this.loadedModels.size,
      pinnedModelsCount: Array.from(this.loadedModels.values()).filter(m => m.pinned).length
    };
  }

  public getLoadedModelsState(): LoadedModelInfo[] {
    return Array.from(this.loadedModels.values());
  }

  private calculateUtilityScore(model: LoadedModelInfo): number {
    const now = Date.now();
    const timeSinceLastAccess = (now - model.lastAccessedAt) / 1000;
    const ageInSeconds = (now - model.loadedAt) / 1000;

    const avgInferenceTime = model.inferenceCount > 0
      ? model.totalInferenceTime / model.inferenceCount
      : Infinity;

    const priorityMultiplier: Record<ModelPriority, number> = {
      'CRITICAL': 100,
      'HIGH': 10,
      'NORMAL': 1,
      'LOW': 0.1
    };

    const recencyScore = Math.max(0, 1 - (timeSinceLastAccess / 3600));
    const usageScore = Math.log(model.inferenceCount + 1);
    const efficiencyScore = avgInferenceTime !== Infinity ? 1000 / avgInferenceTime : 0;
    const ageScore = Math.min(1, ageInSeconds / 3600);

    const baseScore = (recencyScore * 0.3) + (usageScore * 0.4) + (efficiencyScore * 0.2) + (ageScore * 0.1);

    return baseScore * priorityMultiplier[model.priority];
  }

  public getModelUtilityScores(): ModelUtilityScore[] {
    const now = Date.now();

    return Array.from(this.loadedModels.values()).map(model => ({
      key: model.key,
      score: this.calculateUtilityScore(model),
      inferenceCount: model.inferenceCount,
      timeSinceLastAccess: (now - model.lastAccessedAt) / 1000,
      avgInferenceTime: model.inferenceCount > 0
        ? model.totalInferenceTime / model.inferenceCount
        : 0
    }));
  }

  public suggestModelToUnload(): UnloadRecommendation | null {
    const unpinnedModels = Array.from(this.loadedModels.values())
      .filter(m => !m.pinned);

    if (unpinnedModels.length === 0) {
      log.warn('Aucun modèle déchargeable (tous épinglés ou aucun chargé)');
      return null;
    }

    const withScores = unpinnedModels.map(m => ({
      model: m,
      score: this.calculateUtilityScore(m)
    }));

    const lowest = withScores.sort((a, b) => a.score - b.score)[0];
    const now = Date.now();
    const timeSinceAccess = (now - lowest.model.lastAccessedAt) / 1000;

    let reason = 'Score d\'utilité le plus bas';
    if (lowest.model.inferenceCount === 0) {
      reason = 'Jamais utilisé depuis le chargement';
    } else if (timeSinceAccess > 1800) {
      reason = `Non utilisé depuis ${Math.floor(timeSinceAccess / 60)} minutes`;
    } else if (lowest.model.priority === 'LOW') {
      reason = 'Priorité basse et faible utilisation';
    }

    const recommendation: UnloadRecommendation = {
      modelKey: lowest.model.key,
      reason,
      priority: lowest.model.priority,
      utilityScore: lowest.score,
      reclaimableVRAM: lowest.model.vram
    };

    log.info(`📊 Recommandation de déchargement: ${lowest.model.key} (${reason})`);
    return recommendation;
  }

  public getModelsToUnload(targetFreeVRAM: number): UnloadRecommendation[] {
    const recommendations: UnloadRecommendation[] = [];
    const currentAvailable = this.getAvailableVRAM();
    const additionalNeeded = targetFreeVRAM - currentAvailable;

    if (additionalNeeded <= 0) {
      log.info(`VRAM déjà suffisante: ${currentAvailable.toFixed(2)}GB disponible, cible: ${targetFreeVRAM.toFixed(2)}GB`);
      return recommendations;
    }

    let totalReclaimable = 0;

    const unpinnedModels = Array.from(this.loadedModels.values())
      .filter(m => !m.pinned)
      .map(m => ({ model: m, score: this.calculateUtilityScore(m) }))
      .sort((a, b) => a.score - b.score);

    for (const { model, score } of unpinnedModels) {
      if (totalReclaimable >= additionalNeeded) break;

      recommendations.push({
        modelKey: model.key,
        reason: `Libération de VRAM (besoin: ${additionalNeeded.toFixed(2)}GB supplémentaires)`,
        priority: model.priority,
        utilityScore: score,
        reclaimableVRAM: model.vram
      });

      totalReclaimable += model.vram;
    }

    log.info(`📊 ${recommendations.length} modèle(s) à décharger pour libérer ${totalReclaimable.toFixed(2)}GB (cible: ${additionalNeeded.toFixed(2)}GB)`);
    return recommendations;
  }

  public forceReclaim(targetFreeVRAM: number): ReclaimResult {
    const initialAvailable = this.getAvailableVRAM();
    log.warn(`🚨 Récupération forcée initiée: cible ${targetFreeVRAM.toFixed(2)}GB, actuel ${initialAvailable.toFixed(2)}GB`);

    const result: ReclaimResult = {
      success: false,
      reclaimedVRAM: 0,
      unloadedModels: [],
      errors: []
    };

    if (initialAvailable >= targetFreeVRAM) {
      log.info(`✅ VRAM déjà suffisante: ${initialAvailable.toFixed(2)}GB disponible`);
      result.success = true;
      return result;
    }

    const unpinnedModels = Array.from(this.loadedModels.values())
      .filter(m => !m.pinned)
      .map(m => ({ model: m, score: this.calculateUtilityScore(m) }))
      .sort((a, b) => a.score - b.score);

    if (unpinnedModels.length === 0) {
      result.errors.push('Aucun modèle déchargeable disponible');
      log.error('❌ Récupération échouée: aucun modèle déchargeable');
      return result;
    }

    for (const { model } of unpinnedModels) {
      const currentAvailable = this.getAvailableVRAM();
      if (currentAvailable >= targetFreeVRAM) {
        log.info(`✅ Cible atteinte: ${currentAvailable.toFixed(2)}GB disponible`);
        break;
      }

      if (this.loadedModels.delete(model.key)) {
        result.unloadedModels.push(model.key);
        result.reclaimedVRAM += model.vram;
        log.info(`💥 Force-déchargé: ${model.key} (+${model.vram.toFixed(2)}GB)`);
      } else {
        result.errors.push(`Échec déchargement: ${model.key}`);
      }
    }

    const finalAvailable = this.getAvailableVRAM();
    result.success = finalAvailable >= targetFreeVRAM;
    
    if (!result.success && result.unloadedModels.length > 0) {
      result.errors.push(`VRAM insuffisante après déchargement: ${finalAvailable.toFixed(2)}GB < ${targetFreeVRAM.toFixed(2)}GB cible`);
      log.warn(`⚠️ Récupération partielle: ${finalAvailable.toFixed(2)}GB disponible sur ${targetFreeVRAM.toFixed(2)}GB cible`);
    }

    this.saveState();
    this.logStats();

    log.info(`✅ Récupération terminée: ${result.reclaimedVRAM.toFixed(2)}GB libérés, ${result.unloadedModels.length} modèles déchargés, VRAM disponible: ${finalAvailable.toFixed(2)}GB`);
    return result;
  }

  public emergencyCleanup(): ReclaimResult {
    log.error('🆘 NETTOYAGE D\'URGENCE - Déchargement de tous les modèles non-épinglés');
    return this.forceReclaim(this.estimatedVRAM);
  }

  public logStats(): void {
    const stats = this.getStats();
    log.info(`📊 Stats: ${stats.loadedModelsCount} modèles (${stats.pinnedModelsCount} épinglés), ` +
      `${stats.usedVRAM.toFixed(2)}/${stats.totalVRAM.toFixed(2)}GB VRAM (${stats.usagePercentage.toFixed(1)}%)`);
  }

  public clearState(): void {
    this.loadedModels.clear();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.STATE_CACHE_KEY);
    }
    log.info('État du MemoryManager effacé');
  }

  public isModelLoaded(modelKey: ModelKey): boolean {
    return this.loadedModels.has(modelKey);
  }

  public getModelInfo(modelKey: ModelKey): LoadedModelInfo | null {
    return this.loadedModels.get(modelKey) || null;
  }
}

export const memoryManager = new MemoryManager();
