// src/core/storage/IndexedDBAdapter.ts

import { StorageAdapter, STORES } from './types';

const DB_NAME = 'KenshoDB';
const DB_VERSION = 1;

/**
 * Implémentation IndexedDB du StorageAdapter
 */
export class IndexedDBAdapter implements StorageAdapter {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.initPromise = this.init();
    }

    private async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Créer les object stores si ils n'existent pas
                Object.values(STORES).forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName);
                    }
                });
            };
        });
    }

    private async ensureReady(): Promise<IDBDatabase> {
        await this.initPromise;
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }
        return this.db;
    }

    async get<T>(store: string, key: string): Promise<T | undefined> {
        const db = await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(store, 'readonly');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async set<T>(store: string, key: string, value: T): Promise<void> {
        const db = await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(store, 'readwrite');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.put(value, key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async delete(store: string, key: string): Promise<void> {
        const db = await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(store, 'readwrite');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getAll<T>(store: string): Promise<T[]> {
        const db = await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(store, 'readonly');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clear(store: string): Promise<void> {
        const db = await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(store, 'readwrite');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}
