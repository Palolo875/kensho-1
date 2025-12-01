<<<<<<< HEAD
/**
 * MemoryManager (Production) - Gestionnaire de Mémoire Virtuelle
 * 
 * PHILOSOPHIE "USINE VIDE":
 * - Ne décharge AUCUN vrai modèle
 * - Manipule une liste interne de loadedModels
 * - Simule les calculs de VRAM basés sur un catalogue de mocks
 * - Fournit des informations au Router pour des décisions éclairées
 * 
 * FONCTIONNALITÉS:
 * - Suivi des modèles chargés en mémoire
 * - Calcul de poids virtuel (VRAM)
 * - Vérification de capacité avant chargement
 * - Suggestion de déchargement basée sur LRU
 */

import { MOCK_MODEL_CATALOG, MockModelKey } from './ModelCatalog';
=======
import { MODEL_CATALOG, ModelKey, ModelPriority } from './ModelCatalog';
>>>>>>> 5193e61d00f89ac6457425ba55d56a4f07171792
import { createLogger } from '../../lib/logger';

const log = createLogger('MemoryManager');

<<<<<<< HEAD
log.info('🧠 MemoryManager (Production) initialisé.');

type LoadedModelInfo = {
  key: MockModelKey;
  vram: number;
  loadedAt: number;
  lastAccessed: number; // Pour LRU tracking
};
=======
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
  private loadedModels: Map<MockModelKey, LoadedModelInfo> = new Map();
  private readonly TOTAL_VIRTUAL_VRAM_GB = 8; // Simule une machine avec 8GB de VRAM (machine moyenne)

  /**
   * Enregistre un modèle comme étant "chargé" en mémoire.
   */
  public registerLoaded(modelKey: MockModelKey): void {
    if (this.loadedModels.has(modelKey)) {
      log.info(`${modelKey} est déjà chargé.`);
      return;
    }
    const modelInfo = MOCK_MODEL_CATALOG[modelKey];
    if (!modelInfo) {
      log.error(`Tentative de charger un modèle inconnu: ${modelKey}`);
      return;
    }
    this.loadedModels.set(modelKey, {
      key: modelKey,
      vram: modelInfo.virtual_vram_gb,
      loadedAt: Date.now(),
      lastAccessed: Date.now(), // Pour LRU tracking
    });
    log.info(`✅ Modèle "${modelKey}" chargé (VRAM virtuelle: ${modelInfo.virtual_vram_gb}GB).`);
    this.logStats();
  }

  /**
   * Enregistre un modèle comme étant "déchargé".
   */
  public registerUnloaded(modelKey: MockModelKey): void {
    if (this.loadedModels.delete(modelKey)) {
      log.info(`⛔ Modèle "${modelKey}" déchargé.`);
      this.logStats();
    }
  }

  /**
   * Vérifie s'il y a assez de VRAM virtuelle pour charger un nouveau modèle.
   */
  public canLoadModel(modelKey: MockModelKey): boolean {
    const modelInfo = MOCK_MODEL_CATALOG[modelKey];
    if (!modelInfo) {
      log.warn(`Modèle inconnu: ${modelKey}`);
      return false;
    }

    const requiredVRAM = modelInfo.virtual_vram_gb;
    const usedVRAM = this.getUsedVRAM();
    const availableVRAM = this.TOTAL_VIRTUAL_VRAM_GB - usedVRAM;

    const canLoad = requiredVRAM <= availableVRAM;
    
    if (!canLoad) {
      log.warn(
        `Impossible de charger ${modelKey}: ` +
        `requis ${requiredVRAM}GB, disponible ${availableVRAM.toFixed(2)}GB`
      );
    }

    return canLoad;
  }

  /**
   * Retourne la liste des modèles chargés
   */
  public getLoadedModels(): MockModelKey[] {
    return Array.from(this.loadedModels.keys());
  }

  /**
   * Retourne les informations détaillées d'un modèle chargé
   */
  public getModelInfo(modelKey: MockModelKey): LoadedModelInfo | undefined {
    return this.loadedModels.get(modelKey);
  }

  /**
   * Met à jour le timestamp d'accès pour un modèle (pour LRU)
   */
  public touch(modelKey: MockModelKey): void {
    const model = this.loadedModels.get(modelKey);
    if (model) {
      model.lastAccessed = Date.now();
    }
  }

  /**
   * Calcule la VRAM totale utilisée
   */
  private getUsedVRAM(): number {
    return Array.from(this.loadedModels.values()).reduce(
      (sum, model) => sum + model.vram,
      0
    );
  }

  /**
   * Retourne la VRAM disponible
   */
  public getAvailableVRAM(): number {
    return this.TOTAL_VIRTUAL_VRAM_GB - this.getUsedVRAM();
  }

  /**
   * Retourne la VRAM totale du système
   */
  public getTotalVRAM(): number {
    return this.TOTAL_VIRTUAL_VRAM_GB;
  }

  /**
   * Suggère des modèles à décharger pour libérer de l'espace
   * Basé sur LRU (Least Recently Used)
   * @param requiredVRAM VRAM nécessaire en GB
   */
  public suggestModelsToUnload(requiredVRAM: number): MockModelKey[] {
    const currentAvailable = this.getAvailableVRAM();
    
    if (currentAvailable >= requiredVRAM) {
      return []; // Assez d'espace disponible
    }

    const needToFree = requiredVRAM - currentAvailable;
    const toUnload: MockModelKey[] = [];
    let freedVRAM = 0;

    // Trier par ordre d'accès (les moins récents en premier - vrai LRU)
    const sorted = Array.from(this.loadedModels.values())
      .sort((a, b) => a.lastAccessed - b.lastAccessed);

    for (const model of sorted) {
      if (freedVRAM >= needToFree) break;
      toUnload.push(model.key);
      freedVRAM += model.vram;
    }

    log.info(
      `Suggestion de déchargement: ${toUnload.join(', ')} ` +
      `(libèrera ${freedVRAM.toFixed(2)}GB sur ${needToFree.toFixed(2)}GB nécessaires)`
    );

    return toUnload;
  }

  /**
   * Affiche les statistiques de mémoire
   */
  public logStats(): void {
    const usedVRAM = this.getUsedVRAM();
    const percentage = ((usedVRAM / this.TOTAL_VIRTUAL_VRAM_GB) * 100).toFixed(1);
    
    log.info(
      `Stats: ${this.loadedModels.size} modèles chargés, ` +
      `${usedVRAM.toFixed(2)}/${this.TOTAL_VIRTUAL_VRAM_GB}GB VRAM utilisée (${percentage}%).`
    );
  }

  /**
   * Retourne un rapport détaillé de l'état de la mémoire
   */
  public getMemoryReport(): {
    totalVRAM: number;
    usedVRAM: number;
    availableVRAM: number;
    usagePercentage: number;
    loadedModelsCount: number;
    loadedModels: Array<{
      key: MockModelKey;
      vram: number;
      loadedAt: number;
      ageMs: number;
    }>;
  } {
    const usedVRAM = this.getUsedVRAM();
    const now = Date.now();

    return {
      totalVRAM: this.TOTAL_VIRTUAL_VRAM_GB,
      usedVRAM,
      availableVRAM: this.getAvailableVRAM(),
      usagePercentage: (usedVRAM / this.TOTAL_VIRTUAL_VRAM_GB) * 100,
      loadedModelsCount: this.loadedModels.size,
      loadedModels: Array.from(this.loadedModels.values()).map(model => ({
        key: model.key,
        vram: model.vram,
        loadedAt: model.loadedAt,
        ageMs: now - model.loadedAt,
      })),
    };
  }

  /**
   * Réinitialise complètement le gestionnaire (décharge tous les modèles)
   */
  public reset(): void {
    this.loadedModels.clear();
    log.info('🗑️ MemoryManager réinitialisé, tous les modèles déchargés.');
    this.logStats();
  }
}

export const memoryManager = new MemoryManager();
