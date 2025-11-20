// src/core/communication/managers/StreamManager.ts

import { KenshoMessage, WorkerName } from '../types';

export interface StreamCallbacks<TChunk = unknown> {
    onChunk: (chunk: TChunk) => void;
    onEnd: (finalPayload?: unknown) => void;
    onError: (error: Error) => void;
    timeout?: number; // Timeout en millisecondes pour ce stream spécifique
}

interface ActiveStream<TChunk = unknown> {
    callbacks: StreamCallbacks<TChunk>;
    lastActivity: number;
    streamId: string;
    target: WorkerName;
    timeout: number; // Timeout pour ce stream (par défaut ou personnalisé)
    createdAt: number; // Timestamp de création pour tracking
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
        const now = Date.now();
        
        // Utiliser le timeout personnalisé du callback ou le timeout par défaut
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
     * Annule un stream manuellement (côté consommateur).
     * @param streamId - L'ID du stream à annuler
     * @param reason - Raison optionnelle de l'annulation
     */
    public cancelStream(streamId: string, reason?: string): boolean {
        const stream = this.activeStreams.get(streamId);
        if (!stream) {
            return false;
        }

        // Notifier l'erreur d'annulation
        try {
            const error = new Error(reason || 'Stream cancelled');
            (error as any).code = 'STREAM_CANCELLED';
            stream.callbacks.onError(error);
        } catch (error) {
            console.error(`[StreamManager] Error in onError callback:`, error);
        }

        this.activeStreams.delete(streamId);
        return true;
    }

    /**
     * Gère un message de cancel de stream entrant (du producteur ou consommateur).
     * Ceci nettoie le stream et appelle le callback onError.
     */
    public handleCancel(message: KenshoMessage): boolean {
        if (!message.streamId) {
            return false;
        }

        const reason = message.payload as string || 'Stream cancelled by remote';
        return this.cancelStream(message.streamId, reason);
    }

    /**
     * Nettoie les streams inactifs (timeout).
     */
    private cleanupInactiveStreams(): void {
        const now = Date.now();
        let cleanedCount = 0;

        this.activeStreams.forEach((stream, streamId) => {
            const inactiveDuration = now - stream.lastActivity;
            // Utiliser le timeout spécifique du stream au lieu du timeout global
            if (inactiveDuration > stream.timeout) {
                console.log(`[StreamManager] Stream ${streamId} timed out after ${inactiveDuration}ms of inactivity (timeout: ${stream.timeout}ms)`);

                try {
                    const error = new Error(`Stream timeout: no activity for ${inactiveDuration}ms`);
                    (error as any).code = 'STREAM_TIMEOUT';
                    stream.callbacks.onError(error);
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
