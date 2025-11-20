import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../MetricsCollector';

describe('MetricsCollector', () => {
    let collector: MetricsCollector;

    beforeEach(() => {
        collector = new MetricsCollector({ windowSize: 100, windowDuration: 60000 });
    });

    describe('Counter metrics', () => {
        it('should increment counter', () => {
            collector.incrementCounter('test.counter');
            expect(collector.getCounter('test.counter')).toBe(1);

            collector.incrementCounter('test.counter', 5);
            expect(collector.getCounter('test.counter')).toBe(6);
        });

        it('should handle counters with tags', () => {
            collector.incrementCounter('test.counter', 1, { env: 'dev' });
            collector.incrementCounter('test.counter', 1, { env: 'prod' });

            expect(collector.getCounter('test.counter', { env: 'dev' })).toBe(1);
            expect(collector.getCounter('test.counter', { env: 'prod' })).toBe(1);
        });

        it('should return 0 for non-existent counter', () => {
            expect(collector.getCounter('non.existent')).toBe(0);
        });
    });

    describe('Timing metrics', () => {
        it('should record timing values', () => {
            collector.recordTiming('test.timing', 10);
            collector.recordTiming('test.timing', 20);
            collector.recordTiming('test.timing', 30);

            const stats = collector.getStats('test.timing');
            expect(stats).not.toBeNull();
            expect(stats?.count).toBe(3);
            expect(stats?.min).toBe(10);
            expect(stats?.max).toBe(30);
            expect(stats?.avg).toBe(20);
        });

        it('should calculate percentiles correctly', () => {
            // Add 100 values from 1 to 100
            for (let i = 1; i <= 100; i++) {
                collector.recordTiming('test.percentile', i);
            }

            const stats = collector.getStats('test.percentile');
            expect(stats).not.toBeNull();
            
            // For 100 values [1..100] using linear interpolation:
            // index = (p/100) * (n-1)
            // p50: index=49.5 → 50*(1-0.5) + 51*0.5 = 50.5
            // p95: index=94.05 → 95*(1-0.05) + 96*0.05 = 95.05
            // p99: index=98.01 → 99*(1-0.01) + 100*0.01 = 99.01
            expect(stats?.p50).toBeCloseTo(50.5, 2); // ±0.005
            expect(stats?.p95).toBeCloseTo(95.05, 2); // ±0.005
            expect(stats?.p99).toBeCloseTo(99.01, 2); // ±0.005
        });

        it('should return null for non-existent timing', () => {
            expect(collector.getStats('non.existent')).toBeNull();
        });

        it('should handle timing with tags', () => {
            collector.recordTiming('test.timing', 10, { operation: 'read' });
            collector.recordTiming('test.timing', 20, { operation: 'write' });

            const readStats = collector.getStats('test.timing', { operation: 'read' });
            const writeStats = collector.getStats('test.timing', { operation: 'write' });

            expect(readStats?.avg).toBe(10);
            expect(writeStats?.avg).toBe(20);
        });
    });

    describe('Gauge metrics', () => {
        it('should record gauge values', () => {
            collector.recordGauge('test.gauge', 42);
            expect(collector.getCounter('test.gauge')).toBe(42);

            collector.recordGauge('test.gauge', 100);
            expect(collector.getCounter('test.gauge')).toBe(100);
        });
    });

    describe('Window management', () => {
        it('should limit window size', () => {
            const smallCollector = new MetricsCollector({ windowSize: 5, windowDuration: 60000 });

            for (let i = 1; i <= 10; i++) {
                smallCollector.recordTiming('test.window', i);
            }

            const stats = smallCollector.getStats('test.window');
            expect(stats?.count).toBeLessThanOrEqual(5);
        });

        it('should clean expired values', async () => {
            const shortCollector = new MetricsCollector({ windowSize: 100, windowDuration: 100 });

            shortCollector.recordTiming('test.expire', 10);
            
            // Wait for values to expire
            await new Promise(resolve => setTimeout(resolve, 150));
            
            shortCollector.recordTiming('test.expire', 20);
            
            const stats = shortCollector.getStats('test.expire');
            expect(stats?.count).toBe(1);
            expect(stats?.avg).toBe(20);
        });
    });

    describe('getAllMetrics', () => {
        it('should return all metrics', () => {
            collector.incrementCounter('counter1');
            collector.incrementCounter('counter2', 5);
            collector.recordTiming('timing1', 10);
            collector.recordGauge('gauge1', 42);

            const all = collector.getAllMetrics();

            expect(all['counter1']).toBe(1);
            expect(all['counter2']).toBe(5);
            expect(all['gauge1']).toBe(42);
            expect(all['timing1_stats']).toBeDefined();
        });
    });

    describe('reset', () => {
        it('should clear all metrics', () => {
            collector.incrementCounter('test.counter');
            collector.recordTiming('test.timing', 10);

            collector.reset();

            expect(collector.getCounter('test.counter')).toBe(0);
            expect(collector.getStats('test.timing')).toBeNull();
        });
    });
});
