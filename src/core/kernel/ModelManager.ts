import { MLCEngine, CreateMLCEngine, InitProgressReport } from "@mlc-ai/web-llm";
import { MODEL_CATALOG, ModelMeta } from "./ModelCatalog";
import { memoryManager } from "./MemoryManager";
import { sseStreamer } from "../streaming/SSEStreamer";
import { WEBLLM_CONFIG } from "../../config/webllm.config";

console.log("📦 Initialisation du ModelManager v3.1 (Memory-Aware + Streaming)...");

export class ModelManager {
  private engine: MLCEngine | null = null;
  private _ready!: Promise<void>;
  private _resolveReady!: () => void;
  private _rejectReady!: (error: any) => void;
  private currentModelKey: string | null = null;
  private isInitialized = false;
  private isInitializing = false;

  constructor() {
    this.resetReadyPromise();
  }

  public get ready(): Promise<void> {
    return this._ready;
  }

  private resetReadyPromise() {
    this._ready = new Promise<void>((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
  }

  public async init(
    defaultModelKey = "gemma-2-2b", 
    progressCallback?: (report: InitProgressReport) => void
  ) {
    if (this.isInitialized) {
      console.warn("[ModelManager] Init déjà appelé, ignoré.");
      return;
    }

    if (this.isInitializing) {
      console.warn("[ModelManager] Init en cours, attente...");
      await this.ready;
      return;
    }

    this.isInitializing = true;

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
      
      // Use default WebLLM models (custom appConfig not needed for official models)
      this.engine = await CreateMLCEngine(modelMeta.model_id, config);
      
      // TODO Sprint 16: Tracker tailles réelles via CacheManager WebLLM ou fetch hooks
      // InitProgressReport.total n'est PAS la taille en bytes (juste un compteur de progression)
      
      this.currentModelKey = defaultModelKey;
      this.isInitialized = true;
      this.isInitializing = false;
      
      // ✨ Enregistrer le modèle chargé dans MemoryManager
      memoryManager.registerLoaded(defaultModelKey);
      
      // ✨ Notifier l'UI via SSE
      sseStreamer.streamInfo(`Model ${defaultModelKey} initialized and ready.`);
      
      this._resolveReady();
      console.log("✅ [ModelManager] Prêt. Le noyau de dialogue est opérationnel.");

    } catch (error) {
      console.error("[ModelManager] Échec critique de l'initialisation.", error);
      this.isInitializing = false;
      this._rejectReady(error);
      this.resetReadyPromise();
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
      // ✨ Marquer comme récemment utilisé (LRU)
      memoryManager.touch(modelKey);
      return;
    }

    const modelMeta = MODEL_CATALOG[modelKey];
    if (!modelMeta) {
      throw new Error(`Modèle inconnu : ${modelKey}`);
    }
    
    // ✨ Notifier l'UI du changement
    sseStreamer.streamInfo(`Checking memory for ${modelKey}...`);
    
    // ✨ Vérifier si assez de VRAM pour charger le nouveau modèle
    const canLoad = await memoryManager.canLoadModel(modelKey);
    if (!canLoad.can) {
      console.warn(`[ModelManager] ⚠️ ${canLoad.reason}`);
      // ✨ Notifier l'UI de l'erreur
      sseStreamer.streamError(new Error(`Cannot load ${modelKey}: ${canLoad.reason}`));
      throw new Error(`Impossible de charger ${modelKey}: ${canLoad.reason}`);
    }
    
    console.log(`[ModelManager] Changement vers ${modelMeta.model_id}`);
    sseStreamer.streamInfo(`Loading model ${modelKey}...`);
    
    const config: any = {};
    if (progressCallback) {
      config.initProgressCallback = progressCallback;
    }
    
    // ✨ Désenregistrer l'ancien modèle si présent
    if (this.currentModelKey) {
      memoryManager.registerUnloaded(this.currentModelKey);
    }
    
    // Use default WebLLM models (custom appConfig not needed for official models)
    await this.engine!.reload(modelMeta.model_id, config);
    
    // TODO Sprint 16: Tracker tailles réelles via CacheManager WebLLM ou fetch hooks
    // InitProgressReport.total n'est PAS la taille en bytes
    
    this.currentModelKey = modelKey;
    
    // ✨ Enregistrer le nouveau modèle chargé
    memoryManager.registerLoaded(modelKey);
    
    // ✨ Notifier l'UI du succès
    sseStreamer.streamInfo(`Model ${modelKey} loaded successfully.`);
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
      
      // ✨ Désenregistrer le modèle actuel
      if (this.currentModelKey) {
        memoryManager.registerUnloaded(this.currentModelKey);
      }
      
      await this.engine.unload();
      this.engine = null;
      this.currentModelKey = null;
      this.isInitialized = false;
    }
  }

  /**
   * ✨ Retourne les stats VRAM du MemoryManager
   */
  public getVRAMStats() {
    return memoryManager.getStats();
  }
}

export const modelManager = new ModelManager();
