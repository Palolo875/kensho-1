import { KenshoMessage, WorkerName } from './types';
import { StorageAdapter, STORES } from '../storage/types';
import { createLogger } from '../../lib/logger';

const log = createLogger('OfflineQueue');

interface QueuedMessage {
    message: KenshoMessage;
    enqueuedAt: number;
}

export class OfflineQueue {
    private queues = new Map<WorkerName, QueuedMessage[]>();
    private storage?: StorageAdapter;
    private initPromise: Promise<void>;

    private static readonly MAX_QUEUE_SIZE = 100;
    private static readonly MAX_MESSAGE_AGE_MS = 60000;

    constructor(storage?: StorageAdapter) {
        this.storage = storage;
        this.initPromise = this.loadFromStorage();
    }

    private async loadFromStorage(): Promise<void> {
        if (!this.storage) return;

        try {
            const allQueues = await this.storage.getAll<{ target: WorkerName; messages: QueuedMessage[] }>(STORES.OFFLINE_QUEUE);

            allQueues.forEach(entry => {
                this.queues.set(entry.target, entry.messages);
            });

            const totalMessages = allQueues.reduce((sum, entry) => sum + entry.messages.length, 0);
            if (totalMessages > 0) {
                log.info(`${totalMessages} message(s) restauré(s) depuis IndexedDB.`);
            }
        } catch (error) {
            log.error('Erreur lors du chargement depuis le stockage:', error as Error);
        }
    }

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
                await this.storage.delete(STORES.OFFLINE_QUEUE, target);
            }
        } catch (error) {
            log.error(`Erreur lors de la sauvegarde de la queue '${target}':`, error as Error);
        }
    }

    public enqueue(target: WorkerName, message: KenshoMessage): void {
        if (!this.queues.has(target)) {
            this.queues.set(target, []);
        }

        const queue = this.queues.get(target)!;

        if (queue.length >= OfflineQueue.MAX_QUEUE_SIZE) {
            log.warn(`La file d'attente pour '${target}' est pleine. Suppression du message le plus ancien.`);
            queue.shift();
        }

        queue.push({
            message,
            enqueuedAt: Date.now(),
        });
        log.debug(`Message ${message.messageId} mis en file d'attente pour '${target}'. Taille de la file: ${queue.length}`);

        this.saveQueue(target).catch(err =>
            log.error(`Échec de la sauvegarde pour '${target}':`, err as Error)
        );
    }

    public flush(target: WorkerName): KenshoMessage[] {
        const queue = this.queues.get(target);
        if (!queue || queue.length === 0) {
            return [];
        }

        log.info(`'${target}' est en ligne. Flush de ${queue.length} message(s).`);

        const now = Date.now();
        const validMessages = queue.filter(qm =>
            (now - qm.enqueuedAt) < OfflineQueue.MAX_MESSAGE_AGE_MS
        );

        if (validMessages.length < queue.length) {
            log.warn(`${queue.length - validMessages.length} message(s) expiré(s) ont été supprimé(s) pour '${target}'.`);
        }

        this.queues.delete(target);

        this.saveQueue(target).catch(err =>
            log.error(`Échec de la suppression du storage pour '${target}':`, err as Error)
        );

        return validMessages.map(qm => qm.message);
    }

    public hasQueuedMessages(target: WorkerName): boolean {
        const queue = this.queues.get(target);
        return queue !== undefined && queue.length > 0;
    }

    public getStats(): { target: WorkerName; queueSize: number }[] {
        return Array.from(this.queues.entries()).map(([target, queue]) => ({
            target,
            queueSize: queue.length
        }));
    }

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
            log.info(`Nettoyage : ${totalCleaned} message(s) expiré(s) supprimé(s).`);
        }
    }
}
