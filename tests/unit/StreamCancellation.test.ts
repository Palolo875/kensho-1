// tests/unit/StreamCancellation.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRuntime } from '../../src/core/agent-system/AgentRuntime';
import { BroadcastTransport } from '../../src/core/communication/transport/BroadcastTransport';

describe('Stream Cancellation', () => {
    it('should deactivate producer emitter when consumer cancels stream', async () => {
        // Setup: Créer deux agents (producer et consumer)
        const producer = new AgentRuntime('Producer');
        const consumer = new AgentRuntime('Consumer');

        let emitterRef: any = null;
        let chunksReceived: string[] = [];
        let streamEnded = false;
        let streamError: Error | null = null;

        // Producer enregistre une méthode de streaming
        producer.registerStreamMethod<string>('generateText', (payload, emitter) => {
            emitterRef = emitter;
            
            // Simuler génération de chunks
            const interval = setInterval(() => {
                if (emitter.active) {
                    emitter.chunk(`token-${emitter.chunksEmitted + 1}`);
                } else {
                    clearInterval(interval);
                }
            }, 100);

            // Arrêter après 10 chunks si pas annulé
            setTimeout(() => {
                clearInterval(interval);
                if (emitter.active) {
                    emitter.end({ total: emitter.chunksEmitted });
                }
            }, 1100);
        });

        // Consumer appelle le stream
        const streamId = consumer.callAgentStream<string>(
            'Producer',
            'generateText',
            [{ prompt: 'test' }],
            {
                onChunk: (chunk) => {
                    chunksReceived.push(chunk);
                },
                onEnd: () => {
                    streamEnded = true;
                },
                onError: (error) => {
                    streamError = error;
                }
            }
        );

        // Attendre quelques chunks
        await new Promise(resolve => setTimeout(resolve, 350));
        
        // Vérifier que des chunks ont été reçus
        expect(chunksReceived.length).toBeGreaterThan(0);
        expect(chunksReceived.length).toBeLessThan(10);
        const chunksBeforeCancel = chunksReceived.length;

        // Consumer annule le stream
        const cancelled = consumer.cancelStream(streamId, 'Test cancellation');
        expect(cancelled).toBe(true);

        // Attendre un peu pour voir si des chunks continuent d'arriver
        await new Promise(resolve => setTimeout(resolve, 500));

        // Vérifier que l'emitter du producer est inactif
        expect(emitterRef).not.toBeNull();
        expect(emitterRef.active).toBe(false);

        // Vérifier qu'aucun chunk supplémentaire n'a été reçu
        expect(chunksReceived.length).toBe(chunksBeforeCancel);

        // Vérifier que le stream a été annulé côté consumer
        expect(streamError).not.toBeNull();
        expect(streamError?.message).toContain('cancelled');

        // Cleanup
        producer.dispose();
        consumer.dispose();
    });

    it('should stop emitting chunks when producer aborts stream', async () => {
        const producer = new AgentRuntime('Producer');
        const consumer = new AgentRuntime('Consumer');

        let chunksReceived: string[] = [];
        let streamError: Error | null = null;

        producer.registerStreamMethod<string>('generateText', (payload, emitter) => {
            // Émettre quelques chunks puis abortir
            emitter.chunk('chunk-1');
            emitter.chunk('chunk-2');
            emitter.chunk('chunk-3');
            
            // Abortir après un délai
            setTimeout(() => {
                emitter.abort('Producer decided to stop');
            }, 200);
        });

        consumer.callAgentStream<string>(
            'Producer',
            'generateText',
            [{ prompt: 'test' }],
            {
                onChunk: (chunk) => {
                    chunksReceived.push(chunk);
                },
                onEnd: () => {
                    // Ne devrait pas être appelé
                    throw new Error('onEnd should not be called after abort');
                },
                onError: (error) => {
                    streamError = error;
                }
            }
        );

        // Attendre que l'abort se produise
        await new Promise(resolve => setTimeout(resolve, 300));

        // Vérifier que les 3 premiers chunks ont été reçus
        expect(chunksReceived).toEqual(['chunk-1', 'chunk-2', 'chunk-3']);

        // Vérifier que l'erreur d'abort a été reçue
        expect(streamError).not.toBeNull();
        expect((streamError as any)?.code).toBe('STREAM_ABORTED');

        producer.dispose();
        consumer.dispose();
    });
});
