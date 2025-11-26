import { taskExecutor } from '../../core/kernel/TaskExecutor';
import { modelManager } from '../../core/kernel/ModelManager';
import { memoryManager } from '../../core/kernel/MemoryManager';
import { responseCache } from '../../core/cache/ResponseCache';
import { sseStreamer } from '../../core/streaming/SSEStreamer';
import type { StreamEvent } from '../../core/streaming/SSEStreamer';
import { createLogger } from '../../lib/logger';

const log = createLogger('DialoguePlugin');

export class DialoguePlugin {
  private startTime: number = 0;
  private firstTokenTime: number | null = null;
  private tokenCount: number = 0;
  private defaultModelKey: string = 'gemma-2-2b';

  public async *startConversation(
    userPrompt: string,
    modelKey = this.defaultModelKey
  ): AsyncGenerator<StreamEvent> {
    yield* this.processStream(userPrompt, modelKey);
  }

  public async *processStream(
    userPrompt: string, 
    modelKey: string = this.defaultModelKey
  ): AsyncGenerator<StreamEvent> {
    this.startTime = Date.now();
    this.firstTokenTime = null;
    this.tokenCount = 0;

    try {
      const cached = responseCache.get(userPrompt, modelKey);
      if (cached) {
        yield {
          type: 'complete',
          data: { response: cached.response, fromCache: true, tokens: cached.tokens },
          timestamp: Date.now()
        };
        return;
      }

      try {
        const canLoad = memoryManager.canLoadModel(modelKey);
        if (!canLoad) {
          log.warn(`Mémoire insuffisante pour charger ${modelKey}`);
          
          const toUnload = memoryManager.getModelsToUnload(0.5);
          if (toUnload.length > 0) {
            log.info(`Suggestion: décharger ${toUnload.join(', ')} pour libérer VRAM`);
          } else {
            log.warn(`Impossible de libérer assez de VRAM - continuation en mode dégradé`);
          }
        }
      } catch (error) {
        log.warn('Erreur vérification VRAM, continuation:', error as Error);
      }

      const currentModel = modelManager.getCurrentModel();
      if (currentModel !== modelKey) {
        await modelManager.switchToModel(modelKey as any);
      }

      let fullResponse = '';
      
      for await (const chunk of taskExecutor.processStream(userPrompt)) {
        if (chunk.type === 'primary' && chunk.content) {
          if (!this.firstTokenTime) {
            this.firstTokenTime = Date.now();
            const ttft = this.firstTokenTime - this.startTime;
            sseStreamer.updateMetrics(ttft);
            log.info(`TTFT: ${ttft}ms`);
          }

          fullResponse += chunk.content;
          this.tokenCount++;

          await sseStreamer.streamToken(chunk.content);
          
          yield {
            type: 'token',
            data: chunk.content,
            timestamp: Date.now()
          };
        }
      }

      const endTime = Date.now();
      const totalTime = endTime - this.startTime;
      const tokensPerSecond = (this.tokenCount / totalTime) * 1000;

      log.info(`Génération complète: ${totalTime}ms, ${this.tokenCount} tokens, ${tokensPerSecond.toFixed(1)} tok/s`);

      yield {
        type: 'complete',
        data: {
          response: fullResponse,
          tokens: this.tokenCount,
          metrics: { totalTime, tokensPerSecond }
        },
        timestamp: Date.now()
      };

    } catch (error) {
      log.error('Erreur durant la génération:', error as Error);
      yield {
        type: 'error',
        data: { message: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: Date.now()
      };
    }
  }
}

export const dialogue = new DialoguePlugin();
