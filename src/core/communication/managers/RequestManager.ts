// src/core/communication/managers/RequestManager.ts

import { KenshoMessage, WorkerName, SerializedError } from '../types';

export interface PendingRequest<T = unknown> {
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
    timeout: NodeJS.Timeout;
    messageId: string;
}

/**
 * RequestManager gère le cycle de vie des requêtes RPC (request/response).
 * 
 * Responsabilités :
 * - Créer des requêtes avec timeout
 * - Résoudre les Promises quand une réponse arrive
 * - Timeout automatique si pas de réponse
 */
export class RequestManager {
    private pendingRequests = new Map<string, PendingRequest>();
    private readonly defaultTimeout: number;

    constructor(defaultTimeout: number = 5000) {
        this.defaultTimeout = defaultTimeout;
    }

    /**
     * Crée une nouvelle requête avec Promise et timeout.
     * Retourne une Promise qui sera résolue/rejetée quand la réponse arrive.
     */
    public createRequest<TResponse>(
        messageId: string,
        timeout?: number
    ): Promise<TResponse> {
        return new Promise((resolve, reject) => {
            const actualTimeout = timeout ?? this.defaultTimeout;

            const timeoutHandle = setTimeout(() => {
                this.cancelRequest(messageId);
                reject(new Error(`Request ${messageId} timed out after ${actualTimeout}ms`));
            }, actualTimeout);

            this.pendingRequests.set(messageId, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeout: timeoutHandle,
                messageId
            });
        });
    }

    /**
     * Traite une réponse entrante et résout la Promise correspondante.
     */
    public handleResponse(message: KenshoMessage): boolean {
        const messageId = message.correlationId;
        if (!messageId) {
            console.warn('[RequestManager] Response message without correlationId', message);
            return false;
        }

        const pending = this.pendingRequests.get(messageId);
        if (!pending) {
            // Peut arriver si la requête a timeout entre-temps
            return false;
        }

        // Clear le timeout
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(messageId);

        // Résoudre ou rejeter selon la présence d'une erreur
        if (message.error) {
            const error = new Error(message.error.message || 'Unknown error');
            (error as Error & { code?: string }).code = message.error.code;
            pending.reject(error);
        } else {
            pending.resolve(message.payload);
        }

        return true;
    }

    /**
     * Annule une requête en attente (par exemple lors d'un timeout).
     */
    public cancelRequest(messageId: string): boolean {
        const pending = this.pendingRequests.get(messageId);
        if (!pending) {
            return false;
        }

        clearTimeout(pending.timeout);
        this.pendingRequests.delete(messageId);
        return true;
    }

    /**
     * Vérifie si une requête est en attente.
     */
    public hasPendingRequest(messageId: string): boolean {
        return this.pendingRequests.has(messageId);
    }

    /**
     * Retourne le nombre de requêtes en attente.
     */
    public getPendingCount(): number {
        return this.pendingRequests.size;
    }

    /**
     * Retourne les statistiques pour l'observabilité.
     */
    public getStats() {
        return {
            pendingCount: this.pendingRequests.size,
            pendingRequests: Array.from(this.pendingRequests.keys())
        };
    }

    /**
     * Nettoie toutes les requêtes en attente (dispose).
     */
    public dispose(): void {
        this.pendingRequests.forEach(pending => {
            clearTimeout(pending.timeout);
            pending.reject(new Error('RequestManager disposed'));
        });
        this.pendingRequests.clear();
    }
}
