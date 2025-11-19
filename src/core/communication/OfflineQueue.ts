// src/core/communication/OfflineQueue.ts
import { KenshoMessage, WorkerName } from './types';

interface QueuedMessage {
    message: KenshoMessage;
    enqueuedAt: number;
}

/**
 * Gère la mise en file d'attente des messages destinés à des workers
 * qui ne sont pas encore connus ou actifs dans la constellation.
 */
export class OfflineQueue {
    private queues = new Map<WorkerName, QueuedMessage[]>();

    // Protections pour éviter une consommation de mémoire incontrôlée
    private static readonly MAX_QUEUE_SIZE = 100;
    private static readonly MAX_MESSAGE_AGE_MS = 60000; // 60 secondes

    /**
     * Met un message en file d'attente pour un destinataire donné.
     */
    public enqueue(target: WorkerName, message: KenshoMessage): void {
        if (!this.queues.has(target)) {
            this.queues.set(target, []);
        }

        const queue = this.queues.get(target)!;

        // Protection : ne pas dépasser la taille maximale de la file d'attente
        if (queue.length >= OfflineQueue.MAX_QUEUE_SIZE) {
            console.warn(`[OfflineQueue] La file d'attente pour '${target}' est pleine. Suppression du message le plus ancien.`);
            queue.shift(); // Supprimer le plus ancien pour faire de la place
        }

        queue.push({
            message,
            enqueuedAt: Date.now(),
        });
        console.log(`[OfflineQueue] Message ${message.messageId} mis en file d'attente pour '${target}'. Taille de la file: ${queue.length}`);
    }

    /**
     * "Flushe" la file d'attente pour un destinataire qui vient de se manifester,
     * en retournant tous les messages valides en attente.
     */
    public flush(target: WorkerName): KenshoMessage[] {
        const queue = this.queues.get(target);
        if (!queue || queue.length === 0) {
            return [];
        }

        console.log(`[OfflineQueue] '${target}' est en ligne. Flush de ${queue.length} message(s).`);

        const now = Date.now();
        const validMessages = queue.filter(qm =>
            (now - qm.enqueuedAt) < OfflineQueue.MAX_MESSAGE_AGE_MS
        );

        if (validMessages.length < queue.length) {
            console.warn(`[OfflineQueue] ${queue.length - validMessages.length} message(s) expiré(s) ont été supprimé(s) pour '${target}'.`);
        }

        // Vider la file d'attente pour ce destinataire
        this.queues.delete(target);

        return validMessages.map(qm => qm.message);
    }

    /**
     * Vérifie si un worker a des messages en attente.
     */
    public hasQueuedMessages(target: WorkerName): boolean {
        const queue = this.queues.get(target);
        return queue !== undefined && queue.length > 0;
    }

    /**
     * Retourne des statistiques sur l'état actuel des files d'attente pour l'Observatory.
     */
    public getStats(): { target: WorkerName; queueSize: number }[] {
        return Array.from(this.queues.entries()).map(([target, queue]) => ({
            target,
            queueSize: queue.length
        }));
    }

    /**
     * Nettoie périodiquement les messages expirés.
     */
    public cleanExpiredMessages(): void {
        const now = Date.now();
        let totalCleaned = 0;

        this.queues.forEach((queue, target) => {
            const initialSize = queue.length;
            const validMessages = queue.filter(qm =>
                (now - qm.enqueuedAt) < OfflineQueue.MAX_MESSAGE_AGE_MS
            );

            if (validMessages.length < initialSize) {
                const cleaned = initialSize - validMessages.length;
                totalCleaned += cleaned;

                if (validMessages.length === 0) {
                    this.queues.delete(target);
                } else {
                    this.queues.set(target, validMessages);
                }
            }
        });

        if (totalCleaned > 0) {
            console.log(`[OfflineQueue] Nettoyage : ${totalCleaned} message(s) expiré(s) supprimé(s).`);
        }
    }
}
