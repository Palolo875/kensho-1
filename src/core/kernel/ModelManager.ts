/**
 * ModelManager v5.1 - Ultra-Léger avec Transformers.js
 * 
 * DistilGPT-2: ~150MB, téléchargement ultra rapide, réponses instantanées
 */

import { AutoTokenizer, AutoModelForCausalLM, env, PreTrainedTokenizer, PreTrainedModel } from '@xenova/transformers';
import { sseStreamer } from '../eventbus/SSEStreamerCompat';
import { createLogger } from '@/lib/logger';

const log = createLogger('ModelManager');

env.allowRemoteModels = true;

log.info("Initialisation du ModelManager v5.1 (DistilGPT-2 Ultra-Léger)...");

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

interface TransformersProgress {
  progress?: number;
  file?: string;
}

export class ModelManager {
  private tokenizer: PreTrainedTokenizer | null = null;
  private model: PreTrainedModel | null = null;
  private _ready!: Promise<void>;
  private _resolveReady!: () => void;
  private _rejectReady!: (error: Error) => void;
  private isInitializing = false;
  private currentModelKey: ModelType = 'mock';
  private downloadedModels: Set<ModelType> = new Set();
  private downloadStartTime = 0;
  private downloadCancelled = false;

  constructor() {
    this.resetReadyPromise();
  }

  private resetReadyPromise(): void {
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

  public async initMockMode(): Promise<void> {
    this.currentModelKey = 'mock';
    this.downloadedModels.add('mock');
    this.isInitializing = false;
    this._resolveReady();
    log.info("Mode Simulation activé");
  }

  public cancelDownload(): void {
    this.downloadCancelled = true;
    log.info("Téléchargement annulé");
  }

  public pauseDownload(): void {
    log.debug("Pause non supportée pour ce modèle");
  }

  public resumeDownload(): void {
    log.debug("Reprise non supportée pour ce modèle");
  }

  public isModelDownloaded(modelKey: ModelType): boolean {
    return this.downloadedModels.has(modelKey) || this.model !== null;
  }

  public async downloadAndInitQwen3(onProgress?: DownloadCallback): Promise<void> {
    if (this.downloadedModels.has('gpt2')) {
      log.debug("DistilGPT-2 déjà téléchargé");
      return;
    }

    if (this.isInitializing && this.currentModelKey === 'gpt2') {
      log.warn("Téléchargement déjà en cours...");
      await this.ready;
      return;
    }

    this.isInitializing = true;
    this.downloadStartTime = Date.now();
    this.downloadCancelled = false;
    const modelId = 'Xenova/distilgpt2';
    const estimatedTotalBytes = 150 * 1024 * 1024;

    try {
      log.info(`Chargement de DistilGPT-2...`);
      sseStreamer.streamInfo(`Chargement du tokenizer...`);

      this.tokenizer = await AutoTokenizer.from_pretrained(modelId);
      log.info(`Tokenizer prêt. Chargement du modèle...`);
      sseStreamer.streamInfo(`Chargement du modèle...`);

      this.model = await AutoModelForCausalLM.from_pretrained(modelId, {
        quantized: true,
        progress_callback: (progress: TransformersProgress) => {
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
          log.debug(`Progression: ${percent}%`);
          sseStreamer.streamInfo(`Téléchargement: ${percent}%`);
        }
      });

      this.currentModelKey = 'gpt2';
      this.downloadedModels.add('gpt2');
      this.isInitializing = false;

      onProgress?.({
        percent: 100,
        speed: 0,
        timeRemaining: 0,
        loaded: estimatedTotalBytes,
        total: estimatedTotalBytes,
        file: 'DistilGPT-2 - Prêt!'
      });

      this._resolveReady();
      log.info(`DistilGPT-2 prêt pour générer du texte.`);
      sseStreamer.streamInfo(`Modèle prêt!`);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err.message === 'Download cancelled') {
        log.info("Téléchargement annulé par l'utilisateur");
        this.isInitializing = false;
        this.resetReadyPromise();
        return;
      }
      log.error("Erreur lors du téléchargement", err);
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
      log.debug("Basculé en Mode Simulation");
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error("Erreur lors de la génération", err);
      throw err;
    }
  }
}

export const modelManager = new ModelManager();
