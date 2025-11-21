// tests/integration/AgentCommunication.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRuntime } from '../../src/core/agent-system/AgentRuntime';

// Nous réutilisons le même mock de BroadcastChannel que pour le test du MessageBus
const mockBusController = {
    listeners: [] as any[],
    postMessage(message: any) {
        const delay = Math.random() * 2;
        setTimeout(() => {
            this.listeners.forEach(l => l({ data: message }));
        }, delay);
    },
    addEventListener(handler: any) { this.listeners.push(handler); },
    clear() { this.listeners = []; }
};
class MockBroadcastChannel {
    constructor(name: string) {}
    postMessage(message: any) {
        mockBusController.postMessage(message);
    }
    close = vi.fn();
    set onmessage(handler: any) {
        mockBusController.addEventListener(handler);
    }
}

vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);


describe('AgentRuntime Communication (Sprint 1A - Durci)', () => {
    let pingRuntime: AgentRuntime;
    let pongRuntime: AgentRuntime;

    beforeEach(() => {
        mockBusController.clear();

        // Simuler ce que `defineAgent` ferait
        pingRuntime = new AgentRuntime('PingAgent');
        pingRuntime.registerMethod('ping', async (payload: unknown) => `pong: ${payload}`);

        pongRuntime = new AgentRuntime('PongAgent');
        // Pas de méthode enregistrée pour PongAgent dans ce test de base
    });

    afterEach(() => {
        pingRuntime.dispose();
        pongRuntime.dispose();
    });

    it('devrait permettre à un agent d\'en appeler un autre avec succès via callAgent', async () => {
        const response = await pongRuntime.callAgent<string>(
            'PingAgent',
            'ping',
            ['hello from test']
        );
        expect(response).toBe('pong: hello from test');
    });

    it('devrait rejeter la promesse si la méthode appelée n\'existe pas', async () => {
        await expect(
            pongRuntime.callAgent('PingAgent', 'methodThatDoesNotExist', [])
        ).rejects.toThrow("Method 'methodThatDoesNotExist' not found on agent 'PingAgent'");
    });

    it('devrait gérer un grand nombre d\'appels concurrents', async () => {
        const numCalls = 100;
        const promises = Array.from({ length: numCalls }, (_, i) =>
            pongRuntime.callAgent<string>('PingAgent', 'ping', [`message ${i}`])
        );

        const responses = await Promise.all(promises);

        expect(responses.length).toBe(numCalls);
        expect(responses[42]).toBe('pong: message 42');
    });

    it('devrait correctement propager le traceId à travers l\'AgentRuntime', async () => {
        const traceId = `agent-test-trace-${crypto.randomUUID()}`;
        pongRuntime.setCurrentTraceId(traceId);

        const postMessageSpy = vi.spyOn(mockBusController, 'postMessage');

        await pongRuntime.callAgent('PingAgent', 'ping', ['trace test']);

        const requestMessage = postMessageSpy.mock.calls.find(call => call[0].type === 'request');
        expect(requestMessage![0].traceId).toBe(traceId);
    });
});
