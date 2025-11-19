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

// Re-export StreamCallbacks for public API compatibility
export type { StreamCallbacks };

export interface MessageBusConfig {
    defaultTimeout?: number;
    transport?: NetworkTransport;
    storage?: StorageAdapter;
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

    private currentTraceId: string | null = null;
    private systemMessageSubscribers: Set<(message: KenshoMessage) => void> = new Set();

    constructor(name: WorkerName, config: MessageBusConfig = {}) {
        this.workerName = name;
        this.transport = config.transport || new BroadcastTransport(name);

        // Initialize Managers
        this.requestManager = new RequestManager(config.defaultTimeout);
        this.streamManager = new StreamManager();
        this.duplicateDetector = new DuplicateDetector();
        this.messageRouter = new MessageRouter();

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
        // 1. Validation basique
        if (!this.validateMessage(message)) {
            return;
        }

        // 2. Ignorer ses propres messages (sauf si boucle locale désirée, mais généralement non)
        if (message.sourceWorker === this.workerName) {
            return;
        }

        // 3. Router le message
        this.messageRouter.route(message);
    }

    private validateMessage(message: KenshoMessage): boolean {
        return !!(message && message.messageId && message.type);
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
            const error = { message: `No handler for request in ${this.workerName}`, code: 'NO_HANDLER' };
            this.sendResponse(message, null, error);
            return;
        }

        try {
            // Appeler le handler (supporte streamId si présent)
            const result = await this.requestHandler(message.payload, message.sourceWorker, message.streamId);

            // 3. Envoyer la réponse (seulement si ce n'est pas une requête de stream qui gère ses propres réponses via chunks)
            // NOTE: Dans l'implémentation précédente, on envoyait une réponse même pour stream_request 
            // pour acquitter la réception, sauf si le handler s'en occupait.
            // Regardons la logique précédente : "Only send response if it's a standard request (not a stream request)"
            // Mais wait, le code précédent disait: 
            // "if (message.type === 'request' && !message.streamId) { sendResponse... }"
            // OR "if (message.type === 'stream_request') { ... }" -> actually stream_request was handled as type='request' with streamId.

            // Si c'est une requête standard (pas de streamId), on envoie la réponse.
            // Si c'est un stream (streamId présent), le handler est responsable d'envoyer les chunks/end/error via le streamEmitter.
            // MAIS, il est parfois utile d'envoyer une réponse initiale "OK, stream started".
            // Pour l'instant, conservons la logique : réponse automatique seulement si pas de streamId.

            if (!message.streamId) {
                this.sendResponse(message, result);
            }
        } catch (error: any) {
            const serializedError = {
                message: error.message || 'Unknown error',
                code: error.code || 'INTERNAL_ERROR',
                stack: error.stack
            };
            // En cas d'erreur, on l'envoie toujours, même pour un stream (init failed)
            this.sendResponse(message, null, serializedError);
        }
    }

    private handleBroadcast(message: KenshoMessage): void {
        // Notifier les abonnés aux messages système
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

        return promise;
    }

    /**
     * Initie un stream vers une cible.
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
                code: (error as any).code || 'STREAM_ERROR'
            }
        };
        this.sendMessage(message);
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
        this.offlineQueue.flush(workerName, (msg) => {
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
        return {
            queue: this.offlineQueue.getStats(),
            requests: this.requestManager.getStats(),
            streams: this.streamManager.getStats(),
            duplicates: this.duplicateDetector.getStats(),
            router: this.messageRouter.getStats()
        };
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
