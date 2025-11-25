/**
 * ModelManager v4.0 - Transformers.js + Qwen3-0.6B-ONNX
 * 
 * Utilise AutoTokenizer et AutoModelForCausalLM pour charger
 * le modèle Qwen3-0.6B-ONNX depuis Hugging Face avec streaming.
 */

import { AutoTokenizer, AutoModelForCausalLM, env } from '@xenova/transformers';
import { sseStreamer } from '../streaming/SSEStreamer';

// Configuration pour permettre le chargement depuis Hugging Face
env.allowLocalModels = false;
env.allowRemoteModels = true;

console.log("🧠✨ Initialisation du ModelManager v4.0 (Transformers.js + Qwen3-0.6B-ONNX)...");

export class ModelManager {
  private tokenizer: any | null = null;
  private model: any | null = null;
  private _ready!: Promise<void>;
  private _resolveReady!: () => void;
  private _rejectReady!: (error: any) => void;
  private isInitialized = false;
  private isInitializing = false;

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
   * Initialise et précharge le modèle Qwen3 0.6B et son tokenizer
   */
  public async init(modelKey: string = "onnx-community/Qwen3-0.6B-ONNX") {
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
      console.log(`[ModelManager] Pré-chargement du tokenizer...`);
      sseStreamer.streamInfo(`Chargement du tokenizer...`);
      
      // Charger le tokenizer
      this.tokenizer = await AutoTokenizer.from_pretrained(modelKey);
      
      console.log(`[ModelManager] ✅ Tokenizer chargé. Chargement du modèle...`);
      sseStreamer.streamInfo(`Chargement du modèle ${modelKey}...`);
      
      // Charger le modèle avec callbacks de progression
      this.model = await AutoModelForCausalLM.from_pretrained(modelKey, {
        quantized: true,
        progress_callback: (progress: any) => {
          const percent = Math.round((progress.progress || 0) * 100);
          console.log(`[ModelManager] Progression: ${progress.file} (${percent}%)`);
          sseStreamer.streamInfo(`Téléchargement: ${percent}%`);
        }
      });
      
      this.isInitialized = true;
      this.isInitializing = false;
      
      this._resolveReady();
      console.log(`✅ [ModelManager] ${modelKey} est prêt pour générer du texte.`);
      sseStreamer.streamInfo(`Modèle prêt!`);

    } catch (error) {
      console.error("[ModelManager] Erreur d'initialisation:", error);
      this.isInitializing = false;
      this._rejectReady(error);
      this.resetReadyPromise();
      sseStreamer.streamError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Obtient le tokenizer et le modèle une fois prêts
   */
  public async getModelAndTokenizer(): Promise<{ model: any, tokenizer: any }> {
    await this.ready;
    if (!this.model || !this.tokenizer) {
      throw new Error("Le modèle ou le tokenizer ne sont pas initialisés.");
    }
    return { model: this.model, tokenizer: this.tokenizer };
  }

  /**
   * Génère du texte avec streaming via callback
   */
  public async generateStreaming(
    prompt: string,
    onToken: (token: string) => void,
    maxNewTokens: number = 256
  ): Promise<string> {
    const { model, tokenizer } = await this.getModelAndTokenizer();
    
    try {
      console.log(`[ModelManager] Génération démarrée pour le prompt: "${prompt.substring(0, 50)}..."`);
      
      // Tokeniser le prompt
      const inputs = tokenizer(prompt, { return_tensors: "pt" });
      
      let fullResponse = "";
      const promptLength = prompt.length;
      let lastDecodedLength = 0;
      
      // Générer avec callback
      const outputs = await model.generate({
        ...inputs,
        max_new_tokens: maxNewTokens,
        callback_function: (beams: any) => {
          try {
            // Décoder la séquence complète
            const decoded = tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true });
            
            // Extraire uniquement le nouveau token
            if (decoded.length > lastDecodedLength) {
              const newToken = decoded.substring(lastDecodedLength);
              lastDecodedLength = decoded.length;
              
              // Envoyer le token à l'UI
              onToken(newToken);
              fullResponse += newToken;
            }
          } catch (e) {
            console.error("[ModelManager] Erreur dans callback:", e);
          }
        }
      });
      
      // Décodage final
      const finalOutput = tokenizer.decode(outputs[0], { skip_special_tokens: true });
      console.log(`[ModelManager] ✅ Génération terminée`);
      
      return finalOutput;
    } catch (error) {
      console.error("[ModelManager] Erreur de génération:", error);
      throw error;
    }
  }
}

// Instance singleton
export const modelManager = new ModelManager();
