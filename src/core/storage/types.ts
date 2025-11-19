// src/core/storage/types.ts

/**
 * Interface générique pour n'importe quel système de stockage (IndexedDB, LocalStorage, etc.)
 */
export interface StorageAdapter {
    /**
     * Récupère une valeur stockée
     */
    get<T>(store: string, key: string): Promise<T | undefined>;

    /**
     * Sauvegarde une valeur
     */
    set<T>(store: string, key: string, value: T): Promise<void>;

    /**
     * Supprime une valeur
     */
    delete(store: string, key: string): Promise<void>;

    /**
     * Récupère toutes les entrées d'un store
     */
    getAll<T>(store: string): Promise<T[]>;

    /**
     * Vide un store complet
     */
    clear(store: string): Promise<void>;
}

/**
 * Noms des stores utilisés par Kensho
 */
export const STORES = {
    AGENT_STATE: 'agent_state',
    OFFLINE_QUEUE: 'offline_queue',
    WORKER_REGISTRY: 'worker_registry',
    TELEMETRY: 'telemetry'
} as const;
