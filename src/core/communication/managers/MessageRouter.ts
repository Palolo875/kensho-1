// src/core/communication/managers/MessageRouter.ts

import { KenshoMessage } from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('MessageRouter');

export type MessageHandler = (message: KenshoMessage) => void | Promise<void>;

export interface MessageHandlers {
    onRequest?: MessageHandler;
    onStreamRequest?: MessageHandler;
    onResponse?: MessageHandler;
    onStreamChunk?: MessageHandler;
    onStreamEnd?: MessageHandler;
    onStreamError?: MessageHandler;
    onStreamCancel?: MessageHandler;
    onBroadcast?: MessageHandler;
    onUnknown?: MessageHandler;
}

export interface MessageRouterConfig {
    strictMode?: boolean;
}

/**
 * MessageRouter route les messages entrants vers les bons handlers.
 */
export class MessageRouter {
    private handlers: MessageHandlers = {};
    private readonly strictMode: boolean;
    private unknownMessageCount = 0;

    constructor(config: MessageRouterConfig = {}) {
        this.strictMode = config.strictMode || false;
    }

    public setHandlers(handlers: MessageHandlers): void {
        this.handlers = handlers;
    }

    public route(message: KenshoMessage): boolean {
        if (!this.validateMessage(message)) {
            log.warn('Invalid message received', { messageId: message?.messageId });
            return false;
        }

        const handler = this.getHandlerForMessage(message);
        if (!handler) {
            this.unknownMessageCount++;
            
            if (this.handlers.onUnknown) {
                this.handlers.onUnknown(message);
            } else if (this.strictMode) {
                log.error(`STRICT MODE: Rejecting unknown message type: ${message.type}`);
                throw new Error(`Unknown message type: ${message.type}`);
            } else {
                log.warn(`No handler for message type: ${message.type}`);
            }
            return false;
        }

        try {
            const result = handler(message);
            if (result instanceof Promise) {
                result.catch((error: unknown) => {
                    log.error(`Handler error for ${message.type}`, error as Error);
                });
            }
            return true;
        } catch (error: unknown) {
            log.error(`Handler error for ${message.type}`, error as Error);
            return false;
        }
    }

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
            case 'stream_cancel':
                return this.handlers.onStreamCancel;
            case 'broadcast':
                return this.handlers.onBroadcast;
            default:
                return undefined;
        }
    }

    private validateMessage(message: KenshoMessage): boolean {
        if (!message || typeof message !== 'object') {
            return false;
        }

        if (!message.messageId || !message.type) {
            return false;
        }

        return true;
    }

    public getStats(): {
        handlersRegistered: {
            request: boolean;
            streamRequest: boolean;
            response: boolean;
            streamChunk: boolean;
            streamEnd: boolean;
            streamError: boolean;
            streamCancel: boolean;
            broadcast: boolean;
            unknown: boolean;
        };
        strictMode: boolean;
        unknownMessageCount: number;
    } {
        return {
            handlersRegistered: {
                request: !!this.handlers.onRequest,
                streamRequest: !!this.handlers.onStreamRequest,
                response: !!this.handlers.onResponse,
                streamChunk: !!this.handlers.onStreamChunk,
                streamEnd: !!this.handlers.onStreamEnd,
                streamError: !!this.handlers.onStreamError,
                streamCancel: !!this.handlers.onStreamCancel,
                broadcast: !!this.handlers.onBroadcast,
                unknown: !!this.handlers.onUnknown
            },
            strictMode: this.strictMode,
            unknownMessageCount: this.unknownMessageCount
        };
    }
}
