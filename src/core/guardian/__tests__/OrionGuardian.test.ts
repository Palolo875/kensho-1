// src/core/guardian/__tests__/OrionGuardian.test.ts

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OrionGuardian } from '../OrionGuardian';
import { MessageBus } from '../../communication/MessageBus';
import { NetworkTransport } from '../../communication/transport/NetworkTransport';
import { KenshoMessage } from '../../communication/types';

// Mock du transport
class MockTransport implements NetworkTransport {
    private messageHandler: ((message: KenshoMessage) => void) | null = null;
    public sentMessages: KenshoMessage[] = [];

    onMessage(handler: (message: KenshoMessage) => void): void {
        this.messageHandler = handler;
    }

    send(message: KenshoMessage): void {
        this.sentMessages.push(message);
    }

    dispose(): void {
        this.messageHandler = null;
    }

    simulateReceive(message: KenshoMessage): void {
        if (this.messageHandler) {
            this.messageHandler(message);
        }
    }
}

describe('OrionGuardian', () => {
    let guardian: OrionGuardian;
    let messageBus: MessageBus;
    let transport: MockTransport;

    beforeEach(() => {
        vi.useFakeTimers();
        transport = new MockTransport();
        messageBus = new MessageBus('TestAgent', { transport });
        guardian = new OrionGuardian('TestAgent', messageBus);
    });

    afterEach(() => {
        guardian.dispose();
        messageBus.dispose();
        vi.useRealTimers();
    });

    describe('initialization', () => {
        it('should announce presence on start', () => {
            guardian.start();

            const announceMessages = transport.sentMessages.filter(
                m => m.type === 'broadcast' && (m.payload as any).systemType === 'ANNOUNCE'
            );

            expect(announceMessages.length).toBeGreaterThan(0);
        });

        it('should register itself as a known worker', () => {
            guardian.start();

            const activeWorkers = guardian.workerRegistry.getActiveWorkers();
            expect(activeWorkers).toContain('TestAgent');
        });
    });

    describe('heartbeat', () => {
        it('should send heartbeat periodically', () => {
            guardian.start();

            const initialHeartbeats = transport.sentMessages.filter(
                m => m.type === 'broadcast' && (m.payload as any).systemType === 'HEARTBEAT'
            ).length;

            // Avancer le temps de 1 seconde (interval de heartbeat)
            vi.advanceTimersByTime(1000);

            const finalHeartbeats = transport.sentMessages.filter(
                m => m.type === 'broadcast' && (m.payload as any).systemType === 'HEARTBEAT'
            ).length;

            expect(finalHeartbeats).toBeGreaterThan(initialHeartbeats);
        });

        it('should detect missing heartbeats and mark worker as offline', () => {
            guardian.start();

            // Simuler l'annonce d'un autre worker
            transport.simulateReceive({
                messageId: crypto.randomUUID(),
                traceId: 'test',
                sourceWorker: 'OtherAgent',
                targetWorker: '*',
                type: 'broadcast',
                payload: {
                    systemType: 'ANNOUNCE',
                    workerName: 'OtherAgent'
                }
            });

            // Vérifier qu'il est actif
            let activeWorkers = guardian.workerRegistry.getActiveWorkers();
            expect(activeWorkers).toContain('OtherAgent');

            // Avancer le temps au-delà du timeout (6 secondes)
            vi.advanceTimersByTime(7000);

            // Le worker devrait être marqué comme offline
            activeWorkers = guardian.workerRegistry.getActiveWorkers();
            expect(activeWorkers).not.toContain('OtherAgent');
        });
    });

    describe('worker registry', () => {
        it('should track new workers when they announce', () => {
            guardian.start();

            transport.simulateReceive({
                messageId: crypto.randomUUID(),
                traceId: 'test',
                sourceWorker: 'NewAgent',
                targetWorker: '*',
                type: 'broadcast',
                payload: {
                    systemType: 'ANNOUNCE',
                    workerName: 'NewAgent'
                }
            });

            const activeWorkers = guardian.workerRegistry.getActiveWorkers();
            expect(activeWorkers).toContain('NewAgent');
        });

        it('should update worker registry on heartbeat', () => {
            guardian.start();

            // Première annonce
            transport.simulateReceive({
                messageId: crypto.randomUUID(),
                traceId: 'test',
                sourceWorker: 'OtherAgent',
                targetWorker: '*',
                type: 'broadcast',
                payload: {
                    systemType: 'ANNOUNCE',
                    workerName: 'OtherAgent'
                }
            });

            const activeWorkers = guardian.workerRegistry.getActiveWorkers();
            expect(activeWorkers).toContain('OtherAgent');

            // Avancer le temps
            vi.advanceTimersByTime(1000);

            // Heartbeat
            transport.simulateReceive({
                messageId: crypto.randomUUID(),
                traceId: 'test',
                sourceWorker: 'OtherAgent',
                targetWorker: '*',
                type: 'broadcast',
                payload: {
                    systemType: 'HEARTBEAT',
                    epochId: 1
                }
            });

            // Le worker devrait toujours être actif
            const stillActive = guardian.workerRegistry.getActiveWorkers();
            expect(stillActive).toContain('OtherAgent');
        });
    });

    describe('leader election', () => {
        it('should elect itself as leader when alone', () => {
            guardian.start();

            // Avancer le temps pour laisser l'élection se faire
            vi.advanceTimersByTime(3000);

            const status = guardian.getStatus();
            expect(status.isLeader).toBe(true);
        });

        it('should participate in election when another agent appears', () => {
            guardian.start();

            // Simuler l'arrivée d'un autre agent avec un ID plus élevé
            transport.simulateReceive({
                messageId: crypto.randomUUID(),
                traceId: 'test',
                sourceWorker: 'ZZZ_HigherPriorityAgent',
                targetWorker: '*',
                type: 'broadcast',
                payload: {
                    systemType: 'ANNOUNCE',
                    workerName: 'ZZZ_HigherPriorityAgent'
                }
            });

            // Avancer le temps pour l'élection
            vi.advanceTimersByTime(3000);

            // L'agent avec l'ID le plus élevé devrait devenir leader
            const electionMessages = transport.sentMessages.filter(
                m => m.type === 'broadcast' && (m.payload as any).systemType === 'ELECTION'
            );

            expect(electionMessages.length).toBeGreaterThan(0);
        });
    });

    describe('dispose', () => {
        it('should cleanup timers on dispose', () => {
            guardian.start();

            const initialMessages = transport.sentMessages.length;
            guardian.dispose();

            // Avancer le temps
            vi.advanceTimersByTime(10000);

            // Aucun nouveau message ne devrait être envoyé
            expect(transport.sentMessages.length).toBe(initialMessages);
        });
    });

    describe('getStatus', () => {
        it('should return correct status information', () => {
            guardian.start();

            const status = guardian.getStatus();

            expect(status.isLeader).toBeDefined();
            expect(status.epoch).toBeGreaterThanOrEqual(0);
            expect(status.activeWorkers).toBeInstanceOf(Array);
        });
    });
});
