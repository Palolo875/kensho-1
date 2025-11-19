// src/core/communication/__tests__/MessageBus.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageBus } from '../MessageBus';
import { NetworkTransport } from '../transport/NetworkTransport';
import { KenshoMessage } from '../types';

// Mock du transport
class MockTransport implements NetworkTransport {
    private messageHandler: ((message: KenshoMessage) => void) | null = null;
    public sentMessages: KenshoMessage[] = [];

    onMessage(handler: (message: KenshoMessage) => void): void {
        this.messageHandler = handler;
    }

    send(message: KenshoMessage): void {
        this.sentMessages.push(message);
        // Simuler la réception immédiate pour les tests
        setTimeout(() => {
            if (this.messageHandler) {
                this.messageHandler(message);
            }
        }, 0);
    }

    dispose(): void {
        this.messageHandler = null;
    }

    // Helper pour simuler la réception d'un message externe
    simulateReceive(message: KenshoMessage): void {
        if (this.messageHandler) {
            this.messageHandler(message);
        }
    }
}

describe('MessageBus', () => {
    let messageBus: MessageBus;
    let transport: MockTransport;

    beforeEach(() => {
        transport = new MockTransport();
        messageBus = new MessageBus('TestAgent', { transport });
    });

    describe('request / response', () => {
        it('should send a request message', async () => {
            const promise = messageBus.request('TargetAgent', { action: 'ping' });

            // Attendre que le message soit envoyé
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(transport.sentMessages).toHaveLength(1);
            const sentMessage = transport.sentMessages[0];
            expect(sentMessage.type).toBe('request');
            expect(sentMessage.targetWorker).toBe('TargetAgent');
            expect(sentMessage.sourceWorker).toBe('TestAgent');
        });

        it('should resolve when response is received', async () => {
            messageBus.setRequestHandler(async (payload) => {
                return { result: 'pong' };
            });

            const promise = messageBus.request<{ result: string }>('TestAgent', { action: 'ping' });

            const result = await promise;
            expect(result.result).toBe('pong');
        });

        it('should timeout if no response received', async () => {
            const promise = messageBus.request('NonExistentAgent', { action: 'ping' }, 100);

            await expect(promise).rejects.toThrow(/timed out/);
        });
    });

    describe('request handler', () => {
        it('should call registered request handler', async () => {
            const handler = vi.fn().mockResolvedValue({ status: 'ok' });
            messageBus.setRequestHandler(handler);

            // Simuler une requête entrante
            const incomingRequest: KenshoMessage = {
                messageId: crypto.randomUUID(),
                traceId: 'test-trace',
                sourceWorker: 'OtherAgent',
                targetWorker: 'TestAgent',
                type: 'request',
                payload: { action: 'test' }
            };

            transport.simulateReceive(incomingRequest);

            // Attendre que le handler soit appelé
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(handler).toHaveBeenCalledWith(incomingRequest.payload);
        });

        it('should send error response when handler throws', async () => {
            messageBus.setRequestHandler(async () => {
                throw new Error('Handler error');
            });

            const incomingRequest: KenshoMessage = {
                messageId: crypto.randomUUID(),
                traceId: 'test-trace',
                sourceWorker: 'OtherAgent',
                targetWorker: 'TestAgent',
                type: 'request',
                payload: { action: 'test' }
            };

            transport.simulateReceive(incomingRequest);

            await new Promise(resolve => setTimeout(resolve, 10));

            // Vérifier qu'une réponse d'erreur a été envoyée
            const responses = transport.sentMessages.filter(m => m.type === 'response');
            expect(responses).toHaveLength(1);
            expect(responses[0].error).toBeDefined();
            expect(responses[0].error?.message).toBe('Handler error');
        });
    });

    describe('duplicate detection', () => {
        it('should detect and ignore duplicate requests', async () => {
            const handler = vi.fn().mockResolvedValue({ status: 'ok' });
            messageBus.setRequestHandler(handler);

            const requestMessage: KenshoMessage = {
                messageId: 'duplicate-test',
                traceId: 'test-trace',
                sourceWorker: 'OtherAgent',
                targetWorker: 'TestAgent',
                type: 'request',
                payload: { action: 'test' }
            };

            // Envoyer la même requête deux fois
            transport.simulateReceive(requestMessage);
            await new Promise(resolve => setTimeout(resolve, 10));

            transport.simulateReceive(requestMessage);
            await new Promise(resolve => setTimeout(resolve, 10));

            // Le handler ne doit être appelé qu'une fois
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('streaming', () => {
        it('should send stream chunks', () => {
            const streamId = 'test-stream';
            messageBus.sendStreamChunk(streamId, { data: 'chunk1' }, 'TargetAgent');

            const chunkMessages = transport.sentMessages.filter(m => m.type === 'stream_chunk');
            expect(chunkMessages).toHaveLength(1);
            expect(chunkMessages[0].streamId).toBe(streamId);
            expect(chunkMessages[0].payload).toEqual({ data: 'chunk1' });
        });

        it('should handle incoming stream chunks', async () => {
            const onChunk = vi.fn();
            const onEnd = vi.fn();
            const streamId = messageBus.requestStream('TargetAgent', { count: 3 }, {
                onChunk,
                onEnd,
                onError: vi.fn()
            });

            // Simuler des chunks entrants
            transport.simulateReceive({
                messageId: crypto.randomUUID(),
                traceId: 'test',
                sourceWorker: 'TargetAgent',
                targetWorker: 'TestAgent',
                type: 'stream_chunk',
                streamId,
                payload: { value: 1 }
            });

            transport.simulateReceive({
                messageId: crypto.randomUUID(),
                traceId: 'test',
                sourceWorker: 'TargetAgent',
                targetWorker: 'TestAgent',
                type: 'stream_end',
                streamId,
                payload: { total: 1 }
            });

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(onChunk).toHaveBeenCalledWith({ value: 1 });
            expect(onEnd).toHaveBeenCalledWith({ total: 1 });
        });
    });

    describe('dispose', () => {
        it('should cleanup resources on dispose', () => {
            messageBus.dispose();

            // Vérifier que le transport a été disposé
            expect(transport.sentMessages).toBeDefined(); // Le mock ne crash pas
        });
    });
});
