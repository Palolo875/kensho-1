// src/core/communication/managers/StreamManager.ts

import { KenshoMessage, WorkerName } from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('StreamManager');

export interface StreamCallbacks<TChunk = unknown> {
    onChunk: (chunk: TChunk) => void;
    onEnd: (finalPayload?: unknown) => void;
    onError: (error: Error) => void;
    timeout?: number;
}

interface ErrorWithCode extends Error {
    code?: string;
}

interface ActiveStream<TChunk = unknown> {
    callbacks: StreamCallbacks<TChunk>;
    lastActivity: number;
    streamId: string;
    target: WorkerName;
    timeout: number;
    createdAt: number;
}

/**
 * StreamManager gère le cycle de vie des streams (requêtes avec plusieurs réponses).
 */
export class StreamManager {
    private activeStreams = new Map<string, ActiveStream>();
    private cleanupTimer: ReturnType<typeof setInterval>;

    private static readonly STREAM_TIMEOUT_MS = 300000;
    private static readonly CLEANUP_INTERVAL_MS = 60000;

    constructor() {
        this.cleanupTimer = setInterval(() => this.cleanupInactiveStreams(), StreamManager.CLEANUP_INTERVAL_MS);
    }

    public createStream<TChunk>(
        target: WorkerName,
        callbacks: StreamCallbacks<TChunk>
    ): string {
        const streamId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();
        const timeout = callbacks.timeout ?? StreamManager.STREAM_TIMEOUT_MS;

        this.activeStreams.set(streamId, {
            callbacks: callbacks as StreamCallbacks,
            lastActivity: now,
            createdAt: now,
            streamId,
            target,
            timeout
        });

        return streamId;
    }

    public handleChunk(message: KenshoMessage): boolean {
        if (!message.streamId) {
            return false;
        }

        const stream = this.activeStreams.get(message.streamId);
        if (!stream) {
            return false;
        }

        stream.lastActivity = Date.now();

        try {
            stream.callbacks.onChunk(message.payload);
        } catch (err: unknown) {
            log.error('Error in onChunk callback', err as Error);
        }

        return true;
    }

    public handleEnd(message: KenshoMessage): boolean {
        if (!message.streamId) {
            return false;
        }

        const stream = this.activeStreams.get(message.streamId);
        if (!stream) {
            return false;
        }

        this.activeStreams.delete(message.streamId);

        try {
            stream.callbacks.onEnd(message.payload);
        } catch (err: unknown) {
            log.error('Error in onEnd callback', err as Error);
        }

        return true;
    }

    public handleError(message: KenshoMessage): boolean {
        if (!message.streamId) {
            return false;
        }

        const stream = this.activeStreams.get(message.streamId);
        if (!stream) {
            return false;
        }

        this.activeStreams.delete(message.streamId);

        const errorPayload = message.error;
        const error = new Error(errorPayload?.message || 'Unknown stream error') as ErrorWithCode;
        error.name = errorPayload?.name || 'StreamError';
        error.code = errorPayload?.code;

        try {
            stream.callbacks.onError(error);
        } catch (err: unknown) {
            log.error('Error in onError callback', err as Error);
        }

        return true;
    }

    public cancelStream(streamId: string, reason?: string): boolean {
        const stream = this.activeStreams.get(streamId);
        if (!stream) {
            log.warn(`Cannot cancel stream ${streamId}: not found`);
            return false;
        }

        this.activeStreams.delete(streamId);

        const error = new Error(reason || 'Stream cancelled') as ErrorWithCode;
        error.code = 'STREAM_CANCELLED';

        try {
            stream.callbacks.onError(error);
        } catch (err: unknown) {
            log.error('Error in onError callback during cancel', err as Error);
        }

        log.debug(`Stream ${streamId} cancelled: ${reason || 'no reason'}`);
        return true;
    }

    public handleCancel(message: KenshoMessage): boolean {
        if (!message.streamId) {
            return false;
        }

        const reason = (message.payload as string) || 'Stream cancelled by remote';
        return this.cancelStream(message.streamId, reason);
    }

    private cleanupInactiveStreams(): void {
        const now = Date.now();
        let cleanedCount = 0;

        this.activeStreams.forEach((stream, streamId) => {
            const inactiveDuration = now - stream.lastActivity;
            if (inactiveDuration > stream.timeout) {
                log.debug(`Stream ${streamId} timed out after ${inactiveDuration}ms of inactivity`);

                try {
                    const error = new Error(`Stream timeout: no activity for ${inactiveDuration}ms`) as ErrorWithCode;
                    error.code = 'STREAM_TIMEOUT';
                    stream.callbacks.onError(error);
                } catch (err: unknown) {
                    log.error('Error in onError callback during timeout cleanup', err as Error);
                }

                this.activeStreams.delete(streamId);
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            log.debug(`Cleaned up ${cleanedCount} inactive stream(s)`);
        }
    }

    public hasStream(streamId: string): boolean {
        return this.activeStreams.has(streamId);
    }

    public getStreamTarget(streamId: string): WorkerName | undefined {
        return this.activeStreams.get(streamId)?.target;
    }

    public getActiveCount(): number {
        return this.activeStreams.size;
    }

    public getStats(): {
        activeCount: number;
        activeStreams: Array<{
            streamId: string;
            target: WorkerName;
            inactiveDuration: number;
            totalDuration: number;
            timeout: number;
            timeoutRemaining: number;
        }>;
    } {
        const now = Date.now();
        return {
            activeCount: this.activeStreams.size,
            activeStreams: Array.from(this.activeStreams.entries()).map(([streamId, stream]) => ({
                streamId,
                target: stream.target,
                inactiveDuration: now - stream.lastActivity,
                totalDuration: now - stream.createdAt,
                timeout: stream.timeout,
                timeoutRemaining: Math.max(0, stream.timeout - (now - stream.lastActivity))
            }))
        };
    }

    public dispose(): void {
        clearInterval(this.cleanupTimer);

        this.activeStreams.forEach((stream) => {
            try {
                stream.callbacks.onError(new Error('StreamManager disposed'));
            } catch (err: unknown) {
                log.error('Error in onError callback during dispose', err as Error);
            }
        });

        this.activeStreams.clear();
    }
}
