import { gemmaMock } from '../mocks/GemmaMock';
import { qwenCoderMock } from '../mocks/QwenCoderMock';
import { intentClassifierMock } from '../mocks/IntentClassifierMock';

console.log("🔌 Initialisation du DialoguePlugin v1.0 (Mode Simulation)...");

export interface StreamEvent {
  type: 'token' | 'complete' | 'error';
  data: any;
  timestamp: number;
}

const MOCK_EXECUTORS: Record<string, (prompt: string) => Promise<string>> = {
  "gemma-3-270m": gemmaMock,
  "gemma-2-2b": gemmaMock,
  "qwen2.5-coder-1.5b": qwenCoderMock,
};

export class DialoguePluginMock {
  private startTime: number = 0;

  public async *startConversation(
    userPrompt: string,
    modelKey = "gemma-3-270m"
  ): AsyncGenerator<StreamEvent> {
    this.startTime = Date.now();

    try {
      console.log(`[Plugin Mock] Conversation démarrée avec: "${userPrompt.substring(0, 50)}..."`);
      
      const intent = await intentClassifierMock(userPrompt);
      console.log(`[Plugin Mock] Intent détecté: ${intent}`);

      let executor = MOCK_EXECUTORS[modelKey];
      
      if (intent === 'CODE') {
        executor = MOCK_EXECUTORS["qwen2.5-coder-1.5b"];
      }

      if (!executor) {
        executor = gemmaMock;
      }

      const response = await executor(userPrompt);
      
      const words = response.split(' ');
      for (const word of words) {
        yield {
          type: 'token',
          data: word + ' ',
          timestamp: Date.now()
        };
        await new Promise(res => setTimeout(res, 30));
      }

      const totalTime = Date.now() - this.startTime;
      const tokens = words.length;

      yield {
        type: 'complete',
        data: {
          response,
          fromCache: false,
          tokens,
          metrics: {
            ttft: 150,
            totalTime,
            tokens,
            tokensPerSec: (tokens / (totalTime / 1000)).toFixed(2)
          }
        },
        timestamp: Date.now()
      };

      console.log(`[Plugin Mock] Réponse complète envoyée (${tokens} tokens, ${totalTime}ms)`);

    } catch (error) {
      console.error("[Plugin Mock] Erreur:", error);
      yield {
        type: 'error',
        data: { error: error instanceof Error ? error.message : String(error) },
        timestamp: Date.now()
      };
    }
  }
}
