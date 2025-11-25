import { taskExecutor } from '../../core/kernel/TaskExecutor';
import { modelManager } from '../../core/kernel/ModelManager';
import { memoryManager } from '../../core/kernel/MemoryManager';
import { responseCache } from '../../core/cache/ResponseCache';
import { sseStreamer } from '../../core/streaming/SSEStreamer';
import type { StreamEvent } from '../../core/streaming/SSEStreamer';

/**
 * DialoguePlugin - Plugin de dialogue Elite avec:
 * - Cache intelligent
 * - Streaming SSE
 * - Gestion VRAM
 * - Métriques performance
 * 
 * USAGE PRINCIPAL: startConversation()
 * C'est la méthode à utiliser depuis l'UI pour discuter avec Kensho.
 */
export class DialoguePlugin {
  private startTime: number = 0;
  private firstTokenTime: number | null = null;
  private tokenCount: number = 0;
  private defaultModelKey: string = 'phi-3-mini'; // ✅ Configurable au lieu de hardcodé

  /**
   * 🎯 POINT D'ENTRÉE PRINCIPAL POUR L'UI
   * 
   * Lance une conversation et retourne un générateur asynchrone
   * que l'UI peut consommer pour le streaming.
   * 
   * @param userPrompt - Le message de l'utilisateur
   * @param modelKey - Le modèle à utiliser (par défaut 'gemma-3-270m')
   * @returns Un générateur d'événements de streaming
   * 
   * @example
   * ```typescript
   * for await (const event of dialogue.startConversation("Hello!")) {
   *   if (event.type === 'token') {
   *     console.log(event.data); // Afficher le token
   *   }
   *   if (event.type === 'complete') {
   *     console.log("Réponse complète:", event.data.response);
   *   }
   * }
   * ```
   */
  public async *startConversation(
    userPrompt: string,
    modelKey = this.defaultModelKey
  ): AsyncGenerator<StreamEvent> {
    // Simplement appeler processStream qui gère tout
    yield* this.processStream(userPrompt, modelKey);
  }

  /**
   * Traite une requête utilisateur avec streaming
   * @param userPrompt - Requête utilisateur
   * @param modelKey - Modèle à utiliser (optionnel, défaut: gemma-3-270m)
   */
  public async *processStream(
    userPrompt: string, 
    modelKey: string = this.defaultModelKey
  ): AsyncGenerator<StreamEvent> {
    this.startTime = Date.now();
    this.firstTokenTime = null;
    this.tokenCount = 0;

    try {
      // 1. Vérifier le cache
      const cached = await responseCache.get(userPrompt, modelKey);
      if (cached) {
        yield {
          type: 'complete',
          data: { response: cached.response, fromCache: true, tokens: cached.tokens },
          timestamp: Date.now()
        };
        return;
      }

      // 2. Vérifier VRAM disponible (avec auto-unload si nécessaire)
      try {
        const canLoad = await memoryManager.canLoadModel(modelKey);
        if (!canLoad.can) {
          console.warn(`[DialoguePlugin] ⚠️ ${canLoad.reason}`);
          
          // TODO Sprint 16: Auto-unload réel nécessite ModelManager.unloadModel()
          // Pour l'instant, getModelsToUnload() suggère quoi décharger mais ne peut pas le faire
          // registerUnloaded() met juste à jour la comptabilité, pas la VRAM réelle
          const toUnload = memoryManager.getModelsToUnload(0.5);
          if (toUnload.length > 0) {
            console.log(`[DialoguePlugin] 💡 Suggestion: décharger ${toUnload.join(', ')} pour libérer VRAM`);
          } else {
            console.warn(`[DialoguePlugin] ⚠️ ${canLoad.reason} - Continuation en mode dégradé`);
          }
        }
      } catch (error) {
        console.warn('[DialoguePlugin] ⚠️ Erreur vérification VRAM, continuation:', error);
      }

      // 3. S'assurer que le modèle est chargé et marquer comme utilisé
      const currentModel = modelManager.getCurrentModel();
      if (currentModel !== modelKey) {
        await modelManager.switchModel(modelKey);
        // ✅ registerLoaded est déjà appelé dans ModelManager.switchModel()
      } else {
        // ✅ Juste toucher si déjà chargé
        try {
          memoryManager.touch(modelKey);
        } catch (e) {
          // Ignorer erreur touch (non critique)
        }
      }

      // 4. Stream la réponse via TaskExecutor
      let fullResponse = '';
      
      for await (const chunk of taskExecutor.processStream(userPrompt)) {
        if (chunk.type === 'primary' && chunk.content) {
          // Premier token = TTFT
          if (!this.firstTokenTime) {
            this.firstTokenTime = Date.now();
            const ttft = this.firstTokenTime - this.startTime;
            sseStreamer.updateMetrics(ttft);
            console.log(`[DialoguePlugin] ⚡ TTFT: ${ttft}ms`);
          }

          fullResponse += chunk.content;
          this.tokenCount++;

          // Stream le token
          await sseStreamer.streamToken(chunk.content);
          
          yield {
            type: 'token',
            data: chunk.content,
            timestamp: Date.now()
          };
        }

        if (chunk.type === 'fusion' && chunk.content) {
          fullResponse = chunk.content;
        }
      }

      // 5. Calculer les métriques finales
      const totalTime = Date.now() - this.startTime;
      const tokensPerSec = this.tokenCount / (totalTime / 1000);
      sseStreamer.updateMetrics(undefined, tokensPerSec);

      const metrics = {
        ttft: this.firstTokenTime ? this.firstTokenTime - this.startTime : 0,
        totalTime,
        tokens: this.tokenCount,
        tokensPerSec: tokensPerSec.toFixed(2)
      };

      console.log(`[DialoguePlugin] 📊 Métriques: ${this.tokenCount} tokens en ${totalTime}ms (${metrics.tokensPerSec} tok/s)`);

      // 6. Mettre en cache
      await responseCache.set(userPrompt, modelKey, fullResponse, this.tokenCount);

      // 7. Signaler completion
      await sseStreamer.streamComplete(fullResponse, metrics);

      yield {
        type: 'complete',
        data: { response: fullResponse, metrics },
        timestamp: Date.now()
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[DialoguePlugin] ❌ Erreur:', err);
      
      await sseStreamer.streamError(err);
      
      yield {
        type: 'error',
        data: { message: err.message, stack: err.stack },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Traite une requête en mode non-streaming (compatible)
   * @param userPrompt - Requête utilisateur
   * @param modelKey - Modèle à utiliser (optionnel)
   */
  public async process(userPrompt: string, modelKey?: string): Promise<string> {
    let finalResponse = '';

    for await (const event of this.processStream(userPrompt, modelKey)) {
      if (event.type === 'complete' && event.data.response) {
        finalResponse = event.data.response;
      }
    }

    return finalResponse;
  }

  /**
   * Retourne les stats du cache
   */
  public getCacheStats() {
    return responseCache.getStats();
  }

  /**
   * Retourne les stats VRAM
   */
  public getVRAMStats() {
    return memoryManager.getStats();
  }
}

export const dialoguePlugin = new DialoguePlugin();
