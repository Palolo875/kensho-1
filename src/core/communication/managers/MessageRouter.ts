// src/core/communication/managers/MessageRouter.ts

import { KenshoMessage } from '../types';

export type MessageHandler = (message: KenshoMessage) => void | Promise<void>;

export interface MessageHandlers {
    onRequest?: MessageHandler;
    onStreamRequest?: MessageHandler;
    onResponse?: MessageHandler;
    onStreamChunk?: MessageHandler;
    onStreamEnd?: MessageHandler;
    onStreamError?: MessageHandler;
    onBroadcast?: MessageHandler;
    onUnknown?: MessageHandler;
}

/**
 * MessageRouter route les messages entrants vers les bons handlers.
 * 
 * Responsabilités :
 * - Valider les messages entrants
 * - Router selon le type de message
 * - Gérer les messages inconnus
 */
export class MessageRouter {
    private handlers: MessageHandlers = {};

    /**
     * Configure les handlers pour chaque type de message.
     */
    public setHandlers(handlers: MessageHandlers): void {
        this.handlers = handlers;
    }

    /**
     * Route un message vers le bon handler.
     */
    public route(message: KenshoMessage): boolean {
        if (!this.validateMessage(message)) {
            console.warn('[MessageRouter] Invalid message', message);
            return false;
        }

        const handler = this.getHandlerForMessage(message);
        if (!handler) {
            if (this.handlers.onUnknown) {
                this.handlers.onUnknown(message);
            } else {
                console.warn(`[MessageRouter] No handler for message type: ${message.type}`, message);
            }
            return false;
        }

        try {
            const result = handler(message);
            // Si le handler retourne une Promise, on la log en cas d'erreur
            if (result instanceof Promise) {
                result.catch(error => {
                    console.error(`[MessageRouter] Handler error for ${message.type}:`, error);
                });
            }
            return true;
        } catch (error) {
            console.error(`[MessageRouter] Handler error for ${message.type}:`, error);
            return false;
        }
    }

    /**
     * Retourne le handler approprié pour un message.
     */
    private getHandlerForMessage(message: KenshoMessage): MessageHandler | undefined {
        switch (message.type) {
            case 'request':
                return message.streamId ? this.handlers.onStreamRequest : this.handlers.onRequest;
            case 'response':
                return this.handlers.onResponse;
            case 'stream_chunk':
                return this.handlers.onStreamChunk;
            case 'stream_end':
                return this.handlers.onStreamEnd;
            case 'stream_error':
                return this.handlers.onStreamError;
            case 'broadcast':
                return this.handlers.onBroadcast;
            default:
                return this.handlers.onUnknown;
        }
    }

    /**
     * Valide qu'un message a les champs requis.
     */
    private validateMessage(message: KenshoMessage): boolean {
        if (!message || typeof message !== 'object') {
            return false;
        }

        if (!message.messageId || !message.type) {
            return false;
        }

        return true;
    }

    /**
     * Retourne les statistiques pour l'observabilité.
     */
    public getStats() {
        return {
            handlersRegistered: {
                request: !!this.handlers.onRequest,
                streamRequest: !!this.handlers.onStreamRequest,
                response: !!this.handlers.onResponse,
                streamChunk: !!this.handlers.onStreamChunk,
                streamEnd: !!this.handlers.onStreamEnd,
                streamError: !!this.handlers.onStreamError,
                broadcast: !!this.handlers.onBroadcast,
                unknown: !!this.handlers.onUnknown
            }
        };
    }
}
