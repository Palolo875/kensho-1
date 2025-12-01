// src/services/GuardedKenshoService.ts
import { KenshoService, StreamChunk } from './KenshoService';
import { GuardedTaskExecutor } from '../core/kernel/GuardedTaskExecutor';
import { taskExecutor } from '../core/kernel';
import { ExecutionTraceContext } from '../core/kernel/ExecutionTraceContext';

export interface GuardedStreamChunk extends StreamChunk {
  // Extended interface if needed
}

export class GuardedKenshoService {
  private kenshoService: KenshoService;
  private guardedTaskExecutor: GuardedTaskExecutor;

  private static instance: GuardedKenshoService;

  private constructor() {
    this.kenshoService = KenshoService.getInstance();
    this.guardedTaskExecutor = new GuardedTaskExecutor(taskExecutor);
  }

  static getInstance(): GuardedKenshoService {
    if (!GuardedKenshoService.instance) {
      GuardedKenshoService.instance = new GuardedKenshoService();
    }
    return GuardedKenshoService.instance;
  }

  /**
   * Process user query with streaming response and security guardrails
   * Yields chunks in real-time for UI rendering
   */
  async *processStream(userPrompt: string, clientId: string = 'anonymous'): AsyncGenerator<GuardedStreamChunk> {
    const requestId = `kensho-guarded-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const trace = new ExecutionTraceContext(requestId);

    try {
      trace.addEvent('GUARDRAILS', 'GuardedKenshoService', 'query_received', 'start', { 
        prompt: userPrompt,
        clientId
      });

      // The guarded task executor handles all security checks internally
      // We just need to proxy the stream from the guarded executor
      let fullContent = '';
      for await (const chunk of this.guardedTaskExecutor.processStream(userPrompt, clientId)) {
        const chunkContent = chunk.content || '';
        fullContent += chunkContent;

        yield {
          type: chunk.type as 'primary' | 'expert' | 'fusion' | 'status' | 'complete' | 'error',
          content: chunkContent,
          requestId,
          trace: trace.getTrace(),
        };

        trace.addEvent('STREAM', 'GuardedTaskExecutor', 'chunk_received', 'progress', {
          chunkSize: chunkContent.length,
          totalSize: fullContent.length,
        });
      }

      trace.markCompleted('completed');

      yield {
        type: 'complete',
        content: fullContent,
        requestId,
        trace: trace.getTrace(),
      };
    } catch (error) {
      trace.addEvent('GUARDRAILS', 'GuardedKenshoService', 'error', 'error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      trace.markCompleted('failed');

      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Processing failed',
        requestId,
        trace: trace.getTrace(),
      };
    }
  }

  /**
   * Non-streaming processing with security guardrails (batch mode)
   */
  async process(userPrompt: string, clientId: string = 'anonymous'): Promise<any> {
    const chunks: string[] = [];
    let requestId = '';

    for await (const chunk of this.processStream(userPrompt, clientId)) {
      requestId = chunk.requestId;

      if (chunk.type === 'primary' || chunk.type === 'expert' || chunk.type === 'fusion') {
        chunks.push(chunk.content);
      }
    }

    return {
      requestId: requestId || `kensho-guarded-${Date.now()}`,
      content: chunks.join(''),
    };
  }

  /**
   * Get current execution statistics
   */
  getStats(): any {
    return {
      executorStats: this.guardedTaskExecutor.getStats(),
    };
  }

  /**
   * Cancel an active request
   */
  cancelRequest(requestId: string): void {
    // Forward to the underlying service
    // Note: In a real implementation, we'd need to track our own request IDs
  }
}