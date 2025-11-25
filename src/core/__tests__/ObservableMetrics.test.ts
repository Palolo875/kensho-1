/**
 * Test Suite: Observable Metrics
 * Priority 2: Queue stats + ExecutionTrace reporting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { taskExecutor } from '../kernel/TaskExecutor';
import { ExecutionTraceContext } from '../kernel/ExecutionTraceContext';

describe('Observable Metrics - Priority 2 ✅', () => {
  beforeEach(() => {
    // Clear traces before each test if needed
  });

  it('should provide queue statistics', () => {
    const stats = taskExecutor.getQueueStats();

    expect(stats).toBeDefined();
    expect(stats.activeRequests).toBe(0);
    expect(stats.serialQueue).toBeDefined();
    expect(stats.parallelLimitedQueue).toBeDefined();
    expect(stats.parallelFullQueue).toBeDefined();
  });

  it('should track queue concurrency limits', () => {
    const stats = taskExecutor.getQueueStats();

    expect(stats.serialQueue.concurrency).toBe(1);
    expect(stats.parallelLimitedQueue.concurrency).toBe(2);
    expect(stats.parallelFullQueue.concurrency).toBe(4);
  });

  it('should report pending job counts', () => {
    const stats = taskExecutor.getQueueStats();

    expect(stats.serialQueue.pending).toBeDefined();
    expect(stats.parallelLimitedQueue.pending).toBeDefined();
    expect(stats.parallelFullQueue.pending).toBeDefined();

    expect(typeof stats.serialQueue.pending).toBe('number');
    expect(typeof stats.parallelLimitedQueue.pending).toBe('number');
    expect(typeof stats.parallelFullQueue.pending).toBe('number');
  });

  it('should track active request count', () => {
    const initialCount = taskExecutor.getActiveRequestCount();
    expect(typeof initialCount).toBe('number');
    expect(initialCount).toBeGreaterThanOrEqual(0);
  });

  it('should provide ExecutionTrace for debugging', () => {
    const trace = new ExecutionTraceContext('test-req-metrics');

    trace.addTimedEvent('ROUTER', 'Router', 'classify', 50, 'success', {
      intent: 'CODE'
    });
    trace.addTimedEvent('KERNEL', 'Kernel', 'check_resources', 30, 'success', {
      score: 8.5
    });
    trace.addTimedEvent('EXECUTOR', 'Executor', 'queue_select', 20, 'success', {
      strategy: 'PARALLEL_LIMITED'
    });

    trace.markCompleted('completed');
    const traceData = trace.getTrace();
    expect(traceData.events).toHaveLength(3);
    expect(traceData.totalDuration).toBeGreaterThan(0);
  });

  it('should calculate metrics summary', () => {
    const trace = new ExecutionTraceContext('metrics-test');

    trace.addTimedEvent('ROUTER', 'R', 'step1', 100, 'success');
    trace.addTimedEvent('ROUTER', 'R', 'step2', 50, 'success');
    trace.addTimedEvent('KERNEL', 'K', 'step3', 75, 'success');

    trace.markCompleted('completed');
    const traceData = trace.getTrace();

    expect(traceData.summary.routerTime).toBe(150);
    expect(traceData.summary.kernelTime).toBe(75);
    expect(traceData.events.filter(e => e.level === 'ROUTER')).toHaveLength(2);
    expect(traceData.events.filter(e => e.level === 'KERNEL')).toHaveLength(1);
  });

  it('should store multiple traces independently', () => {
    const trace1 = new ExecutionTraceContext('req-1');
    const trace2 = new ExecutionTraceContext('req-2');

    trace1.addTimedEvent('ROUTER', 'R', 'e1', 100, 'success');
    trace2.addTimedEvent('ROUTER', 'R', 'e2', 50, 'success');

    const allTraces = ExecutionTraceContext.getAllTraces();
    expect(allTraces.size).toBeGreaterThanOrEqual(2);

    const t1Data = trace1.getTrace();
    const t2Data = trace2.getTrace();

    expect(t1Data.summary.routerTime).toBe(100);
    expect(t2Data.summary.routerTime).toBe(50);
  });

  it('should format metrics for monitoring dashboard', () => {
    const trace = new ExecutionTraceContext('dashboard-test');

    trace.addTimedEvent('ROUTER', 'Router', 'init', 50, 'success');
    trace.addTimedEvent('KERNEL', 'Kernel', 'init', 30, 'success');
    trace.addTimedEvent('EXECUTOR', 'Executor', 'init', 20, 'success');

    trace.markCompleted('completed');
    const traceData = trace.getTrace();

    const metric = {
      requestId: traceData.requestId,
      routerTime: traceData.summary.routerTime,
      kernelTime: traceData.summary.kernelTime,
      executorTime: traceData.summary.executorTime,
      eventCount: traceData.events.length,
      status: traceData.status
    };

    expect(metric.routerTime).toBe(50);
    expect(metric.kernelTime).toBe(30);
    expect(metric.executorTime).toBe(20);
    expect(metric.eventCount).toBe(3);
  });

  it('should handle high-frequency metric collection', () => {
    const traces: ExecutionTraceContext[] = [];

    for (let i = 0; i < 10; i++) {
      const trace = new ExecutionTraceContext(`req-${i}`);
      trace.addTimedEvent('ROUTER', 'R', 'e', Math.random() * 100, 'success');
      traces.push(trace);
    }

    expect(traces).toHaveLength(10);
    expect(ExecutionTraceContext.getAllTraces().size).toBeGreaterThanOrEqual(10);
  });
});
