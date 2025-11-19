// src/core/communication/OfflineQueue.ts
import { KenshoMessage, WorkerName } from './types';
import { StorageAdapter, STORES } from '../storage/types';

interface QueuedMessage {
    message: KenshoMessage;
    enqueuedAt: number;
}

/**
 * Gère la mise en file d'attente des messages destinés à des workers
 * qui ne sont pas encore connus ou actifs dans la constellation.
 * 
 * Supporte la persistance via IndexedDB pour survivre aux rechargements.
 */
export class OfflineQueue {
    private queues = new Map<WorkerName, QueuedMessage[]>();
    private storage?: StorageAdapter;
    private initPromise: Promise<void>;

    // Protections pour éviter une consommation de mémoire incontrôlée
    private static readonly MAX_QUEUE_SIZE = 100;
    private static readonly MAX_MESSAGE_AGE_MS = 60000; // 60 secondes

    constructor(storage?: StorageAdapter) {
        this.storage = storage;
        this.initPromise = this.loadFromStorage();
    }

    /**
     * Charge les messages en attente depuis le stockage persistant.
     */
    private async loadFromStorage(): Promise<void> {
        if (!this.storage) return;

        try {
            const allQueues = await this.storage.getAll<{ target: WorkerName; messages: QueuedMessage[] }>(STORES.OFFLINE_QUEUE);

            allQueues.forEach(entry => {
                this.queues.set(entry.target, entry.messages);
            });

            const totalMessages = allQueues.reduce((sum, entry) => sum + entry.messages.length, 0);
            if (totalMessages > 0) {
                console.log(`[OfflineQueue] ${totalMessages} message(s) restauré(s) depuis IndexedDB.`);
            }
        } catch (error) {
            console.error('[OfflineQueue] Erreur lors du chargement depuis le stockage:', error);
        }
    }

    /**
     * Sauvegarde une file d'attente spécifique dans le stockage.
     */
    private async saveQueue(target: WorkerName): Promise<void> {
        if (!this.storage) return;

        try {
            const messages = this.queues.get(target);
            if (messages && messages.length > 0) {
                await this.storage.set(STORES.OFFLINE_QUEUE, target, {
                    target,
                    messages
                });
            } else {
                // Si la queue est vide, la supprimer du stockage
                await this.storage.delete(STORES.OFFLINE_QUEUE, target);
            }
        } catch (error) {
            console.error(`[OfflineQueue] Erreur lors de la sauvegarde de la queue '${target}':`, error);
        }
    }

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

        // Sauvegarder dans le storage (fire-and-forget pour ne pas bloquer)
        this.saveQueue(target).catch(err =>
            console.error(`[OfflineQueue] Échec de la sauvegarde pour '${target}':`, err)
        );
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

        // Supprimer du storage
        this.saveQueue(target).catch(err =>
            console.error(`[OfflineQueue] Échec de la suppression du storage pour '${target}':`, err)
        );

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
