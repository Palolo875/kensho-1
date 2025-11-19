// src/core/communication/MessageBus.ts

import { KenshoMessage, WorkerName, RequestHandler, SerializedError } from './types';
import { NetworkTransport } from './transport/NetworkTransport';
import { BroadcastTransport } from './transport/BroadcastTransport';

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

    constructor(name: WorkerName, config: MessageBusConfig = {}) {
        this.workerName = name;
        this.transport = config.transport ?? new BroadcastTransport();
        this.transport.onMessage(this.handleIncomingMessage.bind(this));
        this.defaultTimeout = config.defaultTimeout ?? 5000;
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
        if (!this.requestHandler) {
            return this.sendResponse(message, null, { name: 'NoHandlerError', message: `No request handler registered for worker '${this.workerName}'` });
        }
        try {
            const responsePayload = await this.requestHandler(message.payload);
            this.sendResponse(message, responsePayload);
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Unknown error in request handler');
            const serializedError: SerializedError = {
                message: err.message,
                stack: err.stack,
                name: err.name,
            };
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
        // Un message système est envoyé à une cible spéciale '*' que tout le monde écoute
        // mais que personne ne traite comme une requête.
        this.sendMessage({
            type: 'broadcast',
            sourceWorker: this.workerName,
            targetWorker: '*', // Cible spéciale pour les messages de diffusion générale
            payload: { systemType: type, ...payload },
            traceId: `system-trace-${crypto.randomUUID()}`,
        });
    }

    public sendSystemMessage(target: WorkerName, type: string, payload: any): void {
        this.sendMessage({
            type: 'broadcast', // Send as broadcast so it's picked up by subscribers
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

    public dispose(): void {
        this.transport.dispose();
    }
}
