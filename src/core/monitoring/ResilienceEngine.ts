// src/core/monitoring/ResilienceEngine.ts
import { WorkerName } from '../communication/types';
import { AgentRuntime } from '../agent-system/AgentRuntime';

// Type definitions
export interface Task {
  model: string;
  prompt: string;
  args?: any[];
}

export interface TaskResult {
  expert: string;
  result?: any;
  error?: string;
  status: 'success' | 'error';
}

// Configuration constants
const TASK_TIMEOUT_MS = 3000; // 3 seconds timeout per task
const MAX_RETRIES = 3;
const RESET_TIMEOUT_MS = 30000; // 30 seconds
const FAILURE_THRESHOLD = 5;

// Model-specific timeouts
const MODEL_TIMEOUTS: Record<string, number> = {
  'gpt-4-turbo': 45000,
  'claude-3-opus': 120000,
  'llama-3': 30000
};

// Circuit breaker states
enum CircuitState {
  CLOSED,
  OPEN,
  HALF_OPEN
}

// Circuit Breaker implementation
class CircuitBreaker {
  private state = new Map<string, CircuitState>();
  private failureCount = new Map<string, number>();
  private lastFailureTime = new Map<string, number>();

  canAttempt(model: string): boolean {
    const currentState = this.state.get(model) ?? CircuitState.CLOSED;
    const lastFailure = this.lastFailureTime.get(model) ?? 0;

    switch (currentState) {
      case CircuitState.CLOSED:
        return true;
      case CircuitState.OPEN:
        // Check if timeout has elapsed
        if (Date.now() - lastFailure > RESET_TIMEOUT_MS) {
          // Transition to half-open state
          this.state.set(model, CircuitState.HALF_OPEN);
          return true;
        }
        return false;
      case CircuitState.HALF_OPEN:
        // Allow one test request
        return true;
    }
  }

  recordFailure(model: string): void {
    const count = (this.failureCount.get(model) ?? 0) + 1;
    this.failureCount.set(model, count);
    this.lastFailureTime.set(model, Date.now());

    if (count >= FAILURE_THRESHOLD) {
      this.state.set(model, CircuitState.OPEN);
    }
  }

  recordSuccess(model: string): void {
    // Reset all counters on success
    this.failureCount.delete(model);
    this.lastFailureTime.delete(model);
    this.state.set(model, CircuitState.CLOSED);
  }
}

// Metrics collection
class ResilienceMetrics {
  // Prometheus-style counters
  private counters = {
    tasks_total: 0,
    tasks_success: 0,
    tasks_error: 0,
    retries_total: 0,
    timeouts_total: 0
  };

  // Histogram for latencies
  private latencies: number[] = [];

  recordSuccess(duration: number, retries: number): void {
    this.counters.tasks_total++;
    this.counters.tasks_success++;
    this.counters.retries_total += retries;
    this.latencies.push(duration);

    // Check for alerts
    this.checkAlerts();
  }

  recordFailure(error: Error): void {
    this.counters.tasks_total++;
    this.counters.tasks_error++;

    if (error.message.includes('timeout') || error.message.includes('TASK_TIMEOUT')) {
      this.counters.timeouts_total++;
    }

    this.checkAlerts();
  }

  private checkAlerts(): void {
    // Alert if success rate drops below 95% over 100 tasks
    if (this.successRate() < 0.95 && this.counters.tasks_total % 100 === 0) {
      console.error('[ALERT] Resilience degraded:', this.getStats());
    }
  }

  private successRate(): number {
    if (this.counters.tasks_total === 0) return 1;
    return this.counters.tasks_success / this.counters.tasks_total;
  }

  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    if (percentile === 0) return values[0];
    if (percentile === 100) return values[values.length - 1];

    const index = (percentile / 100) * (values.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) return values[lower];
    
    return values[lower] * (upper - index) + values[upper] * (index - lower);
  }

  getStats() {
    return {
      success_rate: ((this.counters.tasks_success / Math.max(1, this.counters.tasks_total)) * 100).toFixed(1) + '%',
      p95_latency: this.percentile(this.latencies, 95),
      avg_retries: (this.counters.retries_total / Math.max(1, this.counters.tasks_total)).toFixed(2)
    };
  }
}

// Global instances
const circuitBreaker = new CircuitBreaker();
const resilienceMetrics = new ResilienceMetrics();

/**
 * ResilienceEngine provides robust execution of tasks with timeout management,
 * retry logic, circuit breaking, and metrics collection.
 */
