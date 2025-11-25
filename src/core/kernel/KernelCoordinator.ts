import { modelManager } from './ModelManager';
import { resourceManager } from './ResourceManager';
import { MODEL_CATALOG } from './ModelCatalog';
import { ModelLoadDecision, DeviceStatus } from './KernelTypes';
import { InitProgressReport } from '@mlc-ai/web-llm';

console.log("🎯 Initialisation du KernelCoordinator...");

class KernelCoordinator {
  private isInitialized = false;

  public async init(
    defaultModelKey = "gemma-3-270m",
    progressCallback?: (report: InitProgressReport) => void
  ) {
    if (this.isInitialized) {
      console.warn("[KernelCoordinator] Déjà initialisé, ignoré.");
      return;
    }

    try {
      console.log("[KernelCoordinator] Démarrage du noyau Kensho...");

      const status = await resourceManager.getStatus();
      
      if (status.memory.jsHeapUsed > 500) {
        throw new Error('Mémoire insuffisante pour démarrer Kensho (> 500MB utilisés)');
      }

      resourceManager.on('memory-critical', async (status: DeviceStatus) => {
        console.warn('[KernelCoordinator] ⚠️ Mémoire critique détectée:', {
          usageRatio: status.memory.usageRatio,
          jsHeapUsed: status.memory.jsHeapUsed,
          trend: status.memory.trend
        });
      });

      resourceManager.on('battery-low', async (status: DeviceStatus) => {
        console.warn('[KernelCoordinator] 🔋 Batterie faible détectée:', {
          level: status.battery?.level,
          isCharging: status.battery?.isCharging
        });
      });

      resourceManager.on('network-offline', async (status: DeviceStatus) => {
        console.warn('[KernelCoordinator] 📡 Perte de connexion réseau');
      });

      await modelManager.init(defaultModelKey, (report) => {
        console.log(`[KernelCoordinator] Chargement du modèle: ${report.text}`);
        if (progressCallback) {
          progressCallback(report);
        }
      });

      this.isInitialized = true;
      console.log('✅ [KernelCoordinator] Kensho kernel opérationnel');

    } catch (error) {
      console.error('[KernelCoordinator] Échec de l\'initialisation:', error);
      throw error;
    }
  }

  public async canLoadModel(modelKey: string, allowOfflineSwitch = true): Promise<ModelLoadDecision> {
    const status = await resourceManager.getStatus();
    const modelMeta = MODEL_CATALOG[modelKey];

    if (!modelMeta) {
      return { 
        canLoad: false, 
        reason: `Modèle inconnu: ${modelKey}` 
      };
    }

    const currentModel = modelManager.getCurrentModel();
    const isAlreadyLoaded = currentModel === modelKey;
    
    if (isAlreadyLoaded) {
      return { canLoad: true };
    }

    if (status.memory.usageRatio > 0.8) {
      return { 
        canLoad: false, 
        reason: 'Mémoire saturée (>80%)' 
      };
    }

    if (status.battery && status.battery.level < 0.15 && !status.battery.isCharging) {
      return { 
        canLoad: false, 
        reason: 'Batterie critique (<15%)' 
      };
    }

    if (!status.network.isOnline) {
      if (allowOfflineSwitch) {
        console.log('[KernelCoordinator] Mode hors ligne - Tentative de switch vers modèle possiblement en cache');
        return { canLoad: true };
      }
      return { 
        canLoad: false, 
        reason: 'Aucune connexion réseau' 
      };
    }

    if (status.network.effectiveType === 'slow-2g' || status.network.effectiveType === '2g') {
      return { 
        canLoad: false, 
        reason: 'Réseau trop lent pour télécharger un modèle' 
      };
    }

    if (status.powerSaveMode) {
      return {
        canLoad: false,
        reason: 'Mode économie d\'énergie actif'
      };
    }

    return { canLoad: true };
  }

  public async switchModel(
    modelKey: string, 
    progressCallback?: (report: InitProgressReport) => void
  ): Promise<void> {
    const decision = await this.canLoadModel(modelKey);
    
    if (!decision.canLoad) {
      throw new Error(`Impossible de charger le modèle: ${decision.reason}`);
    }

    console.log(`[KernelCoordinator] Changement de modèle vers ${modelKey}`);
    await modelManager.switchModel(modelKey, progressCallback);
  }

  public getCurrentModel(): string | null {
    return modelManager.getCurrentModel();
  }

  public async getSystemStatus(): Promise<DeviceStatus> {
    return await resourceManager.getStatus(true);
  }

  public getAvailableModels() {
    return MODEL_CATALOG;
  }

  public async dispose() {
    console.log('[KernelCoordinator] Libération des ressources...');
    await modelManager.dispose();
    resourceManager.destroy();
    this.isInitialized = false;
  }
}

export const kernelCoordinator = new KernelCoordinator();
