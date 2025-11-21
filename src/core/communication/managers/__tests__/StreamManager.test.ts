// src/core/communication/managers/__tests__/StreamManager.test.ts

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamManager } from '../StreamManager';
import { KenshoMessage } from '../../types';

describe('StreamManager', () => {
    let manager: StreamManager;

    beforeEach(() => {
        vi.useFakeTimers();
        manager = new StreamManager();
    });

    afterEach(() => {
        manager.dispose();
        vi.useRealTimers();
    });

    describe('createStream', () => {
        it('should create a new stream', () => {
            const onChunk = vi.fn();
            const onEnd = vi.fn();
            const onError = vi.fn();

            const streamId = manager.createStream('TargetAgent', { onChunk, onEnd, onError });

            expect(streamId).toBeDefined();
            expect(streamId).toMatch(/^stream-/);
            expect(manager.hasStream(streamId)).toBe(true);
            expect(manager.getActiveCount()).toBe(1);
        });

        it('should generate unique stream IDs', () => {
            const streamId1 = manager.createStream('Agent1', { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });
            const streamId2 = manager.createStream('Agent2', { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });

            expect(streamId1).not.toBe(streamId2);
            expect(manager.getActiveCount()).toBe(2);
        });
    });

    describe('handleChunk', () => {
        it('should call onChunk callback with payload', () => {
            const onChunk = vi.fn();
            const streamId = manager.createStream('TargetAgent', {
                onChunk,
                onEnd: vi.fn(),
                onError: vi.fn()
            });

            const chunkMessage: KenshoMessage = {
                messageId: 'msg-1',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'stream_chunk',
                streamId,
                payload: { value: 42 }
            };

            const handled = manager.handleChunk(chunkMessage);

            expect(handled).toBe(true);
            expect(onChunk).toHaveBeenCalledWith({ value: 42 });
        });

        it('should return false if streamId is missing', () => {
            const message: KenshoMessage = {
                messageId: 'msg-2',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'stream_chunk',
                payload: { value: 100 }
            };

            const handled = manager.handleChunk(message);
            expect(handled).toBe(false);
        });

        it('should return false if stream does not exist', () => {
            const message: KenshoMessage = {
                messageId: 'msg-3',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'stream_chunk',
                streamId: 'non-existent-stream',
                payload: { value: 100 }
            };

            const handled = manager.handleChunk(message);
            expect(handled).toBe(false);
        });
    });

    describe('handleEnd', () => {
        it('should call onEnd callback and cleanup stream', () => {
            const onEnd = vi.fn();
            const streamId = manager.createStream('TargetAgent', {
                onChunk: vi.fn(),
                onEnd,
                onError: vi.fn()
            });

            const endMessage: KenshoMessage = {
                messageId: 'msg-4',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'stream_end',
                streamId,
                payload: { total: 10 }
            };

            const handled = manager.handleEnd(endMessage);

            expect(handled).toBe(true);
            expect(onEnd).toHaveBeenCalledWith({ total: 10 });
            expect(manager.hasStream(streamId)).toBe(false);
        });

        it('should return false if stream does not exist', () => {
            const message: KenshoMessage = {
                messageId: 'msg-5',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'stream_end',
                streamId: 'non-existent',
                payload: {}
            };

            const handled = manager.handleEnd(message);
            expect(handled).toBe(false);
        });
    });

    describe('handleError', () => {
        it('should call onError callback and cleanup stream', () => {
            const onError = vi.fn();
            const streamId = manager.createStream('TargetAgent', {
                onChunk: vi.fn(),
                onEnd: vi.fn(),
                onError
            });

            const errorMessage: KenshoMessage = {
                messageId: 'msg-6',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'stream_error',
                streamId,
                payload: null,
                error: {
                    name: 'StreamError',
                    message: 'Stream failed',
                    code: 'ERR_STREAM'
                }
            };

            const handled = manager.handleError(errorMessage);

            expect(handled).toBe(true);
            expect(onError).toHaveBeenCalled();
            const errorArg = onError.mock.calls[0][0];
            expect(errorArg).toBeInstanceOf(Error);
            expect(errorArg.message).toBe('Stream failed');
            expect(manager.hasStream(streamId)).toBe(false);
        });
    });

    describe('cancelStream', () => {
        it('should cancel a stream and call onError', () => {
            const onError = vi.fn();
            const streamId = manager.createStream('TargetAgent', {
                onChunk: vi.fn(),
                onEnd: vi.fn(),
                onError
            });

            const cancelled = manager.cancelStream(streamId);

            expect(cancelled).toBe(true);
            expect(onError).toHaveBeenCalled();
            expect(onError.mock.calls[0][0].message).toBe('Stream cancelled');
            expect(manager.hasStream(streamId)).toBe(false);
        });

        it('should return false if stream does not exist', () => {
            const cancelled = manager.cancelStream('non-existent');
            expect(cancelled).toBe(false);
        });
    });

    describe('cleanup inactive streams', () => {
        it('should timeout inactive streams', () => {
            const onError = vi.fn();
            const streamId = manager.createStream('TargetAgent', {
                onChunk: vi.fn(),
                onEnd: vi.fn(),
                onError
            });

            // Avancer le temps de 6 minutes (au-delà du timeout de 5 minutes)
            vi.advanceTimersByTime(6 * 60 * 1000);

            expect(onError).toHaveBeenCalled();
            expect(onError.mock.calls[0][0].message).toContain('Stream timeout');
            expect(manager.hasStream(streamId)).toBe(false);
        });

        it('should not timeout active streams', () => {
            const onError = vi.fn();
            const streamId = manager.createStream('TargetAgent', {
                onChunk: vi.fn(),
                onEnd: vi.fn(),
                onError
            });

            // Avancer de 2 minutes
            vi.advanceTimersByTime(2 * 60 * 1000);

            // Simuler une activité (chunk)
            manager.handleChunk({
                messageId: 'msg-7',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'stream_chunk',
                streamId,
                payload: { data: 'test' }
            });

            // Avancer encore 2 minutes (total 4 minutes depuis création, mais 2 minutes depuis dernier chunk)
            vi.advanceTimersByTime(2 * 60 * 1000);

            expect(onError).not.toHaveBeenCalled();
            expect(manager.hasStream(streamId)).toBe(true);
        });
    });

    describe('getStats', () => {
        it('should return correct stats', () => {
            const streamId1 = manager.createStream('Agent1', { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });
            const streamId2 = manager.createStream('Agent2', { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });

            const stats = manager.getStats();

            expect(stats.activeCount).toBe(2);
            expect(stats.activeStreams).toHaveLength(2);
            expect(stats.activeStreams.find(s => s.streamId === streamId1)).toBeDefined();
            expect(stats.activeStreams.find(s => s.streamId === streamId2)).toBeDefined();
        });
    });

    describe('dispose', () => {
        it('should cleanup all streams and call onError', () => {
            const onError1 = vi.fn();
            const onError2 = vi.fn();

            manager.createStream('Agent1', { onChunk: vi.fn(), onEnd: vi.fn(), onError: onError1 });
            manager.createStream('Agent2', { onChunk: vi.fn(), onEnd: vi.fn(), onError: onError2 });

            manager.dispose();

            expect(onError1).toHaveBeenCalledWith(expect.objectContaining({
                message: 'StreamManager disposed'
            }));
            expect(onError2).toHaveBeenCalledWith(expect.objectContaining({
                message: 'StreamManager disposed'
            }));
            expect(manager.getActiveCount()).toBe(0);
        });
    });
});
