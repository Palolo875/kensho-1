/**
 * ModelManager v4.0 - Transformers.js + Qwen3-0.6B-ONNX
 * 
 * Utilise AutoTokenizer et AutoModelForCausalLM pour charger
 * le modèle Qwen3-0.6B-ONNX depuis Hugging Face avec streaming.
 * Téléchargement optionnel - demande à l'utilisateur la permission.
 */

import { AutoTokenizer, AutoModelForCausalLM, env } from '@xenova/transformers';
import { sseStreamer } from '../streaming/SSEStreamer';

// Configuration pour permettre le chargement depuis Hugging Face
env.allowLocalModels = false;
env.allowRemoteModels = true;

console.log("🧠✨ Initialisation du ModelManager v4.0 (Transformers.js + Qwen3-0.6B-ONNX)...");

export type ModelType = 'qwen3-0.6b' | 'mock';

export interface ModelInfo {
  id: ModelType;
  name: string;
  huggingFaceId: string;
  size: string;
  description: string;
  isDownloaded: boolean;
}

export interface DownloadProgress {
  percent: number;
  speed: number; // bytes/sec
  timeRemaining: number; // ms
  loaded: number; // bytes
  total: number; // bytes
  file?: string;
}

export type DownloadCallback = (progress: DownloadProgress) => void;

export class ModelManager {
  private tokenizer: any | null = null;
  private model: any | null = null;
  private _ready!: Promise<void>;
  private _resolveReady!: () => void;
  private _rejectReady!: (error: any) => void;
  private isInitialized = false;
  private isInitializing = false;
  private currentModelKey: ModelType = 'mock';
  private downloadedModels: Set<ModelType> = new Set();
  private downloadController: AbortController | null = null;
  private downloadStartTime = 0;
  private downloadedBytes = 0;

  constructor() {
    this.resetReadyPromise();
  }

