// src/core/communication/__tests__/OfflineQueue.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OfflineQueue } from '../OfflineQueue';
import { KenshoMessage } from '../types';

describe('OfflineQueue', () => {
    let queue: OfflineQueue;

    beforeEach(() => {
        queue = new OfflineQueue();
    });

    const createMockMessage = (targetWorker: string): KenshoMessage => ({
        messageId: crypto.randomUUID(),
        traceId: 'test-trace',
        sourceWorker: 'TestAgent',
        targetWorker,
        type: 'request',
        payload: { test: true }
    });

    describe('enqueue / flush', () => {
        it('should enqueue messages for a target worker', () => {
            const message = createMockMessage('TargetAgent');
            queue.enqueue('TargetAgent', message);

            const flushed = queue.flush('TargetAgent');
            expect(flushed).toHaveLength(1);
            expect(flushed[0].messageId).toBe(message.messageId);
        });

        it('should return empty array when flushing non-existent target', () => {
            const flushed = queue.flush('NonExistent');
            expect(flushed).toHaveLength(0);
        });

        it('should clear queue after flush', () => {
            const message = createMockMessage('TargetAgent');
            queue.enqueue('TargetAgent', message);

            queue.flush('TargetAgent');
            const secondFlush = queue.flush('TargetAgent');

            expect(secondFlush).toHaveLength(0);
        });

        it('should handle multiple messages for the same target', () => {
            const msg1 = createMockMessage('TargetAgent');
            const msg2 = createMockMessage('TargetAgent');

            queue.enqueue('TargetAgent', msg1);
            queue.enqueue('TargetAgent', msg2);

            const flushed = queue.flush('TargetAgent');
            expect(flushed).toHaveLength(2);
        });
    });

    describe('hasQueuedMessages', () => {
        it('should return false when no messages queued', () => {
            expect(queue.hasQueuedMessages('AnyAgent')).toBe(false);
        });

        it('should return true when messages are queued', () => {
            const message = createMockMessage('TargetAgent');
            queue.enqueue('TargetAgent', message);

            expect(queue.hasQueuedMessages('TargetAgent')).toBe(true);
        });

        it('should return false after flush', () => {
            const message = createMockMessage('TargetAgent');
            queue.enqueue('TargetAgent', message);
            queue.flush('TargetAgent');

            expect(queue.hasQueuedMessages('TargetAgent')).toBe(false);
        });
    });

    describe('cleanExpiredMessages', () => {
        it('should remove messages older than TTL', () => {
            // Mock Date.now() pour contrôler le temps
            const now = Date.now();
            vi.spyOn(Date, 'now')
                .mockReturnValueOnce(now) // Premier enqueue
                .mockReturnValueOnce(now + 6 * 60 * 1000); // 6 minutes plus tard (cleanup)

            const message = createMockMessage('TargetAgent');
            queue.enqueue('TargetAgent', message);

            // Avancer le temps virtuellement
            queue.cleanExpiredMessages();

            // Les messages expirés doivent être supprimés
            expect(queue.hasQueuedMessages('TargetAgent')).toBe(false);
        });

        it('should keep messages within TTL', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now')
                .mockReturnValueOnce(now) // Enqueue
                .mockReturnValueOnce(now + 2 * 60 * 1000); // 2 minutes plus tard

            const message = createMockMessage('TargetAgent');
            queue.enqueue('TargetAgent', message);

            queue.cleanExpiredMessages();

            // Les messages non-expirés doivent rester
            expect(queue.hasQueuedMessages('TargetAgent')).toBe(true);
        });
    });

    describe('getStats', () => {
        it('should return correct stats', () => {
            queue.enqueue('Agent1', createMockMessage('Agent1'));
            queue.enqueue('Agent1', createMockMessage('Agent1'));
            queue.enqueue('Agent2', createMockMessage('Agent2'));

            const stats = queue.getStats();

            expect(stats.totalQueues).toBe(2);
            expect(stats.totalMessages).toBe(3);
            expect(stats.queueDetails['Agent1']).toBe(2);
            expect(stats.queueDetails['Agent2']).toBe(1);
        });

        it('should return zero stats for empty queue', () => {
            const stats = queue.getStats();

            expect(stats.totalQueues).toBe(0);
            expect(stats.totalMessages).toBe(0);
            expect(Object.keys(stats.queueDetails)).toHaveLength(0);
        });
    });
});
