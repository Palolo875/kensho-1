// src/core/communication/managers/RequestManager.ts

import { KenshoMessage } from '../types';
import { globalMetrics } from '../../monitoring';
import { createLogger } from '@/lib/logger';

const log = createLogger('RequestManager');

interface ErrorWithCode extends Error {
    code?: string;
}

export interface PendingRequest<T = unknown> {
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
    messageId: string;
    startTime: number;
}

/**
 * RequestManager gère le cycle de vie des requêtes RPC (request/response).
 */
export class RequestManager {
    private pendingRequests = new Map<string, PendingRequest>();
    private readonly defaultTimeout: number;

    constructor(defaultTimeout: number = 5000) {
        this.defaultTimeout = defaultTimeout;
    }

    public createRequest<TResponse>(
        messageId: string,
        timeout?: number
    ): Promise<TResponse> {
        return new Promise((resolve, reject) => {
            const actualTimeout = timeout ?? this.defaultTimeout;
            const startTime = performance.now();

            const timeoutHandle = setTimeout(() => {
                const latency = performance.now() - startTime;
                globalMetrics.incrementCounter('request.timeout');
                globalMetrics.recordTiming('request.timeout.latency_ms', latency);
                this.cancelRequest(messageId);
                reject(new Error(`Request ${messageId} timed out after ${actualTimeout}ms`));
            }, actualTimeout);

            this.pendingRequests.set(messageId, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeout: timeoutHandle,
                messageId,
                startTime: performance.now()
            });
            
            globalMetrics.incrementCounter('request.created');
        });
    }

    public handleResponse(message: KenshoMessage): boolean {
        const messageId = message.correlationId;
        if (!messageId) {
            log.warn('Response message without correlationId', { messageId: message.messageId });
            return false;
        }

        const pending = this.pendingRequests.get(messageId);
        if (!pending) {
            return false;
        }

        clearTimeout(pending.timeout);
        this.pendingRequests.delete(messageId);

        const latency = performance.now() - pending.startTime;
        globalMetrics.recordTiming('request.latency_ms', latency);

        if (message.error) {
            const error = new Error(message.error.message || 'Unknown error') as ErrorWithCode;
            error.code = message.error.code;
            globalMetrics.incrementCounter('request.failed');
            globalMetrics.recordTiming('request.failed.latency_ms', latency);
            pending.reject(error);
        } else {
            globalMetrics.incrementCounter('request.succeeded');
            globalMetrics.recordTiming('request.succeeded.latency_ms', latency);
            pending.resolve(message.payload);
        }

        return true;
    }

    public cancelRequest(messageId: string): boolean {
        const pending = this.pendingRequests.get(messageId);
        if (!pending) {
            return false;
        }

        clearTimeout(pending.timeout);
        this.pendingRequests.delete(messageId);
        return true;
    }

    public hasPendingRequest(messageId: string): boolean {
        return this.pendingRequests.has(messageId);
    }

    public getPendingCount(): number {
        return this.pendingRequests.size;
    }

    public getStats(): {
        pendingCount: number;
        pendingRequests: string[];
        oldestRequest: number;
    } {
        globalMetrics.recordGauge('request.pending_count', this.pendingRequests.size);
        
        return {
            pendingCount: this.pendingRequests.size,
            pendingRequests: Array.from(this.pendingRequests.keys()),
            oldestRequest: this.getOldestRequestAge()
        };
    }
    
    private getOldestRequestAge(): number {
        let oldest = 0;
        const now = performance.now();
        
        for (const pending of this.pendingRequests.values()) {
            const age = now - pending.startTime;
            if (age > oldest) {
                oldest = age;
            }
        }
        
        return oldest;
    }

    public dispose(): void {
        this.pendingRequests.forEach(pending => {
            clearTimeout(pending.timeout);
            pending.reject(new Error('RequestManager disposed'));
        });
        this.pendingRequests.clear();
    }
}
