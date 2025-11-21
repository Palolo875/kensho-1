// src/core/communication/managers/__tests__/RequestManager.test.ts

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RequestManager } from '../RequestManager';
import { KenshoMessage } from '../../types';

describe('RequestManager', () => {
    let manager: RequestManager;

    beforeEach(() => {
        vi.useFakeTimers();
        manager = new RequestManager(5000);
    });

    afterEach(() => {
        manager.dispose();
        vi.useRealTimers();
    });

    describe('createRequest', () => {
        it('should create a pending request', () => {
            const promise = manager.createRequest('msg-123');

            expect(manager.hasPendingRequest('msg-123')).toBe(true);
            expect(manager.getPendingCount()).toBe(1);
        });

        it('should timeout if no response received', async () => {
            const promise = manager.createRequest('msg-timeout', 1000);

            // Avancer le temps de 1 seconde
            vi.advanceTimersByTime(1000);

            await expect(promise).rejects.toThrow(/timed out after 1000ms/);
            expect(manager.hasPendingRequest('msg-timeout')).toBe(false);
        });

        it('should use default timeout if not specified', async () => {
            const promise = manager.createRequest('msg-default');

            // Avancer le temps de 5 secondes (default timeout)
            vi.advanceTimersByTime(5000);

            await expect(promise).rejects.toThrow(/timed out after 5000ms/);
        });
    });

    describe('handleResponse', () => {
        it('should resolve promise when response arrives', async () => {
            const promise = manager.createRequest<{ result: string }>('msg-success');

            const response: KenshoMessage = {
                messageId: 'response-1',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'response',
                correlationId: 'msg-success',
                payload: { result: 'success' }
            };

            manager.handleResponse(response);

            const result = await promise;
            expect(result).toEqual({ result: 'success' });
            expect(manager.hasPendingRequest('msg-success')).toBe(false);
        });

        it('should reject promise when response has error', async () => {
            const promise = manager.createRequest('msg-error');

            const errorResponse: KenshoMessage = {
                messageId: 'response-2',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'response',
                correlationId: 'msg-error',
                payload: null,
                error: {
                    name: 'AgentError',
                    message: 'Something went wrong',
                    code: 'ERR_AGENT_FAILED'
                }
            };

            manager.handleResponse(errorResponse);

            await expect(promise).rejects.toThrow('Something went wrong');
        });

        it('should return false if correlationId is missing', () => {
            const response: KenshoMessage = {
                messageId: 'response-3',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'response',
                payload: { data: 'test' }
            };

            const handled = manager.handleResponse(response);
            expect(handled).toBe(false);
        });

        it('should return false if no pending request found', () => {
            const response: KenshoMessage = {
                messageId: 'response-4',
                traceId: 'trace',
                sourceWorker: 'AgentA',
                targetWorker: 'AgentB',
                type: 'response',
                correlationId: 'non-existent',
                payload: { data: 'test' }
            };

            const handled = manager.handleResponse(response);
            expect(handled).toBe(false);
        });
    });

    describe('cancelRequest', () => {
        it('should cancel a pending request', () => {
            manager.createRequest('msg-cancel');

            const cancelled = manager.cancelRequest('msg-cancel');

            expect(cancelled).toBe(true);
            expect(manager.hasPendingRequest('msg-cancel')).toBe(false);
        });

        it('should return false if request does not exist', () => {
            const cancelled = manager.cancelRequest('non-existent');
            expect(cancelled).toBe(false);
        });
    });

    describe('getStats', () => {
        it('should return correct stats', () => {
            manager.createRequest('msg-1');
            manager.createRequest('msg-2');
            manager.createRequest('msg-3');

            const stats = manager.getStats();

            expect(stats.pendingCount).toBe(3);
            expect(stats.pendingRequests).toContain('msg-1');
            expect(stats.pendingRequests).toContain('msg-2');
            expect(stats.pendingRequests).toContain('msg-3');
        });
    });

    describe('dispose', () => {
        it('should reject all pending requests', async () => {
            const promise1 = manager.createRequest('msg-1');
            const promise2 = manager.createRequest('msg-2');

            manager.dispose();

            await expect(promise1).rejects.toThrow('RequestManager disposed');
            await expect(promise2).rejects.toThrow('RequestManager disposed');
            expect(manager.getPendingCount()).toBe(0);
        });
    });
});
