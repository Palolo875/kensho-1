// src/core/communication/managers/DuplicateDetector.ts

import { SerializedError } from '../types';

interface CachedResponse {
    response: unknown;
    error?: SerializedError;
    timestamp: number;
}

/**
 * DuplicateDetector détecte et gère les requêtes dupliquées.
 * 
 * Responsabilités :
 * - Détecter si une requête a déjà été traitée
 * - Retourner la réponse mise en cache pour les doublons
 * - Nettoyer le cache périodiquement
 */
export class DuplicateDetector {
    private cache = new Map<string, CachedResponse>();
    private cleanupTimer: NodeJS.Timeout;

    private static readonly CACHE_MAX_AGE_MS = 60000; // 60 secondes
    private static readonly CLEANUP_INTERVAL_MS = 10000; // 10 secondes

    constructor() {
        // Démarrer le cleanup périodique
        this.cleanupTimer = setInterval(() => this.cleanup(), DuplicateDetector.CLEANUP_INTERVAL_MS);
    }

    /**
     * Vérifie si un messageId a déjà été traité.
     */
    public isDuplicate(messageId: string): boolean {
        return this.cache.has(messageId);
    }

    /**
     * Récupère la réponse mise en cache pour un messageId.
     */
    public getCachedResponse(messageId: string): CachedResponse | undefined {
        return this.cache.get(messageId);
    }

    /**
     * Marque un messageId comme traité et met en cache sa réponse.
     */
    public markAsProcessed(messageId: string, response: unknown, error?: SerializedError): void {
        this.cache.set(messageId, {
            response,
            error,
            timestamp: Date.now()
        });
    }

    /**
     * Nettoie les entrées expirées du cache.
     */
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
            console.log(`[DuplicateDetector] Cleaned up ${cleanedCount} expired cache entries`);
        }
    }

    /**
     * Retourne le nombre d'entrées dans le cache.
     */
    public getCacheSize(): number {
        return this.cache.size;
    }

    /**
     * Retourne les statistiques pour l'observabilité.
     */
    public getStats() {
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

    /**
     * Vide le cache complètement.
     */
    public clear(): void {
        this.cache.clear();
    }

    /**
     * Nettoie le cache et arrête le timer (dispose).
     */
    public dispose(): void {
        clearInterval(this.cleanupTimer);
        this.cache.clear();
    }
}
