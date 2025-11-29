/**
 * KenshoService - Bridges UI with multi-agent backend
 * Handles Router + TaskExecutor integration for streaming responses
 *
 * Priority 4: Chat UI Integration
 */

import { Router, router } from '@/core/router';
import { taskExecutor } from '@/core/kernel';
import { ExecutionTraceContext } from '@/core/kernel/ExecutionTraceContext';

export interface StreamChunk {
  type: 'primary' | 'expert' | 'fusion' | 'status' | 'complete' | 'error';
  content: string;
  requestId: string;
  trace?: ReturnType<ExecutionTraceContext['getTrace']>;
  metadata?: {
    intent: string;
    strategy: string;
    capacityScore: number;
    duration: number;
  };
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

export interface KenshoServiceStats {
  queueStatus: ReturnType<typeof taskExecutor.getQueueStatus>;
  executorStats: ReturnType<typeof taskExecutor.getStats>;
  activeRequests: number;
  routerStats: ReturnType<typeof router.getStats>;
}

export class KenshoService {
  private routerInstance: Router;
  private static instance: KenshoService;
  private activeRequestIds: Set<string> = new Set();

  private constructor() {
    this.routerInstance = router;
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
    const requestId = `kensho-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const trace = new ExecutionTraceContext(requestId);

    // Track active request
    this.activeRequestIds.add(requestId);

    try {
      trace.addEvent('ROUTER', 'KenshoService', 'query_received', 'start', { prompt: userPrompt });

      // Step 1: Create execution plan
      const planStartTime = performance.now();
      const plan = await this.routerInstance.createPlan(userPrompt);
      const planDuration = performance.now() - planStartTime;

      trace.addTimedEvent('ROUTER', 'Router', 'create_plan', planDuration, 'success', {
        intent: plan.primaryTask.agentName,
        strategy: plan.strategy,
        score: plan.capacityScore,
      });

      trace.addEvent('KERNEL', 'Router', 'plan_created', 'success', {
        intent: plan.primaryTask.agentName,
        strategy: plan.strategy,
        score: plan.capacityScore,
      });

      // Step 2: Stream execution
      trace.addTimedEvent('EXECUTOR', 'TaskExecutor', 'streaming_start', 10, 'success');

      let fullContent = '';
      for await (const chunk of taskExecutor.processStream(userPrompt)) {
        // Check if cancelled
        if (!this.activeRequestIds.has(requestId)) {
          trace.addEvent('ENGINE', 'KenshoService', 'cancelled', 'error', {
            reason: 'Request cancelled by user',
          });
          trace.markCompleted('failed');

          yield {
            type: 'status',
            content: 'Request cancelled',
            requestId,
            trace: trace.getTrace(),
          };
          return;
        }

        const chunkContent = chunk.content || '';
        fullContent += chunkContent;

        yield {
          type: chunk.type as 'primary' | 'expert' | 'fusion' | 'status' | 'complete' | 'error',
          content: chunkContent,
          requestId,
          trace: trace.getTrace(),
        };

        trace.addEvent('STREAM', 'TaskExecutor', 'chunk_received', 'progress', {
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
        metadata: {
          intent: plan.primaryTask.agentName,
          strategy: plan.strategy,
          capacityScore: plan.capacityScore,
          duration: trace.getTrace().totalDuration || 0,
        },
      };
    } catch (error) {
      trace.addEvent('ENGINE', 'KenshoService', 'error', 'error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      trace.markCompleted('failed');

      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Processing failed',
        requestId,
        trace: trace.getTrace(),
      };
    } finally {
      // Clean up active request tracking
      this.activeRequestIds.delete(requestId);
    }
  }

  /**
   * Non-streaming processing (batch mode)
   */
  async process(userPrompt: string): Promise<KenshoResponse> {
    const chunks: string[] = [];
    let lastTrace: ExecutionTraceContext | null = null;
    let requestId = '';
    let metadata = {
      intent: 'DIALOGUE',
      strategy: 'SERIAL',
      capacityScore: 0,
      duration: 0,
    };

    for await (const chunk of this.processStream(userPrompt)) {
      requestId = chunk.requestId;

      if (chunk.type === 'primary' || chunk.type === 'expert' || chunk.type === 'fusion') {
        chunks.push(chunk.content);
      }
      if (chunk.type === 'complete' && chunk.metadata) {
        metadata = chunk.metadata;
      }
    }

    return {
      requestId: requestId || `kensho-${Date.now()}`,
      content: chunks.join(''),
      trace: lastTrace || new ExecutionTraceContext('unknown'),
      metadata,
    };
  }

  /**
   * Get current execution statistics
   */
  getStats(): KenshoServiceStats {
    return {
      queueStatus: taskExecutor.getQueueStatus(),
      executorStats: taskExecutor.getStats(),
      activeRequests: taskExecutor.getActiveRequestsCount(),
      routerStats: router.getStats(),
    };
  }

  /**
   * Get detailed execution history
   */
  getExecutionHistory(limit: number = 50) {
    return taskExecutor.getExecutionHistory(limit);
  }

  /**
   * Get router usage patterns
   */
  getUsagePatterns() {
    return router.getUsagePatterns();
  }

  /**
   * Get routing recommendations
   */
  getRecommendations() {
    return router.getRoutingRecommendations();
  }

  /**
   * Cancel ongoing execution by request ID
   */
  cancel(requestId: string): boolean {
    // Remove from active tracking (will cause stream to exit gracefully)
    const wasActive = this.activeRequestIds.has(requestId);
    this.activeRequestIds.delete(requestId);

    // Also try to cancel in TaskExecutor
    const taskCancelled = taskExecutor.cancelRequest(requestId);

    return wasActive || taskCancelled;
  }

  /**
   * Cancel all ongoing executions
   */
  cancelAll(): number {
    const activeCount = this.activeRequestIds.size;
    this.activeRequestIds.clear();

    // Also cancel in TaskExecutor
    const tasksCancelled = taskExecutor.cancelAllRequests();

    return Math.max(activeCount, tasksCancelled);
  }

  /**
   * Check if a request is currently active
   */
  isRequestActive(requestId: string): boolean {
    return this.activeRequestIds.has(requestId);
  }

  /**
   * Get list of active request IDs
   */
  getActiveRequestIds(): string[] {
    return Array.from(this.activeRequestIds);
  }

  /**
   * Reset all statistics
   */
  resetStats(): void {
    taskExecutor.resetStats();
    router.resetStats();
  }

  /**
   * Pause processing
   */
  pause(): void {
    taskExecutor.pauseQueues();
  }

  /**
   * Resume processing
   */
  resume(): void {
    taskExecutor.resumeQueues();
  }

  /**
   * Clear all queues
   */
  clearQueues(): void {
    taskExecutor.clearQueues();
  }
}

export const kenshoService = KenshoService.getInstance();
