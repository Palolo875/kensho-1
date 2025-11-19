// src/core/communication/MessageBus.ts

import { KenshoMessage, WorkerName, RequestHandler, SerializedError } from './types';
import { NetworkTransport } from './transport/NetworkTransport';
import { BroadcastTransport } from './transport/BroadcastTransport';
import { OfflineQueue } from './OfflineQueue';

interface MessageBusConfig {
    defaultTimeout?: number;
    transport?: NetworkTransport;
}

/**
 * Le MessageBus est le système nerveux central de Kensho.
 * Il gère toute la communication inter-workers de manière fiable.
 */
export class MessageBus {
    private readonly workerName: WorkerName;
    private readonly transport: NetworkTransport;
    private readonly defaultTimeout: number;
    private currentTraceId: string | null = null;

    private pendingRequests = new Map<string, { resolve: (value: any) => void, reject: (reason?: any) => void }>();
    private requestHandler: RequestHandler | null = null;
    private systemSubscribers: ((message: KenshoMessage) => void)[] = [];

    // NOUVEAU : Gestion de l'OfflineQueue
    private readonly offlineQueue = new OfflineQueue();
    private knownWorkers = new Set<WorkerName>();
    private cleanupInterval: NodeJS.Timeout;

    // NOUVEAU : Cache pour la détection de doublons
    private recentlyProcessedRequests = new Map<string, { response: any, error?: SerializedError, timestamp: number }>();
    private cacheCleanupTimer: NodeJS.Timeout;

    private static readonly CACHE_MAX_AGE_MS = 60000; // 60 secondes
    private static readonly CACHE_CLEANUP_INTERVAL_MS = 10000; // 10 secondes

    constructor(name: WorkerName, config: MessageBusConfig = {}) {
        this.workerName = name;
        this.transport = config.transport ?? new BroadcastTransport();
        this.transport.onMessage(this.handleIncomingMessage.bind(this));
        this.defaultTimeout = config.defaultTimeout ?? 5000;

        // S'ajouter soi-même à la liste des workers connus
        this.knownWorkers.add(name);

        // Nettoyer périodiquement les messages expirés (toutes les 30 secondes)
        this.cleanupInterval = setInterval(() => {
            this.offlineQueue.cleanExpiredMessages();
        }, 30000);

        // Démarrer le nettoyage périodique du cache de détection de doublons
        this.cacheCleanupTimer = setInterval(() => {
            this.cleanupRequestCache();
        }, MessageBus.CACHE_CLEANUP_INTERVAL_MS);
    }

    private validateMessage(message: KenshoMessage): boolean {
        if (!message.sourceWorker || !message.targetWorker || !message.type) {
            console.error(`[MessageBus] Invalid message received: missing source, target, or type.`, message);
            return false;
        }
        return true;
    }

    private handleIncomingMessage(message: KenshoMessage): void {
        // NOUVEAU : Notifier les abonnés système de chaque message reçu
        this.systemSubscribers.forEach(cb => cb(message));

        if (!this.validateMessage(message) || message.targetWorker !== this.workerName) {
            return;
        }

        switch (message.type) {
            case 'response':
                this.processResponseMessage(message);
                break;
            case 'request':
                this.processRequestMessage(message);
                break;
        }
    }

    private processResponseMessage(message: KenshoMessage): void {
        if (!message.responseFor) return;
        const pending = this.pendingRequests.get(message.responseFor);
        if (pending) {
            if (message.error) {
                const err = new Error(message.error.message);
                err.stack = message.error.stack;
                err.name = message.error.name;
                pending.reject(err);
            } else {
                pending.resolve(message.payload);
            }
            this.pendingRequests.delete(message.responseFor);
        }
    }

    private async processRequestMessage(message: KenshoMessage): Promise<void> {
        // NOUVEAU : Vérifier le cache de détection de doublons
        const cachedEntry = this.recentlyProcessedRequests.get(message.messageId);
        if (cachedEntry) {
            console.warn(`[MessageBus] Doublon de requête détecté (${message.messageId}). Retour de la réponse mise en cache.`);
            this.sendResponse(message, cachedEntry.response, cachedEntry.error);
            return;
        }

        if (!this.requestHandler) {
            const noHandlerError: SerializedError = {
                name: 'NoHandlerError',
                message: `No request handler registered for worker '${this.workerName}'`
            };
            // Mettre en cache l'erreur
            this.recentlyProcessedRequests.set(message.messageId, {
                response: null,
                error: noHandlerError,
                timestamp: Date.now()
            });
            return this.sendResponse(message, null, noHandlerError);
        }

        try {
            const responsePayload = await this.requestHandler(message.payload);
            // Mettre en cache la réponse en cas de succès
            this.recentlyProcessedRequests.set(message.messageId, {
                response: responsePayload,
                timestamp: Date.now()
            });
            this.sendResponse(message, responsePayload);
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Unknown error in request handler');
            const serializedError: SerializedError = {
                message: err.message,
                stack: err.stack,
                name: err.name,
            };
            // Mettre en cache la réponse en cas d'erreur
            this.recentlyProcessedRequests.set(message.messageId, {
                response: null,
                error: serializedError,
                timestamp: Date.now()
            });
            this.sendResponse(message, null, serializedError);
        }
    }

    private sendResponse(originalMessage: KenshoMessage, payload: any, error?: SerializedError): void {
        this.sendMessage({
            type: 'response',
            sourceWorker: this.workerName,
            targetWorker: originalMessage.sourceWorker,
            payload,
            error,
            responseFor: originalMessage.messageId,
            traceId: originalMessage.traceId,
        });
    }

