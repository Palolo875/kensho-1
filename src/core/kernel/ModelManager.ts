/**
 * ModelManager v5.1 - Ultra-Léger avec Transformers.js
 * 
 * DistilGPT-2: ~150MB, téléchargement ultra rapide, réponses instantanées
 */

import { AutoTokenizer, AutoModelForCausalLM, env } from '@xenova/transformers';
import { sseStreamer } from '../streaming/SSEStreamer';

env.allowRemoteModels = true;

console.log("🧠✨ Initialisation du ModelManager v5.1 (DistilGPT-2 Ultra-Léger)...");

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
  speed: number;
  timeRemaining: number;
  loaded: number;
  total: number;
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
  private downloadStartTime = 0;
  private downloadCancelled = false;

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

  public getAvailableModels(): ModelInfo[] {
    return [
      {
        id: 'gpt2',
        name: 'DistilGPT-2 Ultra-Léger',
        huggingFaceId: 'Xenova/distilgpt2',
        size: '~150MB',
        description: 'Ultra rapide et léger - Télécharge en 30 sec',
        isDownloaded: this.downloadedModels.has('gpt2') || this.model !== null
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

  public getCurrentModel(): ModelType {
    return this.currentModelKey;
  }

  public async initMockMode() {
    this.currentModelKey = 'mock';
    this.downloadedModels.add('mock');
    this.isInitialized = true;
    this.isInitializing = false;
    this._resolveReady();
    console.log("✅ [ModelManager] Mode Simulation activé");
  }

  public cancelDownload() {
    this.downloadCancelled = true;
    console.log("[ModelManager] Téléchargement annulé");
  }

  public pauseDownload() {
    console.log("[ModelManager] Pause non supportée");
  }

  public resumeDownload() {
    console.log("[ModelManager] Reprise non supportée");
  }

  public isModelDownloaded(modelKey: ModelType): boolean {
    return this.downloadedModels.has(modelKey) || this.model !== null;
  }

  public async downloadAndInitQwen3(onProgress?: DownloadCallback) {
    if (this.downloadedModels.has('gpt2')) {
      console.log("[ModelManager] DistilGPT-2 déjà téléchargé");
      return;
    }

    if (this.isInitializing && this.currentModelKey === 'gpt2') {
      console.warn("[ModelManager] En cours de téléchargement...");
      await this.ready;
      return;
    }

    this.isInitializing = true;
    this.downloadStartTime = Date.now();
    this.downloadCancelled = false;
    const modelId = 'Xenova/distilgpt2';
    const estimatedTotalBytes = 150 * 1024 * 1024; // 150MB

    try {
      console.log(`[ModelManager] 🚀 Chargement de DistilGPT-2...`);
      sseStreamer.streamInfo(`Chargement du tokenizer...`);

      this.tokenizer = await AutoTokenizer.from_pretrained(modelId);
      console.log(`[ModelManager] ✅ Tokenizer prêt. Chargement du modèle...`);
      sseStreamer.streamInfo(`Chargement du modèle...`);

      // Charger le modèle
      this.model = await AutoModelForCausalLM.from_pretrained(modelId, {
        quantized: true,
        progress_callback: (progress: any) => {
          if (this.downloadCancelled) {
            throw new Error('Download cancelled');
          }

          let percent = 0;
          if (progress.progress !== undefined) {
            if (progress.progress <= 1) {
              percent = Math.round(progress.progress * 100);
            } else {
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

          const progressData: DownloadProgress = {
            percent: Math.min(99, percent),
            speed: Math.max(0, speed),
            timeRemaining: Math.max(0, timeRemainingMs),
            loaded: Math.round(currentBytes),
            total: estimatedTotalBytes,
            file: progress.file || 'DistilGPT-2'
          };
          
          onProgress?.(progressData);
          console.log(`[ModelManager] Progression: ${percent}%`);
          sseStreamer.streamInfo(`Téléchargement: ${percent}%`);
        }
      });

      this.currentModelKey = 'gpt2';
      this.downloadedModels.add('gpt2');
      this.isInitialized = true;
      this.isInitializing = false;

      onProgress?.({
        percent: 100,
        speed: 0,
        timeRemaining: 0,
        loaded: estimatedTotalBytes,
        total: estimatedTotalBytes,
        file: 'DistilGPT-2 - Prêt! ✅'
      });

      this._resolveReady();
      console.log(`✅ [ModelManager] DistilGPT-2 prêt pour générer du texte.`);
      sseStreamer.streamInfo(`Modèle prêt!`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err.message === 'Download cancelled') {
        console.log("[ModelManager] Téléchargement annulé");
        this.isInitializing = false;
        this.resetReadyPromise();
        return;
      }
      console.error("[ModelManager] Erreur:", err.message);
      this.isInitializing = false;
      this._rejectReady(err);
      this.resetReadyPromise();
      sseStreamer.streamError(err);
      throw err;
    }
  }

  public async switchToModel(modelKey: ModelType): Promise<void> {
    if (modelKey === 'mock') {
      this.currentModelKey = 'mock';
      console.log("[ModelManager] Mode Simulation");
      return;
    }

    if (modelKey === 'gpt2') {
      if (!this.model) {
        throw new Error("DistilGPT-2 n'a pas été téléchargé");
      }
      this.currentModelKey = 'gpt2';
      return;
    }
  }

  public async generateText(prompt: string, maxTokens = 50): Promise<string> {
    if (this.currentModelKey === 'mock') {
      await new Promise(r => setTimeout(r, 300));
      return "Réponse simulée: " + prompt.substring(0, 40) + "...";
    }

    if (!this.model || !this.tokenizer) {
      throw new Error("Modèle non chargé");
    }

    try {
      const inputs = await this.tokenizer(prompt);
      const output = await this.model.generate({
        ...inputs,
        max_new_tokens: maxTokens,
        temperature: 0.7,
        top_p: 0.95,
      });

      return this.tokenizer.decode(output[0]);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[ModelManager] Erreur génération:", err.message);
      throw err;
    }
  }
}

export const modelManager = new ModelManager();
