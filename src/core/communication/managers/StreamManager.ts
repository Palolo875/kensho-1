// src/core/communication/managers/StreamManager.ts

import { KenshoMessage, WorkerName } from '../types';

export interface StreamCallbacks<TChunk = unknown> {
    onChunk: (chunk: TChunk) => void;
    onEnd: (finalPayload?: unknown) => void;
    onError: (error: Error) => void;
}

interface ActiveStream<TChunk = unknown> {
    callbacks: StreamCallbacks<TChunk>;
    lastActivity: number;
    streamId: string;
    target: WorkerName;
}

/**
 * StreamManager gère le cycle de vie des streams (requêtes avec plusieurs réponses).
 * 
 * Responsabilités :
 * - Créer des streams avec callbacks
 * - Router les chunks vers les bons callbacks
 * - Détecter les streams inactifs (timeout)
 * - Cleanup automatique
 */
export class StreamManager {
    private activeStreams = new Map<string, ActiveStream>();
    private cleanupTimer: NodeJS.Timeout;

    private static readonly STREAM_TIMEOUT_MS = 300000; // 5 minutes
    private static readonly CLEANUP_INTERVAL_MS = 60000; // 1 minute

    constructor() {
        // Démarrer le cleanup périodique
        this.cleanupTimer = setInterval(() => this.cleanupInactiveStreams(), StreamManager.CLEANUP_INTERVAL_MS);
    }

    /**
     * Crée un nouveau stream et retourne son ID unique.
     */
    public createStream<TChunk>(
        target: WorkerName,
        callbacks: StreamCallbacks<TChunk>
    ): string {
        const streamId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        this.activeStreams.set(streamId, {
            callbacks: callbacks as StreamCallbacks,
            lastActivity: Date.now(),
            streamId,
            target
        });

        return streamId;
    }

    /**
     * Traite un chunk de stream entrant.
     */
    public handleChunk(message: KenshoMessage): boolean {
        if (!message.streamId) {
            return false;
        }

        const stream = this.activeStreams.get(message.streamId);
        if (!stream) {
            // Le stream n'existe pas ou a déjà été terminé
            return false;
        }

        // Mettre à jour l'activité
        stream.lastActivity = Date.now();

        // Appeler le callback
        try {
            stream.callbacks.onChunk(message.payload);
        } catch (error) {
            console.error(`[StreamManager] Error in onChunk callback:`, error);
        }

        return true;
    }

    /**
     * Traite la fin d'un stream.
     */
    public handleEnd(message: KenshoMessage): boolean {
        if (!message.streamId) {
            return false;
        }

        const stream = this.activeStreams.get(message.streamId);
        if (!stream) {
            return false;
        }

        // Appeler le callback de fin
        try {
            stream.callbacks.onEnd(message.payload);
        } catch (error) {
            console.error(`[StreamManager] Error in onEnd callback:`, error);
        }

        // Nettoyer le stream
        this.activeStreams.delete(message.streamId);
        return true;
    }

    /**
     * Traite une erreur de stream.
     */
    public handleError(message: KenshoMessage): boolean {
        if (!message.streamId) {
            return false;
        }

        const stream = this.activeStreams.get(message.streamId);
        if (!stream) {
            return false;
        }

        // Créer l'objet Error depuis le message
        const error = new Error(message.error?.message || 'Stream error');
        if (message.error?.code) {
            (error as Error & { code?: string }).code = message.error.code;
        }

        // Appeler le callback d'erreur
        try {
            stream.callbacks.onError(error);
        } catch (err) {
            console.error(`[StreamManager] Error in onError callback:`, err);
        }

        // Nettoyer le stream
        this.activeStreams.delete(message.streamId);
        return true;
    }

    /**
     * Annule un stream manuellement.
     */
    public cancelStream(streamId: string): boolean {
        const stream = this.activeStreams.get(streamId);
        if (!stream) {
            return false;
        }

        // Notifier l'erreur d'annulation
        try {
            stream.callbacks.onError(new Error('Stream cancelled'));
        } catch (error) {
            console.error(`[StreamManager] Error in onError callback:`, error);
        }

        this.activeStreams.delete(streamId);
        return true;
    }

    /**
     * Nettoie les streams inactifs (timeout).
     */
    private cleanupInactiveStreams(): void {
        const now = Date.now();
        let cleanedCount = 0;

        this.activeStreams.forEach((stream, streamId) => {
            const inactiveDuration = now - stream.lastActivity;
            if (inactiveDuration > StreamManager.STREAM_TIMEOUT_MS) {
                console.log(`[StreamManager] Stream ${streamId} timed out after ${inactiveDuration}ms of inactivity`);

                try {
                    stream.callbacks.onError(new Error(`Stream timeout: no activity for ${inactiveDuration}ms`));
                } catch (error) {
                    console.error(`[StreamManager] Error in onError callback:`, error);
                }

                this.activeStreams.delete(streamId);
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            console.log(`[StreamManager] Cleaned up ${cleanedCount} inactive stream(s)`);
        }
    }

    /**
     * Vérifie si un stream est actif.
     */
    public hasStream(streamId: string): boolean {
        return this.activeStreams.has(streamId);
    }

    /**
     * Retourne le nombre de streams actifs.
     */
    public getActiveCount(): number {
        return this.activeStreams.size;
    }

    /**
     * Retourne les statistiques pour l'observabilité.
     */
    public getStats() {
        return {
            activeCount: this.activeStreams.size,
            activeStreams: Array.from(this.activeStreams.entries()).map(([streamId, stream]) => ({
                streamId,
                target: stream.target,
                inactiveDuration: Date.now() - stream.lastActivity
            }))
        };
    }

    /**
     * Nettoie tous les streams (dispose).
     */
    public dispose(): void {
        clearInterval(this.cleanupTimer);

        this.activeStreams.forEach((stream, streamId) => {
            try {
                stream.callbacks.onError(new Error('StreamManager disposed'));
            } catch (error) {
                console.error(`[StreamManager] Error in onError callback:`, error);
            }
        });

        this.activeStreams.clear();
    }
}
