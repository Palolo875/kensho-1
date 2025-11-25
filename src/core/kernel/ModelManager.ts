import { MLCEngine, CreateMLCEngine, InitProgressReport } from "@mlc-ai/web-llm";
import { MODEL_CATALOG, ModelMeta } from "./ModelCatalog";

console.log("📦 Initialisation du ModelManager v2.0...");

export class ModelManager {
  private engine: MLCEngine | null = null;
  public readonly ready: Promise<void>;
  private _resolveReady!: () => void;
  private _rejectReady!: (error: any) => void;
  private currentModelKey: string | null = null;
  private isInitialized = false;

  constructor() {
    this.ready = new Promise<void>((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
  }

  public async init(
    defaultModelKey = "gemma-3-270m", 
    progressCallback?: (report: InitProgressReport) => void
  ) {
    if (this.isInitialized) {
      console.warn("[ModelManager] Init déjà appelé, ignoré.");
      return;
    }

    try {
      console.log("[ModelManager] Initialisation du moteur WebLLM...");
      
      const modelMeta = MODEL_CATALOG[defaultModelKey];
      if (!modelMeta) {
        throw new Error(`Modèle inconnu dans le catalogue : ${defaultModelKey}`);
      }

      console.log(`[ModelManager] Pré-chargement du modèle par défaut : ${modelMeta.model_id}`);
      
      const config: any = {};
      if (progressCallback) {
        config.initProgressCallback = progressCallback;
      }
      
      this.engine = await CreateMLCEngine(modelMeta.model_id, config);
      
      this.currentModelKey = defaultModelKey;
      this.isInitialized = true;
      this._resolveReady();
      console.log("✅ [ModelManager] Prêt. Le noyau de dialogue est opérationnel.");

    } catch (error) {
      console.error("[ModelManager] Échec critique de l'initialisation.", error);
      this._rejectReady(error);
      throw error;
    }
  }

  public async getEngine(): Promise<MLCEngine> {
    await this.ready;
    if (!this.engine) {
      throw new Error("Le moteur n'a pas pu être initialisé.");
    }
    return this.engine;
  }

  public async switchModel(modelKey: string, progressCallback?: (report: InitProgressReport) => void) {
    await this.ready;
    
    if (this.currentModelKey === modelKey) {
      console.log(`[ModelManager] Modèle ${modelKey} déjà chargé.`);
      return;
    }

    const modelMeta = MODEL_CATALOG[modelKey];
    if (!modelMeta) {
      throw new Error(`Modèle inconnu : ${modelKey}`);
    }
    
    console.log(`[ModelManager] Changement vers ${modelMeta.model_id}`);
    
    const config: any = {};
    if (progressCallback) {
      config.initProgressCallback = progressCallback;
    }
    
    await this.engine!.reload(modelMeta.model_id, config);
    
    this.currentModelKey = modelKey;
    console.log(`✅ [ModelManager] Modèle ${modelKey} chargé avec succès.`);
  }

  public async preloadModel(modelKey: string): Promise<void> {
    await this.ready;
    
    const modelMeta = MODEL_CATALOG[modelKey];
    if (!modelMeta) {
      throw new Error(`Modèle inconnu : ${modelKey}`);
    }
    
    console.log(`[ModelManager] Pré-chargement en arrière-plan : ${modelMeta.model_id}`);
    await this.engine!.reload(modelMeta.model_id);
  }

  public getCurrentModel(): string | null {
    return this.currentModelKey;
  }

  public isModelLoaded(modelKey: string): boolean {
    return this.currentModelKey === modelKey;
  }

  public getAvailableModels(): Record<string, ModelMeta> {
    return MODEL_CATALOG;
  }

  public async dispose() {
    if (this.engine) {
      console.log("[ModelManager] Libération des ressources...");
      await this.engine.unload();
      this.engine = null;
      this.currentModelKey = null;
      this.isInitialized = false;
    }
  }
}

export const modelManager = new ModelManager();