    private sendMessage(message: Omit<KenshoMessage, 'messageId'> & { messageId?: string }): string {
        const fullMessage: KenshoMessage = {
            messageId: message.messageId || crypto.randomUUID(),
            ...message,
        };
        this.transport.send(fullMessage);
        return fullMessage.messageId;
    }

    public setCurrentTraceId(traceId: string | null): void {
        this.currentTraceId = traceId;
    }

    public setRequestHandler(handler: RequestHandler): void {
        this.requestHandler = handler;
    }

    // NOUVEAU : Méthode pour s'abonner au flux de messages
    public subscribeToSystemMessages(callback: (message: KenshoMessage) => void): void {
        this.systemSubscribers.push(callback);
    }

    // NOUVEAU : Méthode pour diffuser un message système à tous
    public broadcastSystemMessage(type: string, payload: any): void {
        this.sendMessage({
            type: 'broadcast',
            sourceWorker: this.workerName,
            targetWorker: '*',
            payload: { systemType: type, ...payload },
            traceId: `system-trace-${crypto.randomUUID()}`,
        });
    }

    public sendSystemMessage(target: WorkerName, type: string, payload: any): void {
        this.sendMessage({
            type: 'broadcast',
            sourceWorker: this.workerName,
            targetWorker: target,
            payload: { systemType: type, ...payload },
            traceId: `system-trace-${crypto.randomUUID()}`,
        });
    }

    public request<TResponse>(target: WorkerName, payload: any, timeout?: number): Promise<TResponse> {
        return new Promise<TResponse>((resolve, reject) => {
            const traceId = this.currentTraceId || `trace-${crypto.randomUUID()}`;
            const actualTimeout = timeout ?? this.defaultTimeout;

            // Si le worker n'est pas connu, mettre en file d'attente
            if (!this.knownWorkers.has(target)) {
                console.warn(`[MessageBus] '${target}' est hors ligne. Mise en file d'attente de la requête.`);

                const message: KenshoMessage = {
                    messageId: crypto.randomUUID(),
                    traceId,
                    type: 'request',
                    sourceWorker: this.workerName,
                    targetWorker: target,
                    payload
                };

                this.offlineQueue.enqueue(target, message);

                // Attendre que le worker revienne en ligne
                this.waitForWorkerAndRetry(target, message.messageId, actualTimeout, resolve, reject);
                return;
            }

            // Envoyer la requête normalement
            const messageId = this.sendMessage({
                type: 'request',
                sourceWorker: this.workerName,
                targetWorker: target,
                payload,
                traceId,
            });

            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(messageId);
                reject(new Error(`Request to '${target}' timed out after ${actualTimeout}ms (Trace: ${traceId})`));
            }, actualTimeout);

            this.pendingRequests.set(messageId, {
                resolve: (value) => { clearTimeout(timeoutId); resolve(value); },
                reject: (reason) => { clearTimeout(timeoutId); reject(reason); }
            });
        });
    }

    private waitForWorkerAndRetry<TResponse>(
        target: WorkerName,
        originalMessageId: string,
        timeout: number,
        resolve: (value: TResponse) => void,
        reject: (reason?: any) => void
    ): void {
        const startTime = Date.now();

        const checkInterval = setInterval(() => {
            if (this.pendingRequests.has(originalMessageId)) {
                clearInterval(checkInterval);
                return;
            }

            if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                reject(new Error(`Le worker '${target}' n'est pas revenu en ligne dans le délai de ${timeout}ms.`));
            }
        }, 100);
    }

    public notifyWorkerOnline(workerName: WorkerName): void {
        const wasOffline = !this.knownWorkers.has(workerName);
        this.knownWorkers.add(workerName);

        if (wasOffline && this.offlineQueue.hasQueuedMessages(workerName)) {
            console.log(`[MessageBus] '${workerName}' est maintenant en ligne. Flush de la queue.`);
            const queuedMessages = this.offlineQueue.flush(workerName);

            queuedMessages.forEach(message => {
                if (message.type === 'request') {
                    this.transport.send(message);

                    if (!this.pendingRequests.has(message.messageId)) {
                        this.pendingRequests.set(message.messageId, {
                            resolve: () => { },
                            reject: () => { }
                        });
                    }
                } else {
                    this.transport.send(message);
                }
            });
        }
    }

    public notifyWorkerOffline(workerName: WorkerName): void {
        this.knownWorkers.delete(workerName);
        console.log(`[MessageBus] '${workerName}' est maintenant hors ligne.`);
    }

    public getQueueStats() {
        return this.offlineQueue.getStats();
    }

    /**
     * NOUVEAU : Nettoyage périodique du cache pour éviter les fuites de mémoire
     */
    private cleanupRequestCache(): void {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [messageId, entry] of this.recentlyProcessedRequests.entries()) {
            if ((now - entry.timestamp) > MessageBus.CACHE_MAX_AGE_MS) {
                this.recentlyProcessedRequests.delete(messageId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`[MessageBus] Cache cleanup: ${cleanedCount} entrée(s) expirée(s) supprimée(s).`);
        }
    }

    /**
     * NOUVEAU : Renvoie un message existant (pour les tests et le flush de queue)
     */
    public resendMessage(message: KenshoMessage): void {
        this.transport.send(message);
    }

    public dispose(): void {
        clearInterval(this.cleanupInterval);
        clearInterval(this.cacheCleanupTimer);
        this.transport.dispose();
    }
}
