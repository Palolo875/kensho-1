// src/core/storage/NoOpStorageAdapter.ts
import { StorageAdapter } from './types';

/**
 * Adaptateur de stockage qui ne fait rien (no-op)
 * Utilisé pour les workers qui n'ont pas besoin de stockage persistant
 * Évite les problèmes avec IndexedDB en Worker
 */
export class NoOpStorageAdapter implements StorageAdapter {
    async get<T>(_store: string, _key: string): Promise<T | undefined> {
        return undefined;
    }

    async set<T>(_store: string, _key: string, _value: T): Promise<void> {
        // No-op
    }

    async delete(_store: string, _key: string): Promise<void> {
        // No-op
    }

    async list<T>(_store: string): Promise<T[]> {
        return [];
    }

    async clear(_store: string): Promise<void> {
        // No-op
    }
}
