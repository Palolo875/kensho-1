/**
 * ModelManager v5.0 - WebLLM + Llama-2-7b quantisé
 * 
 * Utilise WebLLM pour charger des modèles quantisés optimisés pour le browser.
 * Téléchargement optionnel - demande à l'utilisateur la permission.
 */

import * as webllm from '@mlc-ai/web-llm';
import { sseStreamer } from '../streaming/SSEStreamer';

console.log("🧠✨ Initialisation du ModelManager v5.0 (WebLLM + Llama-2-7b-q4f32)...");

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
  private engine: webllm.MLCEngine | null = null;
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

  /**
   * Retourne la liste des modèles disponibles
   */
  public getAvailableModels(): ModelInfo[] {
    return [
      {
        id: 'gpt2',
        name: 'Llama-2-7b (Quantisé Q4)',
        huggingFaceId: 'Llama-2-7b-chat-hf-q4f32-0',
        size: '~3.8GB',
        description: 'Llama-2 quantisé Q4 - Puissant et rapide avec WebLLM',
        isDownloaded: this.downloadedModels.has('gpt2') || this.engine !== null
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
    this.downloadCancelled = true;
    console.log("[ModelManager] Téléchargement annulé");
  }

  public pauseDownload() {
    console.log("[ModelManager] Pause non supportée avec WebLLM");
  }

  public resumeDownload() {
    console.log("[ModelManager] Reprise non supportée avec WebLLM");
  }

  public isModelDownloaded(modelKey: ModelType): boolean {
    return this.downloadedModels.has(modelKey) || this.engine !== null;
  }

  /**
   * Télécharge et initialise le modèle Llama-2-7b via WebLLM
   */
  public async downloadAndInitQwen3(onProgress?: DownloadCallback) {
    if (this.downloadedModels.has('gpt2')) {
      console.log("[ModelManager] Llama-2-7b déjà téléchargé");
      return;
    }

    if (this.isInitializing && this.currentModelKey === 'gpt2') {
      console.warn("[ModelManager] Llama-2-7b en cours de téléchargement, attente...");
      await this.ready;
      return;
    }

    this.isInitializing = true;
    this.downloadStartTime = Date.now();
    this.downloadCancelled = false;
    const modelId = 'Llama-2-7b-chat-hf-q4f32-0';
    const estimatedTotalBytes = 3.8 * 1024 * 1024 * 1024; // 3.8GB

    try {
      console.log(`[ModelManager] Chargement de Llama-2-7b via WebLLM...`);
      sseStreamer.streamInfo(`Initialisation du moteur WebLLM...`);

      this.engine = new webllm.MLCEngine();

      console.log(`[ModelManager] ✅ Moteur WebLLM initialisé. Chargement du modèle...`);
      sseStreamer.streamInfo(`Chargement du modèle Llama-2-7b...`);

      // Charger le modèle avec callback de progression
      await this.engine.reload(modelId, undefined, (info: any) => {
        if (this.downloadCancelled) {
          throw new Error('Download cancelled');
        }

        const percent = info.progress ? Math.round(info.progress * 100) : 0;
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
          file: info.file || 'Llama-2-7b model files'
        };

        onProgress?.(progressData);
        console.log(`[ModelManager] Progression: ${percent}%`);
        sseStreamer.streamInfo(`Téléchargement: ${percent}%`);
      });

      this.currentModelKey = 'gpt2';
      this.downloadedModels.add('gpt2');
      this.isInitialized = true;
      this.isInitializing = false;

      // Envoyer 100%
      onProgress?.({
        percent: 100,
        speed: 0,
        timeRemaining: 0,
        loaded: estimatedTotalBytes,
        total: estimatedTotalBytes,
        file: 'Llama-2-7b - Prêt!'
      });

      this._resolveReady();
      console.log(`✅ [ModelManager] Llama-2-7b prêt pour générer du texte.`);
      sseStreamer.streamInfo(`Modèle prêt!`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err.message === 'Download cancelled') {
        console.log("[ModelManager] Téléchargement annulé par l'utilisateur");
        this.isInitializing = false;
        this.resetReadyPromise();
        return;
      }
      console.error("[ModelManager] Erreur d'initialisation:", err.message);
      this.isInitializing = false;
      this._rejectReady(err);
      this.resetReadyPromise();
      sseStreamer.streamError(err);
      throw err;
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
      if (!this.downloadedModels.has('gpt2') && !this.engine) {
        throw new Error("Llama-2-7b n'a pas été téléchargé. Appelez downloadAndInitQwen3() d'abord.");
      }
      if (!this.engine) {
        throw new Error("Llama-2-7b n'a pas pu être initialisé");
      }
      this.currentModelKey = 'gpt2';
      return;
    }
  }

  /**
   * Génère du texte avec le modèle chargé
   */
  public async generateText(prompt: string, maxTokens = 128): Promise<string> {
    if (this.currentModelKey === 'mock') {
      // Mode simulation
      await new Promise(r => setTimeout(r, 500));
      return "Réponse simulée pour: " + prompt.substring(0, 50) + "...";
    }

    if (!this.engine) {
      throw new Error("Moteur non initialisé");
    }

    try {
      const response = await this.engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
      });

      return (response.choices[0].message as any).content || '';
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[ModelManager] Erreur génération:", err.message);
      throw err;
    }
  }
}

export const modelManager = new ModelManager();
