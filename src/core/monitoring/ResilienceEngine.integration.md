# ResilienceEngine Integration Guide

## Overview

This document explains how to integrate the ResilienceEngine with the existing TaskExecutor to enhance the robustness of agent calls in the Kensho system.

## Current Implementation

The ResilienceEngine provides the following capabilities:

1. **Timeout Management**: Precise timeout control using Promise.race
2. **Retry Logic**: Exponential backoff with jitter to prevent thundering herd
3. **Circuit Breaking**: Three-state circuit breaker to prevent cascading failures
4. **Error Classification**: Intelligent error categorization (retriable vs non-retriable)
5. **Metrics Collection**: Comprehensive observability with Prometheus-style metrics

## Integration Points

### 1. Modify TaskExecutor to Use ResilienceEngine

In [src/agents/oie/executor.ts](file:///c%3A/Users/dell/3D%20Objects/New%20folder%20%282%29/kensho-1/src/agents/oie/executor.ts), replace direct calls to `runtime.callAgent` with ResilienceEngine wrapped calls.

#### Before (current implementation):
```typescript
const result = await this.runtime.callAgent(
  step.agent as any,
  step.action,
  Object.keys(interpolatedArgs).length > 0 
    ? [interpolatedArgs] 
    : [],
  60000 // Timeout of 60s for the steps of debate
);
```

#### After (with ResilienceEngine):
```typescript
// Import ResilienceEngine
import { ResilienceEngine } from '../../core/monitoring';

// In the TaskExecutor class
private resilienceEngine = new ResilienceEngine();

// Replace the call with resilience patterns
const task = {
  model: `${step.agent}.${step.action}`,
  prompt: '', // Not used when args are provided
  args: Object.keys(interpolatedArgs).length > 0 ? [interpolatedArgs] : []
};

const result = await this.resilienceEngine.executeTask(task, this.runtime);
```

### 2. Update Error Handling

The ResilienceEngine returns structured results with status information:

```typescript
if (result.status === 'success') {
  // Handle successful result
  const actualResult = result.result;
} else {
  // Handle error
  throw new Error(`Task failed: ${result.error}`);
}
```

### 3. Accessing Metrics

You can monitor the resilience of your system by accessing metrics:

```typescript
const metrics = this.resilienceEngine.getMetrics();
console.log('Success rate:', metrics.success_rate);
console.log('Average retries:', metrics.avg_retries);
console.log('P95 latency:', metrics.p95_latency);
```

## Benefits of Integration

1. **Memory Leak Prevention**: Proper cleanup of timeouts prevents memory leaks
2. **Improved Reliability**: Retry logic with exponential backoff handles transient failures
3. **Reduced Load**: Circuit breaker prevents repeated calls to failing services
4. **Better Observability**: Detailed metrics enable monitoring and alerting
5. **Enhanced Performance**: Jitter prevents synchronized retries that cause thundering herd

## Model-Specific Timeouts

The ResilienceEngine supports model-specific timeouts:

- gpt-4-turbo: 45 seconds
- claude-3-opus: 120 seconds
- llama-3: 30 seconds
- Default: 200ms base delay

These can be adjusted in the MODEL_TIMEOUTS configuration object.

## Error Classification

The ResilienceEngine automatically classifies errors:

### Retriable Errors:
- HTTP 429, 503, 504
- Rate limiting
- Network timeouts
- Service overload
- GPU out of memory
- Temporary unavailability
- Fetch failures
- Connection resets

### Non-Retriable Errors:
- Invalid API keys
- Model not found
- Input too long
- Unauthorized access
- Forbidden access

## Circuit Breaker States

The three-state circuit breaker operates as follows:

1. **CLOSED**: Normal operation, requests allowed
2. **OPEN**: Failure threshold reached (5 consecutive failures), requests blocked
3. **HALF_OPEN**: Test state after timeout (30 seconds), allows one request

## Monitoring and Alerting

The ResilienceEngine provides Prometheus-style metrics:

- Success rate monitoring (alerts when < 95%)
- Latency distributions (P50, P95, P99)
- Retry counts
- Timeout occurrences

These metrics can be exposed via a `/metrics` endpoint for integration with monitoring systems like Grafana.