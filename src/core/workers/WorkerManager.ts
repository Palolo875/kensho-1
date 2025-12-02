import { createLogger } from '@/lib/logger';
import type { KenshoWindow } from '@/types/kensho';

const log = createLogger('WorkerManager');

export class WorkerManager {
    private static instance: WorkerManager;
    private workers: Map<string, Worker> = new Map();

    private constructor() {}

    public static getInstance(): WorkerManager {
        if (!WorkerManager.instance) {
            WorkerManager.instance = new WorkerManager();
        }
        return WorkerManager.instance;
    }

    public registerWorker(name: string, worker: Worker): void {
        this.workers.set(name, worker);
        
        // Also register in global window object for backward compatibility
        const kenshoWorkers = (window as KenshoWindow).__kensho_workers || {};
        kenshoWorkers[name] = worker;
        (window as KenshoWindow).__kensho_workers = kenshoWorkers;
        
        log.info(`Worker ${name} registered`);
    }

    public getWorker(name: string): Worker | undefined {
        return this.workers.get(name);
    }

    public getAllWorkers(): Map<string, Worker> {
        return new Map(this.workers);
    }

    public unregisterWorker(name: string): void {
        const worker = this.workers.get(name);
        if (worker) {
            worker.terminate();
            this.workers.delete(name);
            
            // Also remove from global window object
            const kenshoWorkers = (window as KenshoWindow).__kensho_workers || {};
            delete kenshoWorkers[name];
            (window as KenshoWindow).__kensho_workers = kenshoWorkers;
            
            log.info(`Worker ${name} unregistered and terminated`);
        }
    }

    public terminateAllWorkers(): void {
        for (const [name, worker] of this.workers.entries()) {
            worker.terminate();
            log.info(`Worker ${name} terminated`);
        }
        this.workers.clear();
        
        // Clear global window object
        (window as KenshoWindow).__kensho_workers = {};
    }
}