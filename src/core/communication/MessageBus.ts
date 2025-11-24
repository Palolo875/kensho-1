// src/core/communication/MessageBus.ts

import { KenshoMessage, WorkerName, RequestHandler, SerializedError } from './types';
import { NetworkTransport } from './transport/NetworkTransport';
import { BroadcastTransport } from './transport/BroadcastTransport';
import { OfflineQueue } from './OfflineQueue';
import { StorageAdapter } from '../storage/types';
import {
    RequestManager,
    StreamManager,
    DuplicateDetector,
    MessageRouter,
    StreamCallbacks
} from './managers';
import { MetricsCollector } from '../monitoring';
import { payloadValidator } from './validation';

// Re-export StreamCallbacks for public API compatibility
export type { StreamCallbacks };

export interface MessageBusConfig {
    defaultTimeout?: number;
    transport?: NetworkTransport;
    storage?: StorageAdapter;
    enableMetrics?: boolean;
}

/**
 * Le MessageBus est le système nerveux central de Kensho.
 * Il gère toute la communication inter-workers de manière fiable.
 * 
 * Refactored in Phase 2 to use specialized managers.
 */
export class MessageBus {
    private readonly workerName: WorkerName;
    private readonly transport: NetworkTransport;
    private readonly offlineQueue: OfflineQueue;
    private requestHandler?: RequestHandler;

    // Managers
    private readonly requestManager: RequestManager;
    private readonly streamManager: StreamManager;
    private readonly duplicateDetector: DuplicateDetector;
    private readonly messageRouter: MessageRouter;
    private readonly metricsCollector: MetricsCollector;
    private readonly metricsEnabled: boolean;

    private currentTraceId: string | null = null;
    private systemMessageSubscribers: Set<(message: KenshoMessage) => void> = new Set();

    constructor(name: WorkerName, config: MessageBusConfig = {}) {
        this.workerName = name;
        this.transport = config.transport || new BroadcastTransport(name);
        this.metricsEnabled = config.enableMetrics !== false; // Enabled by default

        // Initialize Managers
        this.requestManager = new RequestManager(config.defaultTimeout);
        this.streamManager = new StreamManager();
        this.duplicateDetector = new DuplicateDetector();
        this.messageRouter = new MessageRouter();
        this.metricsCollector = new MetricsCollector();

        // Initialize OfflineQueue
        this.offlineQueue = new OfflineQueue(config.storage);

        // Setup Router Handlers
        this.setupMessageHandlers();

        // Setup Transport
        this.transport.onMessage((message) => this.handleIncomingMessage(message));
    }

    private setupMessageHandlers() {
        this.messageRouter.setHandlers({
            onRequest: (msg) => this.handleRequest(msg),
            // Stream requests are handled similarly to normal requests but might trigger different logic in handler
            onStreamRequest: (msg) => this.handleRequest(msg),
            onResponse: (msg) => { this.requestManager.handleResponse(msg); },
            onStreamChunk: (msg) => { this.streamManager.handleChunk(msg); },
            onStreamEnd: (msg) => { this.streamManager.handleEnd(msg); },
            onStreamError: (msg) => { this.streamManager.handleError(msg); },
            onStreamCancel: (msg) => {
                // Gérer côté consommateur
                this.streamManager.handleCancel(msg);
                // Notifier les subscribers système (pour les producteurs)
                this.notifySystemSubscribers(msg);
            },
            onBroadcast: (msg) => this.handleBroadcast(msg),
            onUnknown: (msg) => {
                // System messages might fall here if they don't fit standard types, 
                // or we can handle 'broadcast' type specifically if defined.
                // For now, we treat 'broadcast' as the system message type usually.
                console.warn(`[MessageBus] Unknown message type: ${msg.type}`, msg);
            }
        });
    }

    /**
     * Point d'entrée pour tous les messages entrants.
     */
    private handleIncomingMessage(message: KenshoMessage): void {
        // 1. Validation avec PayloadValidator (Zod)
        if (!payloadValidator.validate(message)) {
            const sourceWorker = (message as any)?.sourceWorker || 'unknown';
            console.warn(`[MessageBus] Invalid message rejected from ${sourceWorker}`);
            return;
        }

        // 2. Ignorer ses propres messages (sauf si boucle locale désirée, mais généralement non)
        if (message.sourceWorker === this.workerName) {
            return;
        }

        // 3. Router le message
        this.messageRouter.route(message);
    }