  private resetReadyPromise() {
    this._ready = new Promise<void>((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
  }

  public get ready(): Promise<void> {
    return this._ready;
  }

  /**
   * Retourne la liste des modèles disponibles
   */
  public getAvailableModels(): ModelInfo[] {
    return [
      {
        id: 'qwen3-0.6b',
        name: 'Qwen3 0.6B ONNX',
        huggingFaceId: 'onnx-community/Qwen3-0.6B-ONNX',
        size: '~400MB',
        description: 'Modèle très léger et rapide',
        isDownloaded: this.downloadedModels.has('qwen3-0.6b')
      },
      {
        id: 'mock',
        name: 'Mode Simulation',
        huggingFaceId: 'mock',
        size: 'Aucun',
        description: 'Réponses simulées (pas de IA)',
        isDownloaded: true
      }
    ];
  }

  /**
   * Retourne le modèle actuellement actif
   */
  public getCurrentModel(): ModelType {
    return this.currentModelKey;
  }

  /**
   * Initialise avec le mode simulation (pas de téléchargement)
   */
  public async initMockMode() {
    this.currentModelKey = 'mock';
    this.downloadedModels.add('mock');
    this.isInitialized = true;
    this.isInitializing = false;
    this._resolveReady();
    console.log("✅ [ModelManager] Mode Simulation activé");
  }

  /**
   * Annule le téléchargement en cours
   */
  public cancelDownload() {
    if (this.downloadController) {
      this.downloadController.abort();
      this.downloadController = null;
    }
    this.isInitializing = false;
    console.log("[ModelManager] Téléchargement annulé");
  }

  /**
   * Pause/Resume du téléchargement via un callback
   */
  public pauseDownload() {
    console.log("[ModelManager] Pause du téléchargement...");
    // Note: pause réelle nécessite une abstraction à un niveau plus bas (workers)
    // Pour maintenant, on utilise cancel comme workaround
  }

  /**
   * Télécharge et initialise le modèle Qwen3 0.6B
   * À appeler UNIQUEMENT si l'utilisateur le demande
   */
  public async downloadAndInitQwen3(onProgress?: DownloadCallback) {
    if (this.downloadedModels.has('qwen3-0.6b')) {
      console.log("[ModelManager] Qwen3 déjà téléchargé");
      return;
    }

    if (this.isInitializing && this.currentModelKey === 'qwen3-0.6b') {
      console.warn("[ModelManager] Qwen3 en cours de téléchargement, attente...");
      await this.ready;
      return;
    }

    this.isInitializing = true;
    this.downloadController = new AbortController();
    this.downloadStartTime = Date.now();
    this.downloadedBytes = 0;
    const modelKey = "onnx-community/Qwen3-0.6B-ONNX";

    try {
      console.log(`[ModelManager] Pré-chargement du tokenizer...`);
      sseStreamer.streamInfo(`Chargement du tokenizer...`);
      
      this.tokenizer = await AutoTokenizer.from_pretrained(modelKey);
      
      console.log(`[ModelManager] ✅ Tokenizer chargé. Chargement du modèle...`);
      sseStreamer.streamInfo(`Chargement du modèle ${modelKey}...`);
      
      this.model = await AutoModelForCausalLM.from_pretrained(modelKey, {
        quantized: true,
        progress_callback: (progress: any) => {
          if (this.downloadController?.signal.aborted) {
            throw new Error('Download cancelled');
          }
          
          const percent = Math.round((progress.progress || 0) * 100);
          const now = Date.now();
          const elapsedMs = now - this.downloadStartTime;
          const elapsedSec = elapsedMs / 1000;
          
          // Estimation: Qwen3-0.6B = ~400MB total
          const estimatedTotalBytes = 400 * 1024 * 1024;
          const currentBytes = (percent / 100) * estimatedTotalBytes;
          const speed = currentBytes / (elapsedSec || 1);
          const remainingBytes = estimatedTotalBytes - currentBytes;
          const timeRemainingMs = remainingBytes / (speed || 1) * 1000;
          
          const progressData: DownloadProgress = {
            percent,
            speed,
            timeRemaining: Math.max(0, timeRemainingMs),
            loaded: Math.round(currentBytes),
            total: estimatedTotalBytes,
            file: progress.file
          };
          
          onProgress?.(progressData);
          console.log(`[ModelManager] Progression: ${progress.file} (${percent}%)`);
          sseStreamer.streamInfo(`Téléchargement: ${percent}%`);
        }
      });
      
      this.currentModelKey = 'qwen3-0.6b';
      this.downloadedModels.add('qwen3-0.6b');
      this.isInitialized = true;
      this.isInitializing = false;
      this.downloadController = null;
      
      this._resolveReady();
      console.log(`✅ [ModelManager] Qwen3-0.6B prêt pour générer du texte.`);
      sseStreamer.streamInfo(`Modèle prêt!`);

    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        console.log("[ModelManager] Téléchargement annulé par l'utilisateur");
        this.isInitializing = false;
        this.downloadController = null;
        this.resetReadyPromise();
        return;
      }
      console.error("[ModelManager] Erreur d'initialisation:", error);
      this.isInitializing = false;
      this.downloadController = null;
      this._rejectReady(error);
      this.resetReadyPromise();
      sseStreamer.streamError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Change le modèle actif
   */
  public async switchToModel(modelKey: ModelType): Promise<void> {
    if (modelKey === 'mock') {
      this.currentModelKey = 'mock';
      console.log("[ModelManager] Switched to mock mode");
      return;
    }

    if (modelKey === 'qwen3-0.6b') {
      if (!this.downloadedModels.has('qwen3-0.6b')) {
        throw new Error("Qwen3-0.6B n'a pas été téléchargé. Appelez downloadAndInitQwen3() d'abord.");
      }
      if (!this.model || !this.tokenizer) {
        throw new Error("Qwen3-0.6B n'a pas pu être initialisé");
      }
      this.currentModelKey = 'qwen3-0.6b';
      return;
    }
  }

  /**
   * Obtient le tokenizer et le modèle une fois prêts
   */
  public async getModelAndTokenizer(): Promise<{ model: any, tokenizer: any }> {
    await this.ready;
    
    if (this.currentModelKey === 'mock') {
      throw new Error("Mode mock activé - pas de vrai modèle");
    }

    if (!this.model || !this.tokenizer) {
      throw new Error("Le modèle ou le tokenizer ne sont pas initialisés.");
    }
    return { model: this.model, tokenizer: this.tokenizer };
  }

  /**
   * Génère du texte avec streaming via callback
   * Utilise le modèle actuellement chargé
   */
  public async generateStreaming(
    prompt: string,
    onToken: (token: string) => void,
    maxNewTokens: number = 256
  ): Promise<string> {
    if (this.currentModelKey === 'mock') {
      throw new Error("Mode mock - utilise DialoguePluginMock");
    }

    const { model, tokenizer } = await this.getModelAndTokenizer();
    
    try {
      console.log(`[ModelManager] Génération démarrée pour le prompt: "${prompt.substring(0, 50)}..."`);
      
      const inputs = tokenizer(prompt, { return_tensors: "pt" });
      
      let fullResponse = "";
      let lastDecodedLength = 0;
      
      const outputs = await model.generate({
        ...inputs,
        max_new_tokens: maxNewTokens,
        callback_function: (beams: any) => {
          try {
            const decoded = tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true });
            
            if (decoded.length > lastDecodedLength) {
              const newToken = decoded.substring(lastDecodedLength);
              lastDecodedLength = decoded.length;
              
              onToken(newToken);
              fullResponse += newToken;
            }
          } catch (e) {
            console.error("[ModelManager] Erreur dans callback:", e);
          }
        }
      });
      
      const finalOutput = tokenizer.decode(outputs[0], { skip_special_tokens: true });
      console.log(`[ModelManager] ✅ Génération terminée`);
      
      return finalOutput;
    } catch (error) {
      console.error("[ModelManager] Erreur de génération:", error);
      throw error;
    }
  }

  /**
   * Vérifie si un modèle est déjà téléchargé
   */
  public isModelDownloaded(modelKey: ModelType): boolean {
    return this.downloadedModels.has(modelKey);
  }
}

// Instance singleton
export const modelManager = new ModelManager();
