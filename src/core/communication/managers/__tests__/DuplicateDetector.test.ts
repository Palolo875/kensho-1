// src/core/communication/managers/__tests__/DuplicateDetector.test.ts

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DuplicateDetector } from '../DuplicateDetector';

describe('DuplicateDetector', () => {
    let detector: DuplicateDetector;

    beforeEach(() => {
        vi.useFakeTimers();
        detector = new DuplicateDetector();
    });

    afterEach(() => {
        detector.dispose();
        vi.useRealTimers();
    });

    describe('isDuplicate', () => {
        it('should return false for new messageId', () => {
            expect(detector.isDuplicate('msg-1')).toBe(false);
        });

        it('should return true for already processed messageId', () => {
            detector.markAsProcessed('msg-1', { result: 'success' });

            expect(detector.isDuplicate('msg-1')).toBe(true);
        });
    });

    describe('markAsProcessed', () => {
        it('should cache the response', () => {
            detector.markAsProcessed('msg-1', { result: 'success' });

            expect(detector.getCacheSize()).toBe(1);
            expect(detector.isDuplicate('msg-1')).toBe(true);
        });

        it('should cache response with error', () => {
            detector.markAsProcessed('msg-2', null, {
                name: 'TestError',
                message: 'Error occurred',
                code: 'ERR_TEST'
            });

            const cached = detector.getCachedResponse('msg-2');
            expect(cached).toBeDefined();
            expect(cached?.error).toEqual({
                message: 'Error occurred',
                code: 'ERR_TEST'
            });
        });
    });

    describe('getCachedResponse', () => {
        it('should return cached response', () => {
            const response = { data: 'test-data' };
            detector.markAsProcessed('msg-1', response);

            const cached = detector.getCachedResponse('msg-1');

            expect(cached).toBeDefined();
            expect(cached?.response).toEqual(response);
        });

        it('should return undefined for non-existent messageId', () => {
            const cached = detector.getCachedResponse('non-existent');
            expect(cached).toBeUndefined();
        });
    });

    describe('cleanup', () => {
        it('should remove expired entries', () => {
            detector.markAsProcessed('msg-old', { data: 'old' });

            // Avancer le temps de 65 secondes (au-delà des 60 secondes de TTL)
            vi.advanceTimersByTime(65000);

            // Le cleanup se déclenche toutes les 10 secondes
            expect(detector.isDuplicate('msg-old')).toBe(false);
            expect(detector.getCacheSize()).toBe(0);
        });

        it('should keep recent entries', () => {
            detector.markAsProcessed('msg-recent', { data: 'recent' });

            // Avancer le temps de 30 secondes (moins que le TTL de 60 secondes)
            vi.advanceTimersByTime(30000);

            expect(detector.isDuplicate('msg-recent')).toBe(true);
            expect(detector.getCacheSize()).toBe(1);
        });

        it('should cleanup multiple expired entries', () => {
            detector.markAsProcessed('msg-1', { data: '1' });
            detector.markAsProcessed('msg-2', { data: '2' });
            detector.markAsProcessed('msg-3', { data: '3' });

            expect(detector.getCacheSize()).toBe(3);

            // Avancer le temps pour expirer toutes les entrées
            vi.advanceTimersByTime(65000);

            expect(detector.getCacheSize()).toBe(0);
        });
    });

    describe('getStats', () => {
        it('should return correct stats', () => {
            detector.markAsProcessed('msg-1', { data: '1' });
            detector.markAsProcessed('msg-2', null, { name: 'TestError', message: 'Error', code: 'ERR' });

            const stats = detector.getStats();

            expect(stats.cacheSize).toBe(2);
            expect(stats.entries).toHaveLength(2);

            const entry1 = stats.entries.find(e => e.messageId === 'msg-1');
            const entry2 = stats.entries.find(e => e.messageId === 'msg-2');

            expect(entry1).toBeDefined();
            expect(entry1?.hasError).toBe(false);

            expect(entry2).toBeDefined();
            expect(entry2?.hasError).toBe(true);
        });
    });

    describe('clear', () => {
        it('should clear all cache entries', () => {
            detector.markAsProcessed('msg-1', { data: '1' });
            detector.markAsProcessed('msg-2', { data: '2' });

            expect(detector.getCacheSize()).toBe(2);

            detector.clear();

            expect(detector.getCacheSize()).toBe(0);
            expect(detector.isDuplicate('msg-1')).toBe(false);
        });
    });

    describe('dispose', () => {
        it('should clear cache and stop cleanup timer', () => {
            detector.markAsProcessed('msg-1', { data: '1' });

            detector.dispose();

            expect(detector.getCacheSize()).toBe(0);

            // Avancer le temps pour vérifier que le timer ne tourne plus
            vi.advanceTimersByTime(100000);
            // Si le timer tournait encore, il aurait nettoyé, mais ici il ne devrait rien se passer
        });
    });
});
