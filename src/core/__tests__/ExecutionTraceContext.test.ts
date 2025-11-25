/**
 * Test Suite: ExecutionTraceContext
 * Priority 1: Multi-couche debug tracing (5 levels)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionTraceContext } from '../kernel/ExecutionTraceContext';

describe('ExecutionTraceContext - Priority 1 ✅', () => {
  let trace: ExecutionTraceContext;
  const requestId = 'test-req-001';

  beforeEach(() => {
    trace = new ExecutionTraceContext(requestId);
  });

  it('should initialize with correct requestId', () => {
    expect(trace.getRequestId()).toBe(requestId);
  });

  it('should track events at different levels', () => {
    trace.addEvent('ROUTER', 'IntentClassifier', 'classification_started', 'start');
    trace.addEvent('KERNEL', 'KernelCoordinator', 'resource_check', 'progress');
    trace.addEvent('EXECUTOR', 'TaskExecutor', 'queue_assignment', 'success');
    trace.addEvent('STREAM', 'StreamHandler', 'chunk_received', 'progress');
    trace.addEvent('ENGINE', 'WebLLMEngine', 'inference_complete', 'success');

    const traceData = trace.getTrace();
    expect(traceData.events).toHaveLength(5);
  });

  it('should measure timed events correctly', () => {
    trace.addTimedEvent('ROUTER', 'IntentClassifier', 'classification_completed', 150, 'success', {
      intent: 'CODE',
      confidence: 0.95
    });

    const traceData = trace.getTrace();
    expect(traceData.events).toHaveLength(1);
    expect(traceData.events[0].duration).toBe(150);
    expect(traceData.events[0].data?.intent).toBe('CODE');
  });

  it('should accumulate total duration', () => {
    trace.addTimedEvent('ROUTER', 'Router', 'step1', 100, 'success');
    trace.addTimedEvent('KERNEL', 'Kernel', 'step2', 50, 'success');
    trace.addTimedEvent('EXECUTOR', 'Executor', 'step3', 75, 'success');

    trace.markCompleted('completed');
    const traceData = trace.getTrace();
    expect(traceData.totalDuration).toBeGreaterThan(0);
    expect(traceData.summary.routerTime).toBe(100);
    expect(traceData.summary.kernelTime).toBe(50);
    expect(traceData.summary.executorTime).toBe(75);
  });

  it('should track errors with trace', () => {
    trace.addEvent('ROUTER', 'IntentClassifier', 'classification_failed', 'error');
    trace.markCompleted('failed');

    const traceData = trace.getTrace();
    expect(traceData.status).toBe('failed');
  });

  it('should provide detailed summary', () => {
    trace.addTimedEvent('ROUTER', 'Router', 'route_creation', 50, 'success');
    trace.addTimedEvent('KERNEL', 'Kernel', 'resource_check', 40, 'success');
    trace.addTimedEvent('EXECUTOR', 'Executor', 'execution', 200, 'success');
    trace.markCompleted('completed');

    const traceData = trace.getTrace();
    expect(traceData.requestId).toBe(requestId);
    expect(traceData.status).toBe('completed');
    expect(traceData.totalDuration).toBeGreaterThan(0);
    expect(traceData.summary.totalTime).toBeGreaterThan(0);
  });

  it('should cleanup old traces to prevent memory leaks', () => {
    // Create multiple traces
    for (let i = 0; i < 105; i++) {
      const t = new ExecutionTraceContext(`req-${i}`);
      t.markCompleted('completed');
    }

    // Should have at most 100 in memory (MAX_TRACES = 100)
    const traces = ExecutionTraceContext.getAllTraces();
    expect(traces.size).toBeLessThanOrEqual(100);
  });

  it('should handle concurrent traces independently', () => {
    const trace1 = new ExecutionTraceContext('req-1');
    const trace2 = new ExecutionTraceContext('req-2');

    trace1.addTimedEvent('ROUTER', 'R', 'e1', 100, 'success');
    trace2.addTimedEvent('ROUTER', 'R', 'e2', 50, 'success');

    expect(trace1.getTrace().summary.routerTime).toBe(100);
    expect(trace2.getTrace().summary.routerTime).toBe(50);
  });
});
