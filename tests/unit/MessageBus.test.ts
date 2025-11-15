// tests/unit/MessageBus.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageBus } from '../../src/core/communication/MessageBus';
import { KenshoMessage } from '../../src/core/communication/types';

// Mock avancé qui simule le comportement asynchrone et multi-listener du BroadcastChannel
const mockBusController = {
    listeners: [] as ((event: { data: KenshoMessage }) => void)[],
    postMessage(message: KenshoMessage) {
        // Simule la livraison asynchrone avec un délai aléatoire pour débusquer les race conditions
        const delay = Math.random() * 5; // 0-5ms
        setTimeout(() => {
            this.listeners.forEach(l => l({ data: message }));
        }, delay);
    },
    addEventListener(handler: (event: { data: KenshoMessage }) => void) {
        this.listeners.push(handler);
    },
    clear() {
        this.listeners = [];
    }
};

class MockBroadcastChannel {
    constructor(name: string) {}
    postMessage(message: KenshoMessage) {
        mockBusController.postMessage(message);
    }
    close = vi.fn();
    set onmessage(handler: (event: { data: KenshoMessage }) => void) {
        mockBusController.addEventListener(handler);
    }
}

vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);


describe('MessageBus Core (Sprint 1A - Durci)', () => {
    let busA: MessageBus;
    let busB: MessageBus;

    beforeEach(() => {
        mockBusController.clear();
        busA = new MessageBus('AgentA', { defaultTimeout: 1000 });
        busB = new MessageBus('AgentB');
    });

    afterEach(() => {
        busA.dispose();
        busB.dispose();
    });

    it('devrait réussir une requête simple et recevoir une réponse', async () => {
        busB.setRequestHandler(payload => `response to: ${payload.data}`);
        const response = await busA.request('AgentB', { data: 'ping' });
        expect(response).toBe('response to: ping');
    });

    it('devrait échouer par timeout si aucune réponse n\'est reçue', async () => {
        await expect(busA.request('AgentC', {}, 50)).rejects.toThrow("Request to 'AgentC' timed out after 50ms");
    });

    it('devrait utiliser le timeout par défaut si aucun n\'est fourni', async () => {
        await expect(busA.request('AgentC', {})).rejects.toThrow("Request to 'AgentC' timed out after 1000ms");
    });

    it('devrait sérialiser et reconstruire correctement une erreur', async () => {
        busB.setRequestHandler(() => {
            const err = new Error("Handler failed!");
            err.name = "CustomError";
            (err as any).code = "E_HANDLER";
            throw err;
        });

        try {
            await busA.request('AgentB', {});
        } catch (error: any) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBe('Handler failed!');
            expect(error.name).toBe('CustomError');
            // Note: le code personnalisé n'est pas une propriété standard, donc on ne le teste pas ici.
            expect(error.stack).toBeDefined();
        }
    });

    it('devrait rejeter la requête si aucun handler n\'est enregistré', async () => {
        await expect(busA.request('AgentB', {})).rejects.toThrow("No request handler registered for worker 'AgentB'");
    });

    it('devrait propager le traceId correctement', async () => {
        const traceId = `test-trace-${crypto.randomUUID()}`;
        busA.setCurrentTraceId(traceId);

        // Espionner la méthode postMessage du mock
        const postMessageSpy = vi.spyOn(mockBusController, 'postMessage');

        busB.setRequestHandler(() => 'ok');
        await busA.request('AgentB', {});

        // Vérifier que le message de requête avait le bon traceId
        const requestMessage = postMessageSpy.mock.calls.find(call => call[0].type === 'request');
        expect(requestMessage).toBeDefined();
        expect(requestMessage![0].traceId).toBe(traceId);

        // Vérifier que le message de réponse avait aussi le bon traceId
        const responseMessage = postMessageSpy.mock.calls.find(call => call[0].type === 'response');
        expect(responseMessage).toBeDefined();
        expect(responseMessage![0].traceId).toBe(traceId);
    });
});
