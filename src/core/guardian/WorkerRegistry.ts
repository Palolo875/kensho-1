// src/core/guardian/WorkerRegistry.ts
import { WorkerName } from '../communication/types';

interface RegisteredWorker {
    name: WorkerName;
    lastSeen: number;
}

/**
 * Le WorkerRegistry maintient une liste à jour de tous les agents actifs
 * dans la constellation. Il est essentiel pour l'élection de leader et
 * pour savoir à qui envoyer des messages.
 */
export class WorkerRegistry {
    private readonly selfName: WorkerName;
    private activeWorkers = new Map<WorkerName, RegisteredWorker>();
    private readonly cleanupInterval: number;
    private cleanupTimer: any;

    private static readonly INACTIVITY_THRESHOLD = 10000; // 10 secondes

    constructor(selfName: WorkerName) {
        this.selfName = selfName;
        this.cleanupInterval = WorkerRegistry.INACTIVITY_THRESHOLD / 2;

        this.update(selfName);

        this.cleanupTimer = setInterval(() => this.removeInactiveWorkers(), this.cleanupInterval);
    }

    /**
     * Met à jour le timestamp "lastSeen" d'un worker, l'ajoutant s'il n'existe pas.
     * C'est la méthode principale pour signaler qu'un worker est en vie.
     */
    public update(workerName: WorkerName): void {
        this.activeWorkers.set(workerName, {
            name: workerName,
            lastSeen: Date.now(),
        });
    }

    /**
     * Supprime les workers qui n'ont pas été vus depuis trop longtemps.
     * Ne se supprime jamais soi-même.
     */
    private removeInactiveWorkers(): void {
        const now = Date.now();
        for (const [name, worker] of this.activeWorkers.entries()) {
            if (name !== this.selfName && (now - worker.lastSeen) > WorkerRegistry.INACTIVITY_THRESHOLD) {
                this.activeWorkers.delete(name);
                console.log(`[WorkerRegistry] Worker '${name}' considéré comme inactif et supprimé du registre.`);
            }
        }
    }

    /**
     * Retourne la liste des noms de tous les workers actuellement considérés comme actifs.
     */
    public getActiveWorkers(): WorkerName[] {
        return Array.from(this.activeWorkers.keys());
    }

    /**
     * Nettoie le timer du garbage collector.
     */
    public dispose(): void {
        clearInterval(this.cleanupTimer);
    }
}