    /**
     * Gère une requête entrante (RPC ou Stream Init).
     */
    private async handleRequest(message: KenshoMessage): Promise<void> {
        // 1. Détection de doublons
        if (this.duplicateDetector.isDuplicate(message.messageId)) {
            console.warn(`[MessageBus] Duplicate request detected: ${message.messageId}`);
            const cached = this.duplicateDetector.getCachedResponse(message.messageId);
            if (cached) {
                // Renvoyer la réponse mise en cache
                this.sendResponse(message, cached.response, cached.error);
            }
            return;
        }

        // 2. Traitement
        if (!this.requestHandler) {
            const error: SerializedError = {
                message: `No handler for request in ${this.workerName}`,
                code: 'NO_HANDLER',
                name: 'NoHandlerError'
            };
            this.sendResponse(message, null, error);
            return;
        }

        try {
            // Appeler le handler avec le payload
            const result = await this.requestHandler(message.payload);

            // 3. Envoyer la réponse (seulement si ce n'est pas une requête de stream qui gère ses propres réponses via chunks)
            if (!message.streamId) {
                this.sendResponse(message, result);
            }
        } catch (error: any) {
            const serializedError: SerializedError = {
                message: error.message || 'Unknown error',
                name: error.name || 'Error',
                code: error.code || 'INTERNAL_ERROR',
                stack: error.stack
            };
            // En cas d'erreur, on l'envoie toujours, même pour un stream (init failed)
            this.sendResponse(message, null, serializedError);

            // Collecter métrique d'erreur
            if (this.metricsEnabled) {
                this.metricsCollector.recordError(serializedError.code || 'UNKNOWN');
            }
        }
    }

    private handleBroadcast(message: KenshoMessage): void {
        this.notifySystemSubscribers(message);
    }

    /**
     * Notifie les abonnés aux messages système.
     */
    private notifySystemSubscribers(message: KenshoMessage): void {
        this.systemMessageSubscribers.forEach(callback => {
            try {
                callback(message);
            } catch (err) {
                console.error('[MessageBus] Error in system message subscriber:', err);
            }
        });
    }

    /**
     * Envoie une réponse et la met en cache.
     */
    private sendResponse(originalMessage: KenshoMessage, payload: unknown, error?: SerializedError): void {
        // Marquer comme traité pour la détection de doublons
        this.duplicateDetector.markAsProcessed(originalMessage.messageId, payload, error);

        const responseMessage: KenshoMessage = {
            messageId: this.generateMessageId(),
            traceId: originalMessage.traceId,
            sourceWorker: this.workerName,
            targetWorker: originalMessage.sourceWorker,
            type: 'response',
            correlationId: originalMessage.messageId,
            payload,
            error
        };

        this.sendMessage(responseMessage);
    }

    // --- Public API ---

    /**
     * Envoie une requête RPC et attend la réponse.
     */
    public async request<TResponse>(
        target: WorkerName,
        payload: unknown,
        timeout?: number
    ): Promise<TResponse> {
        const messageId = this.generateMessageId();
        const startTime = performance.now();

        // Créer la promesse gérée par RequestManager
        const promise = this.requestManager.createRequest<TResponse>(messageId, timeout);

        const message: KenshoMessage = {
            messageId,
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: target,
            type: 'request',
            payload
        };

        // Envoyer le message
        this.sendMessage(message);

        // Collecter les métriques
        try {
            const result = await promise;

            // Métrique: latence
            if (this.metricsEnabled) {
                const latency = performance.now() - startTime;
                this.metricsCollector.recordLatency(latency, { target, type: 'request' });
                this.metricsCollector.recordMessage({ target, type: 'request', status: 'success' });
            }

            return result;
        } catch (error) {
            // Métrique: erreur
            if (this.metricsEnabled) {
                const latency = performance.now() - startTime;
                this.metricsCollector.recordLatency(latency, { target, type: 'request', status: 'error' });
                this.metricsCollector.recordError((error as any).code || 'UNKNOWN', { target });
                this.metricsCollector.recordMessage({ target, type: 'request', status: 'error' });
            }
            throw error;
        }
    }

