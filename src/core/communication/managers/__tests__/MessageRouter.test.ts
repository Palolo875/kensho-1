// src/core/communication/managers/__tests__/MessageRouter.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageRouter } from '../MessageRouter';
import { KenshoMessage } from '../../types';

describe('MessageRouter', () => {
    let router: MessageRouter;

    beforeEach(() => {
        router = new MessageRouter();
    });

    describe('route', () => {
        it('should route request messages to onRequest handler', () => {
            const onRequest = vi.fn();
            router.setHandlers({ onRequest });

            const message: KenshoMessage = {
                messageId: 'msg-1',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'request',
                payload: { action: 'test' }
            };

            const routed = router.route(message);

            expect(routed).toBe(true);
            expect(onRequest).toHaveBeenCalledWith(message);
        });

        it('should route stream_request to onStreamRequest handler', () => {
            const onStreamRequest = vi.fn();
            router.setHandlers({ onStreamRequest });

            const message: KenshoMessage = {
                messageId: 'msg-2',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'request',
                streamId: 'stream-123',
                payload: { action: 'stream' }
            };

            const routed = router.route(message);

            expect(routed).toBe(true);
            expect(onStreamRequest).toHaveBeenCalledWith(message);
        });

        it('should route response messages to onResponse handler', () => {
            const onResponse = vi.fn();
            router.setHandlers({ onResponse });

            const message: KenshoMessage = {
                messageId: 'msg-3',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'response',
                correlationId: 'msg-1',
                payload: { result: 'success' }
            };

            const routed = router.route(message);

            expect(routed).toBe(true);
            expect(onResponse).toHaveBeenCalledWith(message);
        });

        it('should route stream_chunk to onStreamChunk handler', () => {
            const onStreamChunk = vi.fn();
            router.setHandlers({ onStreamChunk });

            const message: KenshoMessage = {
                messageId: 'msg-4',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'stream_chunk',
                streamId: 'stream-123',
                payload: { value: 42 }
            };

            const routed = router.route(message);

            expect(routed).toBe(true);
            expect(onStreamChunk).toHaveBeenCalledWith(message);
        });

        it('should route stream_end to onStreamEnd handler', () => {
            const onStreamEnd = vi.fn();
            router.setHandlers({ onStreamEnd });

            const message: KenshoMessage = {
                messageId: 'msg-5',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'stream_end',
                streamId: 'stream-123',
                payload: { total: 10 }
            };

            const routed = router.route(message);

            expect(routed).toBe(true);
            expect(onStreamEnd).toHaveBeenCalledWith(message);
        });

        it('should route stream_error to onStreamError handler', () => {
            const onStreamError = vi.fn();
            router.setHandlers({ onStreamError });

            const message: KenshoMessage = {
                messageId: 'msg-6',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'stream_error',
                streamId: 'stream-123',
                payload: null,
                error: { name: 'StreamError', message: 'Error', code: 'ERR' }
            };

            const routed = router.route(message);

            expect(routed).toBe(true);
            expect(onStreamError).toHaveBeenCalledWith(message);
        });

        it('should route broadcast to onBroadcast handler', () => {
            const onBroadcast = vi.fn();
            router.setHandlers({ onBroadcast });

            const message: KenshoMessage = {
                messageId: 'msg-7',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: '*',
                type: 'broadcast',
                payload: { announcement: 'test' }
            };

            const routed = router.route(message);

            expect(routed).toBe(true);
            expect(onBroadcast).toHaveBeenCalledWith(message);
        });

        it('should call onUnknown for unknown message types', () => {
            const onUnknown = vi.fn();
            router.setHandlers({ onUnknown });

            const message: KenshoMessage = {
                messageId: 'msg-8',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'custom_type' as any,
                payload: {}
            };

            const routed = router.route(message);

            expect(routed).toBe(false);
            expect(onUnknown).toHaveBeenCalledWith(message);
        });

        it('should return false if no handler registered', () => {
            const message: KenshoMessage = {
                messageId: 'msg-9',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'request',
                payload: {}
            };

            const routed = router.route(message);

            expect(routed).toBe(false);
        });

        it('should return false for invalid messages', () => {
            const onRequest = vi.fn();
            router.setHandlers({ onRequest });

            const invalidMessage = { type: 'request' } as KenshoMessage; // Missing messageId

            const routed = router.route(invalidMessage);

            expect(routed).toBe(false);
            expect(onRequest).not.toHaveBeenCalled();
        });

        it('should handle async handlers', async () => {
            const asyncHandler = vi.fn().mockResolvedValue(undefined);
            router.setHandlers({ onRequest: asyncHandler });

            const message: KenshoMessage = {
                messageId: 'msg-10',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'request',
                payload: {}
            };

            const routed = router.route(message);

            expect(routed).toBe(true);
            expect(asyncHandler).toHaveBeenCalledWith(message);
        });
    });

    describe('getStats', () => {
        it('should return handler registration status', () => {
            router.setHandlers({
                onRequest: vi.fn(),
                onResponse: vi.fn(),
                onStreamChunk: vi.fn()
            });

            const stats = router.getStats();

            expect(stats.handlersRegistered.request).toBe(true);
            expect(stats.handlersRegistered.response).toBe(true);
            expect(stats.handlersRegistered.streamChunk).toBe(true);
            expect(stats.handlersRegistered.streamEnd).toBe(false);
        });
    });
});
