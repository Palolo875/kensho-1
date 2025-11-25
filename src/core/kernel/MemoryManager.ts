import { resourceManager } from './ResourceManager';
import { MODEL_CATALOG } from './ModelCatalog';

console.log("🧠✨ Initialisation du MemoryManager v1.0 (Elite)...");

/**
 * MemoryManager avec estimation VRAM réelle via WebGPU
 * Gère intelligemment la VRAM disponible avec stratégie LRU
 */
class MemoryManager {
  private loadedModels: Map<string, { size: number; lastUsed: number }> = new Map();
  private gpuDevice: any | null = null; // GPU Device (any pour compatibilité type)
  private estimatedVRAM: number = 2; // ✅ Initialiser à 2GB par défaut immédiatement
  private readonly VRAM_SAFETY_MARGIN = 0.15; // Garder 15% de VRAM libre
  private gpuInitPromise: Promise<void> | null = null;

  constructor() {
    this.gpuInitPromise = this.initGPU();
  }

  /**
   * Initialise WebGPU pour obtenir les limites réelles
   */
  private async initGPU(): Promise<void> {
    // ✅ Guard: vérifier navigator AVANT de référencer
    if (typeof navigator === 'undefined') {
      console.warn('[MemoryManager] Navigator non disponible (Node/Bun), mode dégradé 2GB');
      return;
    }

    const nav = navigator as any;
    if (!nav.gpu) {
      console.warn('[MemoryManager] WebGPU non disponible, mode dégradé 2GB');
      return;
    }

    try {
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) {
        console.warn('[MemoryManager] Pas d\'adaptateur GPU');
        this.estimatedVRAM = 2;
        return;
      }

      this.gpuDevice = await adapter.requestDevice();
      
      // Estimation VRAM basée sur maxBufferSize (plus réaliste)
      const maxBufferSize = this.gpuDevice.limits?.maxBufferSize || 2147483648; // 2GB default
      this.estimatedVRAM = maxBufferSize / (1024 ** 3); // Conversion en GB
      
      console.log(`[MemoryManager] 🎮 GPU détecté: ~${this.estimatedVRAM.toFixed(2)}GB VRAM estimée`);
    } catch (error) {
      console.warn('[MemoryManager] Erreur init GPU:', error);
      this.estimatedVRAM = 2; // Fallback 2GB
    }
  }

  /**
   * Calcule la VRAM requise pour un modèle
   * Formule: (params × bits/8) × 1.2 (overhead KV cache)
   */
  private calculateVRAM(modelKey: string): number {
    const meta = MODEL_CATALOG[modelKey];
    if (!meta) {
      throw new Error(`Modèle inconnu: ${modelKey}`);
    }

    // Parse size (ex: "270M" -> 0.27B, "1.5B" -> 1.5B)
    const sizeStr = meta.size.toUpperCase();
    const params = sizeStr.includes('B') 
      ? parseFloat(sizeStr) 
      : parseFloat(sizeStr) / 1000; // M vers B

    // Parse quantization (ex: "q4f16_1" -> 4 bits)
    const quantMatch = meta.quantization.match(/q?(\d+)/);
    const bits = quantMatch ? parseInt(quantMatch[1], 10) : 16;

    // Calcul VRAM: (params × bits/8) × 1.2 (overhead KV cache)
    return (params * bits / 8) * 1.2;
  }

  /**
   * Vérifie si assez de VRAM pour charger un modèle (avec probe réel)
   */
  public async canLoadModel(modelKey: string): Promise<{ can: boolean; reason?: string }> {
    // ✅ Attendre GPU init (ou timeout rapide si déjà en fallback)
    if (this.gpuInitPromise) {
      await Promise.race([
        this.gpuInitPromise,
        new Promise(resolve => setTimeout(resolve, 100)) // Max 100ms wait
      ]);
    }

    const requiredVRAM = this.calculateVRAM(modelKey);
    const usedVRAM = Array.from(this.loadedModels.values())
      .reduce((sum, m) => sum + m.size, 0);
    
    // ✅ estimatedVRAM = 2GB par défaut, donc availableVRAM > 0 toujours
    const availableVRAM = this.estimatedVRAM * (1 - this.VRAM_SAFETY_MARGIN) - usedVRAM;

    if (requiredVRAM > availableVRAM) {
      return {
        can: false,
        reason: `VRAM insuffisante: ${requiredVRAM.toFixed(2)}GB requis, ${availableVRAM.toFixed(2)}GB disponible`
      };
    }

    // Probe réel (tentative d'allocation) si WebGPU disponible
    if (this.gpuDevice) {
      try {
        const testSize = Math.min(requiredVRAM * 1024 ** 3, 100 * 1024 ** 2); // Max 100MB test
        const buffer = this.gpuDevice.createBuffer({
          size: testSize,
          usage: 0x0008 // GPUBufferUsage.STORAGE = 0x0008
        });
        buffer.destroy(); // Libérer immédiatement
      } catch (error) {
        return {
          can: false,
          reason: 'Échec du test d\'allocation GPU'
        };
      }
    }

    return { can: true };
  }

  /**
   * Propose une liste de modèles à décharger pour libérer de la VRAM (stratégie LRU)
   */
  public getModelsToUnload(requiredVRAM: number): string[] {
    const sorted = Array.from(this.loadedModels.entries())
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed); // Le plus ancien en premier

    const toUnload: string[] = [];
    let freedVRAM = 0;

    for (const [key, meta] of sorted) {
      toUnload.push(key);
      freedVRAM += meta.size;
      if (freedVRAM >= requiredVRAM) break;
    }

    return toUnload;
  }

  /**
   * Enregistre un modèle qui vient d'être chargé en mémoire
   */
  public registerLoaded(modelKey: string): void {
    const vram = this.calculateVRAM(modelKey);
    this.loadedModels.set(modelKey, {
      size: vram,
      lastUsed: Date.now()
    });
    console.log(`[MemoryManager] ✅ ${modelKey} enregistré (${vram.toFixed(2)}GB VRAM)`);
  }

  /**
   * Met à jour le timestamp pour indiquer utilisation récente (LRU)
   */
  public touch(modelKey: string): void {
    const model = this.loadedModels.get(modelKey);
    if (model) {
      model.lastUsed = Date.now();
    }
  }

  /**
   * Retire un modèle de la liste des modèles chargés
   */
  public registerUnloaded(modelKey: string): void {
    if (this.loadedModels.has(modelKey)) {
      this.loadedModels.delete(modelKey);
      console.log(`[MemoryManager] 🗑️ ${modelKey} déchargé`);
    }
  }

  /**
   * Retourne les stats VRAM
   */
  public getStats(): { used: number; models: number; total: number } {
    const used = Array.from(this.loadedModels.values())
      .reduce((sum, m) => sum + m.size, 0);
    
    return {
      used,
      models: this.loadedModels.size,
      total: this.estimatedVRAM
    };
  }
}

export const memoryManager = new MemoryManager();
