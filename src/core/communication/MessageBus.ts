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
import { createLogger } from '@/lib/logger';

const log = createLogger('MessageBus');

export type { StreamCallbacks };

export interface MessageBusConfig {
    defaultTimeout?: number;
    transport?: NetworkTransport;
    storage?: StorageAdapter;
    enableMetrics?: boolean;
}

interface ErrorWithCode extends Error {
    code?: string;
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
        this.metricsEnabled = config.enableMetrics !== false;

        this.requestManager = new RequestManager(config.defaultTimeout);
        this.streamManager = new StreamManager();
        this.duplicateDetector = new DuplicateDetector();
        this.messageRouter = new MessageRouter();
        this.metricsCollector = new MetricsCollector();

        this.offlineQueue = new OfflineQueue(config.storage);

        this.setupMessageHandlers();

        this.transport.onMessage((message) => this.handleIncomingMessage(message));
    }

    private setupMessageHandlers(): void {
        this.messageRouter.setHandlers({
            onRequest: (msg) => this.handleRequest(msg),
            onStreamRequest: (msg) => this.handleRequest(msg),
            onResponse: (msg) => { this.requestManager.handleResponse(msg); },
            onStreamChunk: (msg) => { this.streamManager.handleChunk(msg); },
            onStreamEnd: (msg) => { this.streamManager.handleEnd(msg); },
            onStreamError: (msg) => { this.streamManager.handleError(msg); },
            onStreamCancel: (msg) => {
                this.streamManager.handleCancel(msg);
                this.notifySystemSubscribers(msg);
            },
            onBroadcast: (msg) => this.handleBroadcast(msg),
            onUnknown: (msg) => {
                log.warn(`Unknown message type: ${msg.type}`, { messageId: msg.messageId });
            }
        });
    }

    private handleIncomingMessage(message: KenshoMessage): void {
        if (!payloadValidator.validate(message)) {
            const sourceWorker = (message as KenshoMessage)?.sourceWorker || 'unknown';
            log.warn(`Invalid message rejected from ${sourceWorker}`);
            return;
        }

        if (message.sourceWorker === this.workerName) {
            return;
        }

        this.messageRouter.route(message);
    }

    private async handleRequest(message: KenshoMessage): Promise<void> {
        if (this.duplicateDetector.isDuplicate(message.messageId)) {
            log.debug(`Duplicate request detected: ${message.messageId}`);
            const cached = this.duplicateDetector.getCachedResponse(message.messageId);
            if (cached) {
                this.sendResponse(message, cached.response, cached.error);
            }
            return;
        }

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
            const result = await this.requestHandler(message.payload);

            if (!message.streamId) {
                this.sendResponse(message, result);
            }
        } catch (err: unknown) {
            const error = err as ErrorWithCode;
            const serializedError: SerializedError = {
                message: error.message || 'Unknown error',
                name: error.name || 'Error',
                code: error.code || 'INTERNAL_ERROR',
                stack: error.stack
            };
            this.sendResponse(message, null, serializedError);

            if (this.metricsEnabled) {
                this.metricsCollector.incrementCounter('error', 1, { type: serializedError.code || 'UNKNOWN' });
            }
        }
    }

    private handleBroadcast(message: KenshoMessage): void {
        this.notifySystemSubscribers(message);
    }

    private notifySystemSubscribers(message: KenshoMessage): void {
        this.systemMessageSubscribers.forEach(callback => {
            try {
                callback(message);
            } catch (err: unknown) {
                log.error('Error in system message subscriber', err as Error);
            }
        });
    }

    private sendResponse(originalMessage: KenshoMessage, payload: unknown, error?: SerializedError): void {
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

    public async request<TResponse>(
        target: WorkerName,
        payload: unknown,
        timeout?: number
    ): Promise<TResponse> {
        const messageId = this.generateMessageId();
        const startTime = performance.now();

        const promise = this.requestManager.createRequest<TResponse>(messageId, timeout);

        const message: KenshoMessage = {
            messageId,
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: target,
            type: 'request',
            payload
        };

        this.sendMessage(message);

        try {
            const result = await promise;

            if (this.metricsEnabled) {
                const latency = performance.now() - startTime;
                this.metricsCollector.recordTiming('request_latency', latency, { target, status: 'success' });
                this.metricsCollector.incrementCounter('request_success', 1, { target });
            }

            return result;
        } catch (err: unknown) {
            if (this.metricsEnabled) {
                const latency = performance.now() - startTime;
                const error = err as ErrorWithCode;
                this.metricsCollector.recordTiming('request_latency', latency, { target, status: 'error' });
                this.metricsCollector.incrementCounter('request_error', 1, { target, code: error.code || 'UNKNOWN' });
            }
            throw err;
        }
    }

    public requestStream<TChunk>(
        target: WorkerName,
        payload: unknown,
        callbacks: StreamCallbacks<TChunk>
    ): string {
        const streamId = this.streamManager.createStream(target, callbacks);
        const messageId = this.generateMessageId();

        const message: KenshoMessage = {
            messageId,
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: target,
            type: 'request',
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
        const errorWithCode = error as ErrorWithCode;
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
                code: errorWithCode.code || 'STREAM_ERROR'
            }
        };
        this.sendMessage(message);
    }

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

    public cancelStream(streamId: string, reason?: string, targetWorker?: WorkerName): boolean {
        const target = targetWorker || this.streamManager.getStreamTarget(streamId);

        if (target) {
            this.sendStreamCancel(streamId, reason || 'Stream cancelled by consumer', target);
        }

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
            targetWorker: '*',
            type: 'broadcast',
            payload: { type, data: payload }
        };
        this.sendMessage(message);
    }

    public sendSystemMessage(target: WorkerName, type: string, payload: unknown): void {
        const message: KenshoMessage = {
            messageId: this.generateMessageId(),
            traceId: this.currentTraceId,
            sourceWorker: this.workerName,
            targetWorker: target,
            type: 'broadcast',
            payload: { type, data: payload }
        };
        this.sendMessage(message);
    }

    public subscribeToSystemMessages(callback: (message: KenshoMessage) => void): void {
        this.systemMessageSubscribers.add(callback);
    }

    public notifyWorkerOnline(workerName: WorkerName): void {
        const messages = this.offlineQueue.flush(workerName);
        messages.forEach(msg => {
            this.transport.send(msg);
        });
    }

    public notifyWorkerOffline(_workerName: WorkerName): void {
        // OfflineQueue handles future messages automatically
    }

    public getQueueStats(): ReturnType<OfflineQueue['getStats']> {
        return this.offlineQueue.getStats();
    }

    public getStats(): Record<string, unknown> {
        const baseStats = {
            queue: this.offlineQueue.getStats(),
            requests: this.requestManager.getStats(),
            streams: this.streamManager.getStats(),
            duplicates: this.duplicateDetector.getStats(),
            router: this.messageRouter.getStats()
        };

        if (this.metricsEnabled) {
            return {
                ...baseStats,
                metrics: this.metricsCollector.getAllMetrics()
            };
        }

        return baseStats;
    }

    public getMetricsReport(): string {
        if (!this.metricsEnabled) {
            return 'Metrics are disabled';
        }
        const metrics = this.metricsCollector.getAllMetrics();
        return JSON.stringify(metrics, null, 2);
    }

    public resetMetricsWindow(): void {
        if (this.metricsEnabled) {
            this.metricsCollector.reset();
        }
    }

    public cleanupRequestCache(): void {
        // Delegated to DuplicateDetector internal timer
    }

    public resendMessage(message: KenshoMessage): void {
        this.transport.send(message);
    }

    public waitForWorkerAndRetry<TResponse>(
        _target: WorkerName,
        _originalMessageId: string,
        _timeout: number,
        _resolve: (value: TResponse) => void,
        _reject: (reason?: unknown) => void
    ): void {
        // Deprecated/No-op in new architecture
    }

    public dispose(): void {
        this.requestManager.dispose();
        this.streamManager.dispose();
        this.duplicateDetector.dispose();
    }

    private sendMessage(message: KenshoMessage): string {
        this.transport.send(message);
        return message.messageId;
    }

    private generateMessageId(): string {
        return `${this.workerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