    /**
     * Initie un stream vers une cible et retourne l'ID du stream.
     * 
     * Cette méthode permet de recevoir des données en continu depuis un worker distant.
     * Les callbacks permettent de traiter les données au fur et à mesure de leur arrivée.
     * 
     * Cycle de vie d'un stream:
     * 1. Appel de requestStream() → création du stream et envoi de la requête initiale
     * 2. Le worker distant traite la requête et émet des chunks via AgentStreamEmitter
     * 3. Chaque chunk déclenche le callback onChunk()
     * 4. Le stream se termine via onEnd() (succès) ou onError() (échec)
     * 
     * @template TChunk - Type des données reçues dans chaque chunk
     * @param target - Nom du worker cible qui traitera le stream
     * @param payload - Données de la requête (typiquement { method: string, args: any[] })
     * @param callbacks - Callbacks pour gérer les événements du stream:
     *   - onChunk: Appelé pour chaque morceau de données reçu
     *   - onEnd: Appelé quand le stream se termine avec succès
     *   - onError: Appelé en cas d'erreur durant le stream
     * @returns L'ID unique du stream créé (utile pour cancelStream())
     * 
     * @example
     * ```typescript
     * const streamId = messageBus.requestStream(
     *   'MainLLMAgent',
     *   { method: 'generateResponse', args: ['Bonjour!'] },
     *   {
     *     onChunk: (chunk) => console.log('Reçu:', chunk.text),
     *     onEnd: () => console.log('Stream terminé'),
     *     onError: (err) => console.error('Erreur:', err)
     *   }
     * );
     * 
     * // Optionnel: annuler le stream
     * messageBus.cancelStream(streamId);
     * ```
     */
    public requestStream<TChunk>(
        target: WorkerName,
        payload: unknown,
        callbacks: StreamCallbacks<TChunk>
    ): string {
        // Créer le stream géré par StreamManager
        const streamId = this.streamManager.createStream(target, callbacks);
        const messageId = this.generateMessageId();

        const message: KenshoMessage = {
            messageId,
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: target,
            type: 'request', // On utilise 'request' avec streamId
            streamId,
            payload
        };

        this.sendMessage(message);

        return streamId;
    }

    public sendStreamChunk(streamId: string, payload: unknown, target: WorkerName): void {
        const message: KenshoMessage = {
            messageId: this.generateMessageId(),
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: target,
            type: 'stream_chunk',
            streamId,
            payload
        };
        this.sendMessage(message);
    }

    public sendStreamEnd(streamId: string, payload: unknown, target: WorkerName): void {
        const message: KenshoMessage = {
            messageId: this.generateMessageId(),
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: target,
            type: 'stream_end',
            streamId,
            payload
        };
        this.sendMessage(message);
    }

    public sendStreamError(streamId: string, error: Error, target: WorkerName): void {
        const message: KenshoMessage = {
            messageId: this.generateMessageId(),
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: target,
            type: 'stream_error',
            streamId,
            payload: null,
            error: {
                message: error.message,
                name: error.name || 'Error',
                code: (error as any).code || 'STREAM_ERROR'
            }
        };
        this.sendMessage(message);
    }

    /**
     * Envoie un message de cancel de stream au producteur ou consommateur distant.
     */
    public sendStreamCancel(streamId: string, reason: string, target: WorkerName): void {
        const message: KenshoMessage = {
            messageId: this.generateMessageId(),
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: target,
            type: 'stream_cancel',
            streamId,
            payload: reason
        };
        this.sendMessage(message);
    }

