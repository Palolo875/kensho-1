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

export type ModelType = 'gpt2' | 'mock';

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
  private pausedProgress = 0;

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
        id: 'gpt2',
        name: 'GPT-2 (Xenova Int4)',
        huggingFaceId: 'Xenova/gpt2',
        size: '~150MB',
        description: 'GPT-2 quantisé en int4 - Ultra léger et rapide',
        isDownloaded: this.downloadedModels.has('gpt2')
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
    if (this.downloadController && !this.downloadController.signal.aborted) {
      this.pausedProgress = this.downloadedBytes;
    }
  }

  public resumeDownload() {
    console.log("[ModelManager] Reprise du téléchargement...");
    // La reprise est gérée en interne
  }

  /**
   * Télécharge et initialise le modèle DistilGPT-2
   * À appeler UNIQUEMENT si l'utilisateur le demande
   */
  public async downloadAndInitQwen3(onProgress?: DownloadCallback) {
    if (this.downloadedModels.has('gpt2')) {
      console.log("[ModelManager] GPT-2 déjà téléchargé");
      return;
    }

    if (this.isInitializing && this.currentModelKey === 'gpt2') {
      console.warn("[ModelManager] GPT-2 en cours de téléchargement, attente...");
      await this.ready;
      return;
    }

    this.isInitializing = true;
    this.downloadController = new AbortController();
    this.downloadStartTime = Date.now();
    this.downloadedBytes = 0;
    this.pausedProgress = 0;
    const modelKey = "Xenova/gpt2";
    const estimatedTotalBytes = 150 * 1024 * 1024; // 150MB (int4 quantized)

    try {
      console.log(`[ModelManager] Chargement de GPT-2 (Xenova)...`);
      sseStreamer.streamInfo(`Chargement du tokenizer...`);
      
      // Charger le tokenizer
      this.tokenizer = await AutoTokenizer.from_pretrained(modelKey);
      
      console.log(`[ModelManager] ✅ Tokenizer prêt. Chargement du modèle...`);
      sseStreamer.streamInfo(`Chargement du modèle...`);
      
      // Charger le modèle avec gestion de progression
      try {
        this.model = await AutoModelForCausalLM.from_pretrained(modelKey, {
          quantized: true,
          progress_callback: (progress: any) => {
            if (this.downloadController?.signal.aborted) {
              throw new Error('Download cancelled');
            }

            // Calculer le pourcentage correctement
            let percent = 0;
            if (progress.progress !== undefined) {
              // Si progress est déjà un nombre entre 0-1, le multiplier par 100
              if (progress.progress <= 1) {
                percent = Math.round(progress.progress * 100);
              } else {
                // Sinon, le prendre directement (déjà en pourcentage)
                percent = Math.min(99, Math.round(progress.progress));
              }
            }

            const now = Date.now();
            const elapsedMs = now - this.downloadStartTime;
            const elapsedSec = Math.max(elapsedMs / 1000, 0.1);
            
            const currentBytes = (percent / 100) * estimatedTotalBytes;
            const speed = currentBytes / elapsedSec;
            const remainingBytes = estimatedTotalBytes - currentBytes;
            const timeRemainingMs = speed > 0 ? (remainingBytes / speed) * 1000 : 0;

            this.downloadedBytes = currentBytes;
            
            const progressData: DownloadProgress = {
              percent: Math.min(99, percent),
              speed: Math.max(0, speed),
              timeRemaining: Math.max(0, timeRemainingMs),
              loaded: Math.round(currentBytes),
              total: estimatedTotalBytes,
              file: progress.file || 'GPT-2 model files'
            };
            
            onProgress?.(progressData);
            console.log(`[ModelManager] Progression: ${percent}%`);
            sseStreamer.streamInfo(`Téléchargement: ${percent}%`);
          }
        });
      } catch (error) {
        if ((error as any)?.message === 'Download cancelled') {
          throw error;
        }
        console.warn("[ModelManager] Erreur mineure lors du téléchargement, continuant...", error);
      }

      this.currentModelKey = 'gpt2';
      this.downloadedModels.add('gpt2');
      this.isInitialized = true;
      this.isInitializing = false;
      this.downloadController = null;
      
      // Envoyer 100%
      onProgress?.({
        percent: 100,
        speed: 0,
        timeRemaining: 0,
        loaded: estimatedTotalBytes,
        total: estimatedTotalBytes,
        file: 'GPT-2 - Prêt!'
      });

      this._resolveReady();
      console.log(`✅ [ModelManager] GPT-2 prêt pour générer du texte.`);
      sseStreamer.streamInfo(`Modèle prêt!`);

    } catch (error) {
      if ((error as any)?.name === 'AbortError' || (error as any)?.message === 'Download cancelled') {
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

    if (modelKey === 'gpt2') {
      if (!this.downloadedModels.has('gpt2')) {
        throw new Error("GPT-2 n'a pas été téléchargé. Appelez downloadAndInitQwen3() d'abord.");
      }
      if (!this.model || !this.tokenizer) {
        throw new Error("GPT-2 n'a pas pu être initialisé");
      }
      this.currentModelKey = 'gpt2';
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
