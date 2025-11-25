/**
 * KenshoService - Bridges UI with multi-agent backend
 * Handles Router + TaskExecutor integration for streaming responses
 * 
 * Priority 4: Chat UI Integration
 */

import { Router } from '@/core/router';
import { taskExecutor } from '@/core/kernel';
import { ExecutionTraceContext } from '@/core/kernel/ExecutionTraceContext';

export interface StreamChunk {
  type: 'primary' | 'expert' | 'fusion' | 'status' | 'complete' | 'error';
  content: string;
  requestId: string;
  trace?: any;
  metadata?: any;
}

export interface KenshoResponse {
  requestId: string;
  content: string;
  trace: ExecutionTraceContext;
  metadata: {
    intent: string;
    strategy: string;
    capacityScore: number;
    duration: number;
  };
}

export class KenshoService {
  private router: Router;
  private static instance: KenshoService;

  private constructor() {
    this.router = new Router();
  }

  static getInstance(): KenshoService {
    if (!KenshoService.instance) {
      KenshoService.instance = new KenshoService();
    }
    return KenshoService.instance;
  }

  /**
   * Process user query with streaming response
   * Yields chunks in real-time for UI rendering
   */
  async *processStream(userPrompt: string): AsyncGenerator<StreamChunk> {
    const requestId = `kensho-${Date.now()}`;
    const trace = new ExecutionTraceContext(requestId);

    try {
      trace.addEvent('ROUTER', 'KenshoService', 'query_received', 'start', { prompt: userPrompt });

      // Step 1: Create execution plan
      trace.addTimedEvent('ROUTER', 'Router', 'create_plan', 50, 'success');
      const plan = await this.router.createPlan(userPrompt);
      
      trace.addEvent('KERNEL', 'Router', 'plan_created', 'success', {
        intent: plan.primaryTask.agentName,
        strategy: plan.strategy,
        score: plan.capacityScore
      });

      // Step 2: Stream execution
      trace.addTimedEvent('EXECUTOR', 'TaskExecutor', 'streaming_start', 10, 'success');
      
      let fullContent = '';
      for await (const chunk of taskExecutor.processStream(userPrompt)) {
        fullContent += chunk.content;
        
        yield {
          type: chunk.type as 'primary' | 'expert' | 'fusion' | 'status' | 'complete' | 'error',
          content: chunk.content,
          requestId,
          trace: trace.getTrace()
        };

        trace.addEvent('STREAM', 'TaskExecutor', 'chunk_received', 'progress', {
          chunkSize: chunk.content.length,
          totalSize: fullContent.length
        });
      }

      trace.markCompleted('completed');

      yield {
        type: 'complete',
        content: fullContent,
        requestId,
        trace: trace.getTrace(),
        metadata: {
          intent: plan.primaryTask.agentName,
          strategy: plan.strategy,
          capacityScore: plan.capacityScore,
          duration: trace.getTrace().totalDuration || 0
        }
      };
    } catch (error) {
      trace.addEvent('ENGINE', 'KenshoService', 'error', 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      trace.markCompleted('failed');

      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Processing failed',
        requestId,
        trace: trace.getTrace()
      };
    }
  }

  /**
   * Non-streaming processing (batch mode)
   */
  async process(userPrompt: string): Promise<KenshoResponse> {
    const chunks: string[] = [];
    let lastTrace: ExecutionTraceContext | null = null;
    let metadata = {
      intent: 'DIALOGUE',
      strategy: 'SERIAL',
      capacityScore: 0,
      duration: 0
    };

    for await (const chunk of this.processStream(userPrompt)) {
      if (chunk.type === 'primary' || chunk.type === 'expert' || chunk.type === 'fusion') {
        chunks.push(chunk.content);
      }
      if (chunk.type === 'complete' && chunk.metadata) {
        metadata = chunk.metadata;
      }
    }

    return {
      requestId: `kensho-${Date.now()}`,
      content: chunks.join(''),
      trace: lastTrace || new ExecutionTraceContext('unknown'),
      metadata
    };
  }

  /**
   * Get current execution statistics
   */
  getStats() {
    return taskExecutor.getQueueStats();
  }

  /**
   * Cancel ongoing execution
   */
  cancel(requestId: string) {
    // TODO: Implement cancellation
  }
}

export const kenshoService = KenshoService.getInstance();