export class ResilienceEngine {
  /**
   * Executes a task with full resilience patterns including timeout, retry, circuit breaker, and metrics.
   * @param task The task to execute
   * @param runtime The AgentRuntime instance to use for execution
   * @returns TaskResult with success or error information
   */
  public async executeTask(task: Task, runtime: AgentRuntime): Promise<TaskResult> {
    const startTime = Date.now();

    // Check circuit breaker
    if (!circuitBreaker.canAttempt(task.model)) {
      return {
        expert: task.model,
        error: 'CIRCUIT_BREAKER_OPEN',
        status: 'error'
      };
    }

    try {
      const result = await this.executeTaskWithResilience(task, runtime);
      
      // Record success metrics
      const duration = Date.now() - startTime;
      resilienceMetrics.recordSuccess(duration, result.retriesUsed || 0);
      
      return {
        expert: task.model,
        result: result.result,
        status: 'success'
      };
    } catch (error) {
      // Record failure metrics
      resilienceMetrics.recordFailure(error as Error);
      
      return {
        expert: task.model,
        error: (error as Error).message,
        status: 'error'
      };
    }
  }

  /**
   * Internal method that handles the actual task execution with retry logic
   */
  private async executeTaskWithResilience(task: Task, runtime: AgentRuntime): Promise<{ result: any; retriesUsed: number }> {
    let retriesUsed = 0;

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      const abortController = new AbortController();

      try {
        const result = await this.executeSingleAttempt(task, runtime, abortController.signal);
        circuitBreaker.recordSuccess(task.model);
        return { result, retriesUsed };
      } catch (error) {
        circuitBreaker.recordFailure(task.model);

        if (!this.isRetriableError(error as Error) || attempt > MAX_RETRIES) {
          throw error;
        }

        // Backoff adaptatif + jitter (évite thundering herd)
        const delay = this.calculateAdaptiveBackoff(attempt, task.model);
        await this.delay(delay);
        retriesUsed++;
      } finally {
        // Clean up the abort controller
        abortController.abort();
      }
    }
    
    throw new Error('MAX_RETRIES_EXCEEDED');
  }

  /**
   * Execute a single attempt of the task with proper timeout management
   * Uses Promise.race for precise timeout control and memory leak prevention
   */
  private async executeSingleAttempt(task: Task, runtime: AgentRuntime, signal: AbortSignal): Promise<any> {
    // Extract agent and method from task
    const [agent, method] = task.model.split('.');
    if (!agent || !method) {
      throw new Error(`Invalid task model format: ${task.model}`);
    }

    // Create a promise that rejects after the timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('TASK_TIMEOUT'));
      }, TASK_TIMEOUT_MS);
      
      // Clean up timeout if promise resolves early
      timeoutPromise.finally(() => clearTimeout(timeoutId));
    });

    // Create the actual task execution promise
    const generatePromise = runtime.callAgent(agent as WorkerName, method, task.args || [task.prompt], TASK_TIMEOUT_MS);

    // Race between the task execution and timeout
    return Promise.race([generatePromise, timeoutPromise]);
  }

  /**
   * Calculate adaptive backoff with jitter to prevent thundering herd
   */
  private calculateAdaptiveBackoff(attempt: number, model: string): number {
    const baseDelay = MODEL_TIMEOUTS[model] ?? 200; // Par modèle : gpt-4=60s, claude=120s
    const exponent = Math.pow(2, attempt - 1);
    const maxDelay = 30000; // Cap 30s

    // Backoff + jitter ±30%
    const jitter = (Math.random() - 0.5) * 0.6;
    return Math.min(maxDelay, baseDelay * exponent * (1 + jitter));
  }

  /**
   * Delay execution for the specified number of milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Classify errors as retriable or not
   */
  private isRetriableError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    
    // Non-retriable errors - return false immediately
    const nonRetriablePatterns = [
      'invalid api key',
      'model not found',
      'input too long',
      'unauthorized',
      'forbidden'
    ];

    if (nonRetriablePatterns.some(pattern => msg.includes(pattern))) {
      return false;
    }

    // Retriable errors
    const retriablePatterns = [
      // HTTP errors
      '429', '503', '504', 'timeout', 'network',
      // LLM-specific errors
      'rate limit',
      'overload',
      'gpu out of memory',
      'temporarily unavailable',
      // Client-side errors
      'fetch failed',
      'connection reset'
    ];

    return retriablePatterns.some(pattern => msg.includes(pattern));
  }

  /**
   * Get current metrics statistics
   */
  public getMetrics(): any {
    return resilienceMetrics.getStats();
  }
}