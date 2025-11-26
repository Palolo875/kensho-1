import { resourceManager } from './ResourceManager';
import { MODEL_CATALOG } from './ModelCatalog';
import { createLogger } from '../../lib/logger';

const log = createLogger('MemoryManager');

log.info('Initialisation du MemoryManager v1.0 (Elite)...');

class MemoryManager {
  private loadedModels: Map<string, { size: number; lastUsed: number }> = new Map();
  private gpuDevice: any | null = null;
  private estimatedVRAM: number = 2;
  private readonly VRAM_SAFETY_MARGIN = 0.15;
  private gpuInitPromise: Promise<void> | null = null;
  
  private realBundleSizes: Map<string, number> = new Map();
  private readonly BUNDLE_CACHE_KEY = 'kensho_bundle_sizes_v1';

  constructor() {
    this.gpuInitPromise = this.initGPU();
    this.loadBundleSizeCache();
  }

  private async initGPU(): Promise<void> {
    if (typeof navigator === 'undefined') {
      log.warn('Navigator non disponible (Node/Bun), mode dégradé 2GB');
      return;
    }

    const nav = navigator as any;
    if (!nav.gpu) {
      log.warn('WebGPU non disponible, mode dégradé 2GB');
      return;
    }

    try {
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) {
        log.warn('Pas d\'adaptateur GPU');
        this.estimatedVRAM = 2;
        return;
      }

      this.gpuDevice = await adapter.requestDevice();
      
      const maxBufferSize = this.gpuDevice.limits?.maxBufferSize || 2147483648;
      this.estimatedVRAM = maxBufferSize / (1024 ** 3);
      
      log.info(`GPU détecté: ~${this.estimatedVRAM.toFixed(2)}GB VRAM estimée`);
    } catch (error) {
      log.warn('Erreur init GPU:', error as Error);
      this.estimatedVRAM = 2;
    }
  }

  private loadBundleSizeCache(): void {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const cached = localStorage.getItem(this.BUNDLE_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
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
      log.info(`Utilisation taille réelle pour ${modelKey}: ${realSize.toFixed(3)}GB`);
      return realSize;
    }

    const meta = MODEL_CATALOG[modelKey];
    if (!meta) {
      throw new Error(`Modèle inconnu: ${modelKey}`);
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

  public canLoadModel(modelKey: string): boolean {
    const requiredVRAM = this.calculateVRAM(modelKey);
    const availableVRAM = this.estimatedVRAM * (1 - this.VRAM_SAFETY_MARGIN);
    return requiredVRAM <= availableVRAM;
  }

  public getModelsToUnload(targetFreeRatio: number): string[] {
    const targetFree = this.estimatedVRAM * targetFreeRatio;
    let currentUsed = 0;
    const toUnload: string[] = [];

    const sorted = Array.from(this.loadedModels.entries())
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    for (const [modelKey, info] of sorted) {
      if (currentUsed >= targetFree) break;
      toUnload.push(modelKey);
      currentUsed += info.size;
    }

    return toUnload;
  }

  public registerUnloaded(modelKey: string): void {
    this.loadedModels.delete(modelKey);
  }
}

export const memoryManager = new MemoryManager();
