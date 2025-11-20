import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceMonitor, monitorAsync, monitorSync } from '../PerformanceMonitor';
import { globalMetrics } from '../MetricsCollector';

describe('PerformanceMonitor', () => {
    beforeEach(() => {
        globalMetrics.reset();
    });

    describe('PerformanceMonitor class', () => {
        it('should measure operation duration', () => {
            const monitor = new PerformanceMonitor('test.operation');
            
            // Simulate some work
            const start = performance.now();
            while (performance.now() - start < 10) {
                // Wait ~10ms
            }
            
            const duration = monitor.end();
            
            expect(duration).toBeGreaterThanOrEqual(10);
            
            const stats = globalMetrics.getStats('test.operation_duration_ms');
            expect(stats).not.toBeNull();
            expect(stats?.count).toBe(1);
        });

        it('should support checkpoints', () => {
            const monitor = new PerformanceMonitor('test.checkpoint');
            
            monitor.checkpoint('step1');
            monitor.checkpoint('step2');
            monitor.end();
            
            expect(globalMetrics.getStats('test.checkpoint_step1_ms')).not.toBeNull();
            expect(globalMetrics.getStats('test.checkpoint_step2_ms')).not.toBeNull();
            expect(globalMetrics.getStats('test.checkpoint_duration_ms')).not.toBeNull();
        });

        it('should support tags', () => {
            const monitor = new PerformanceMonitor('test.tags', { env: 'test' });
            monitor.end();
            
            const stats = globalMetrics.getStats('test.tags_duration_ms', { env: 'test' });
            expect(stats).not.toBeNull();
        });

        it('should allow restarting', () => {
            const monitor = new PerformanceMonitor('test.restart');
            
            const duration1 = monitor.checkpoint('first');
            monitor.restart();
            const duration2 = monitor.end();
            
            // After restart, duration should be small
            expect(duration2).toBeLessThan(duration1);
        });
    });

    describe('monitorAsync', () => {
        it('should measure async function duration', async () => {
            const asyncFn = async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return 'result';
            };

            const result = await monitorAsync('test.async', asyncFn);
            
            expect(result).toBe('result');
            expect(globalMetrics.getCounter('test.async_success')).toBe(1);
            
            const stats = globalMetrics.getStats('test.async_duration_ms');
            expect(stats).not.toBeNull();
            expect(stats?.avg).toBeGreaterThanOrEqual(10);
        });

        it('should track errors', async () => {
            const errorFn = async () => {
                throw new Error('Test error');
            };

            await expect(monitorAsync('test.error', errorFn)).rejects.toThrow('Test error');
            
            expect(globalMetrics.getCounter('test.error_error')).toBe(1);
            expect(globalMetrics.getCounter('test.error_success')).toBe(0);
        });
    });

    describe('monitorSync', () => {
        it('should measure sync function duration', () => {
            const syncFn = () => {
                let sum = 0;
                for (let i = 0; i < 1000; i++) {
                    sum += i;
                }
                return sum;
            };

            const result = monitorSync('test.sync', syncFn);
            
            expect(result).toBe(499500);
            expect(globalMetrics.getCounter('test.sync_success')).toBe(1);
            
            const stats = globalMetrics.getStats('test.sync_duration_ms');
            expect(stats).not.toBeNull();
        });

        it('should track errors in sync functions', () => {
            const errorFn = () => {
                throw new Error('Sync error');
            };

            expect(() => monitorSync('test.sync.error', errorFn)).toThrow('Sync error');
            
            expect(globalMetrics.getCounter('test.sync.error_error')).toBe(1);
            expect(globalMetrics.getCounter('test.sync.error_success')).toBe(0);
        });
    });
});
