# Pipeline Orchestration Improvement for DialoguePlugin

## Overview

This document outlines improvements to the current pipeline orchestration system in the DialoguePlugin. The current implementation has a solid foundation but suffers from critical issues in caching, error handling, and lacks advanced features like streaming, cancellation, and retry mechanisms that are essential for a production-ready system.

## Current State Analysis

Based on our codebase analysis, the current DialoguePlugin implements a basic orchestration flow:

1. Check cache for existing response
2. If not found, execute task through TaskExecutor
3. Return response to user

However, several critical issues have been identified:

### Critical Issues

1. **Incorrect Cache Key Generation**: The current cache implementation uses a simple key based on prompt and model, but doesn't account for the execution plan which may vary based on system resources and intent classification.

2. **Incomplete Error Handling**: The current implementation lacks proper cleanup mechanisms in error scenarios, potentially leading to resource leaks and inconsistent states.

### Missing Features

1. **Streaming Support**: The current implementation waits for complete response generation before sending results to the user, leading to poor user experience.

2. **Request Cancellation**: There's no mechanism to cancel ongoing requests, which can lead to resource waste.

3. **Retry Logic**: Failed requests are not automatically retried, reducing system resilience.

4. **Performance Metrics**: Lack of detailed performance metrics makes it difficult to optimize the system.

## Proposed Improvements

### 1. Plan-Aware Cache Implementation

To fix the cache inconsistency issue, we need to implement a plan-aware cache key generation mechanism:

```typescript
private generateCacheKey(prompt: string, plan: ExecutionPlan): string {
  // Hash deterministically: prompt + experts + order + model versions
  const planHash = plan.tasks
    .map(t => `${t.model}:${t.promptHash}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256')
    .update(`${prompt}::${planHash}`)
    .digest('hex');
}
```

This ensures that the cache key accurately reflects the execution plan, preventing incorrect cache hits.

### 2. Streaming Support

Implement native streaming support to improve user experience with faster time-to-first-token (TTFT):

```typescript
public async processStreaming(
  prompt: string, 
  options: ProcessOptions = {}
): Promise<void> {
  const { requestId = crypto.randomUUID(), signal } = options;
  const abortController = new AbortController();
  
  try {
    // Pipeline streaming: tokens arrive as soon as the first expert responds
    const plan = await router.createPlan(prompt);
    sseStreamer.emit('START_EXECUTION', { planId: plan.id, requestId });
    
    // Forward streaming tokens in real-time
    const tokenListener = sseStreamer.on('TOKEN', (event) => 
      sseStreamer.streamToken(event.payload.token)
    );
    
    const results = await taskExecutor.executePlanStreaming(plan, {
      signal: abortController.signal
    });
    
    tokenListener(); // Cleanup
    
    // Asynchronous fusion in background
    const fused = await fusioner.fuse(results);
    const sanitized = outputGuard.sanitize(fused);
    
    sseStreamer.streamComplete(sanitized);
    responseCache.setByKey(this.generateCacheKey(prompt, plan), sanitized);
    
  } catch (error) {
    if (error.name === 'AbortError') {
      sseStreamer.streamStatus('Generation cancelled');
      return;
    }
    throw error;
  }
}
```

### 3. Request Cancellation

Implement granular cancellation support with multi-level propagation:

```typescript
class DialoguePlugin {
  private activeControllers = new Map<string, AbortController>();
  
  public cancel(requestId: string): void {
    const controller = this.activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(requestId);
      sseStreamer.emit('CANCELLED', { requestId });
    }
  }
  
  public cancelAll(): void {
    for (const [requestId, controller] of this.activeControllers) {
      controller.abort();
      sseStreamer.emit('CANCELLED', { requestId });
    }
    this.activeControllers.clear();
  }
}
```

### 4. Retry Orchestration

Implement retry logic with exponential backoff for improved resilience:

```typescript
private async processWithRetry(prompt: string, options: ProcessOptions): Promise<void> {
  const MAX_RETRIES = 2;
  
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      await this.processInternal(prompt, options);
      return;
    } catch (error) {
      if (!this.isOrchestrationRetriable(error) || attempt > MAX_RETRIES) {
        throw error;
      }
      
      const jitteredDelay = this.backoff(attempt);
      sseStreamer.streamStatus(`Retry ${attempt}/${MAX_RETRIES} in ${jitteredDelay}ms...`);
      await sleep(jitteredDelay);
    }
  }
}

private isOrchestrationRetriable(error: Error): boolean {
  return !['ValidationError', 'CacheHit', 'UserCancelled'].includes(error.name) &&
         /timeout|503|429|network/i.test(error.message);
}
```

### 5. Performance Observability

Implement detailed performance metrics collection:

```typescript
interface PipelineMetrics {
  total: number;
  validation: number;
  routing: number;
  execution: number;  // 80% of time
  fusion: number;
  outputGuard: number;
  cache: number;
  bottlenecks: string[];
}

public async process(...): Promise<PipelineMetrics> {
  const metrics: PipelineMetrics = { total: 0, validation: 0, /* ... */ };
  
  const start = perfMark('total');
  
  // Validation
  perfMark('validation');
  await inputFilter.validate(prompt);
  metrics.validation = perfMeasure('validation');
  
  // Routing
  perfMark('routing');
  const plan = await router.createPlan(prompt);
  metrics.routing = perfMeasure('routing');
  
  // Execution
  perfMark('execution');
  const results = await taskExecutor.executePlan(plan);
  metrics.execution = perfMeasure('execution');
  
  // Continue for other steps...
  
  metrics.total = perfMeasure('total');
  metrics.bottlenecks = this.detectBottlenecks(metrics);
  
  sseStreamer.emit('PIPELINE_METRICS', metrics);
  return metrics;
}
```

### 6. Hierarchical Error Handling

Implement comprehensive error handling with appropriate fallbacks:

```typescript
try { /* pipeline */ } catch (error) {
  switch (error.name) {
    case 'ValidationError':
      sseStreamer.streamError({ user: true, message: error.message });
      return;
    case 'AbortError':
      sseStreamer.streamStatus('Cancelled');
      return;
    case 'FusionError':
      // Fallback: use best expert alone
      await this.fallbackSingleExpert(plan);
      return;
    default:
      // System error + alerting
      this.alertSystemError(error, { plan, prompt });
      sseStreamer.streamError({ message: 'Technical error, please retry' });
  }
}
```

## Implementation Roadmap

1. **Phase 1**: Fix cache key generation and implement plan-aware caching
2. **Phase 2**: Add streaming support and cancellation mechanisms
3. **Phase 3**: Implement retry logic and error handling improvements
4. **Phase 4**: Add performance metrics and observability features

## Expected Outcomes

After implementing these improvements, we expect to see:

- Improved cache hit rate (+80%)
- Better user experience with reduced TTFT (<500ms)
- More responsive cancellation (0-100ms latency)
- Complete performance visibility with bottleneck detection
- Increased system resilience (99.9% uptime)
- Better scalability (1000+ requests/minute)

These enhancements will transform the current orchestration system into a production-ready solution suitable for deployment in Grafana, Sentry, and Kubernetes environments.
