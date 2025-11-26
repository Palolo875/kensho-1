// src/core/communication/managers/DuplicateDetector.ts

import { SerializedError } from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('DuplicateDetector');

interface CachedResponse {
    response: unknown;
    error?: SerializedError;
    timestamp: number;
}

/**
 * DuplicateDetector détecte et gère les requêtes dupliquées.
 */
export class DuplicateDetector {
    private cache = new Map<string, CachedResponse>();
    private cleanupTimer: ReturnType<typeof setInterval>;

    private static readonly CACHE_MAX_AGE_MS = 60000;
    private static readonly CLEANUP_INTERVAL_MS = 10000;

    constructor() {
        this.cleanupTimer = setInterval(() => this.cleanup(), DuplicateDetector.CLEANUP_INTERVAL_MS);
    }

    public isDuplicate(messageId: string): boolean {
        return this.cache.has(messageId);
    }

    public getCachedResponse(messageId: string): CachedResponse | undefined {
        return this.cache.get(messageId);
    }

    public markAsProcessed(messageId: string, response: unknown, error?: SerializedError): void {
        this.cache.set(messageId, {
            response,
            error,
            timestamp: Date.now()
        });
    }

    private cleanup(): void {
        const now = Date.now();
        let cleanedCount = 0;

        this.cache.forEach((cached, messageId) => {
            const age = now - cached.timestamp;
            if (age > DuplicateDetector.CACHE_MAX_AGE_MS) {
                this.cache.delete(messageId);
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            log.debug(`Cleaned up ${cleanedCount} expired cache entries`);
        }
    }

    public getCacheSize(): number {
        return this.cache.size;
    }

    public getStats(): {
        cacheSize: number;
        entries: Array<{
            messageId: string;
            age: number;
            hasError: boolean;
        }>;
    } {
        const now = Date.now();
        return {
            cacheSize: this.cache.size,
            entries: Array.from(this.cache.entries()).map(([messageId, cached]) => ({
                messageId,
                age: now - cached.timestamp,
                hasError: !!cached.error
            }))
        };
    }

    public clear(): void {
        this.cache.clear();
    }

    public dispose(): void {
        clearInterval(this.cleanupTimer);
        this.cache.clear();
    }
}