    /**
     * Annule un stream du côté consommateur et notifie le producteur distant.
     * Ceci envoie un message stream_cancel au producteur pour qu'il arrête d'émettre.
     * 
     * @param streamId - L'ID du stream à annuler
     * @param reason - Raison optionnelle de l'annulation
     * @param targetWorker - Le worker producteur à notifier (optionnel, sera détecté depuis le stream)
     * @returns true si le stream a été annulé localement, false s'il n'existait pas
     */
    public cancelStream(streamId: string, reason?: string, targetWorker?: WorkerName): boolean {
        const stream = (this.streamManager as any).activeStreams?.get(streamId);
        const target = targetWorker || stream?.target;

        // Envoyer le message de cancel au producteur distant si on a la cible
        if (target) {
            this.sendStreamCancel(streamId, reason || 'Stream cancelled by consumer', target);
        }

        // Nettoyer localement
        return this.streamManager.cancelStream(streamId, reason);
    }

    public setRequestHandler(handler: RequestHandler): void {
        this.requestHandler = handler;
    }

    public setCurrentTraceId(traceId: string | null): void {
        this.currentTraceId = traceId;
    }

    public broadcastSystemMessage(type: string, payload: unknown): void {
        const message: KenshoMessage = {
            messageId: this.generateMessageId(),
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: '*', // Broadcast target
            type: 'broadcast', // Using 'broadcast' type instead of generic 'system'
            payload: { type, data: payload } // Wrapper pour compatibilité
        };
        this.sendMessage(message);
    }

    public sendSystemMessage(target: WorkerName, type: string, payload: unknown): void {
        // TODO: Implement direct system message if needed
        // For now, reuse broadcast or request
        const message: KenshoMessage = {
            messageId: this.generateMessageId(),
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: target,
            type: 'broadcast', // Using 'broadcast' type for system messages even if targeted
            payload: { type, data: payload }
        };
        this.sendMessage(message);
    }

    public subscribeToSystemMessages(callback: (message: KenshoMessage) => void): void {
        this.systemMessageSubscribers.add(callback);
    }

    public notifyWorkerOnline(workerName: WorkerName): void {
        // Flush offline queue for this worker
        const messages = this.offlineQueue.flush(workerName);
        messages.forEach(msg => {
            this.transport.send(msg);
        });
    }

    public notifyWorkerOffline(workerName: WorkerName): void {
        // Rien de spécial à faire pour l'instant, l'OfflineQueue gérera les futurs messages
    }

    public getQueueStats() {
        return this.offlineQueue.getStats();
    }

    public getStats() {
        const baseStats = {
            queue: this.offlineQueue.getStats(),
            requests: this.requestManager.getStats(),
            streams: this.streamManager.getStats(),
            duplicates: this.duplicateDetector.getStats(),
            router: this.messageRouter.getStats()
        };

        // Ajouter les métriques si activées
        if (this.metricsEnabled) {
            const queueStats = this.offlineQueue.getStats();
            const totalQueued = queueStats.reduce((sum, stat) => sum + stat.queueSize, 0);

            return {
                ...baseStats,
                metrics: this.metricsCollector.getSystemStats(
                    this.requestManager.getPendingCount(),
                    totalQueued,
                    (this.transport as any).getStats?.()
                )
            };
        }

        return baseStats;
    }

    /**
     * Retourne un rapport formaté des métriques
     */
    public getMetricsReport(): string {
        if (!this.metricsEnabled) {
            return 'Metrics are disabled';
        }
        return this.metricsCollector.generateReport();
    }

    /**
     * Réinitialise la fenêtre de métriques
     */
    public resetMetricsWindow(): void {
        if (this.metricsEnabled) {
            this.metricsCollector.resetWindow();
        }
    }

    public cleanupRequestCache(): void {
        // Delegated to DuplicateDetector internal timer
    }

    public resendMessage(message: KenshoMessage): void {
        this.transport.send(message);
    }

    public waitForWorkerAndRetry<TResponse>(
        target: WorkerName,
        originalMessageId: string,
        timeout: number,
        resolve: (value: TResponse) => void,
        reject: (reason?: unknown) => void
    ): void {
        // Deprecated/No-op in new architecture
    }

    public dispose(): void {
        this.requestManager.dispose();
        this.streamManager.dispose();
        this.duplicateDetector.dispose();
        // Transport dispose if needed?
    }

    // --- Private Helpers ---

    private sendMessage(message: KenshoMessage): string {
        this.transport.send(message);
        return message.messageId;
    }

    private generateMessageId(): string {
        return `${this.workerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
