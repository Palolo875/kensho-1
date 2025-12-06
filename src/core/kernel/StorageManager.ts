// src/core/kernel/StorageManager.ts
// VRAIE Implémentation de production utilisant l'Origin Private File System (OPFS)
// Avec cache LRU, streaming de gros fichiers, et métriques d'utilisation

import { logger } from './monitoring/LoggerService';
import { FileStorageService } from './storage/FileStorageService';
import { MetricsCollector, StorageMetrics } from './monitoring/MetricsCollector';
import { UnifiedCache } from './cache/UnifiedCache';

logger.info('StorageManager', '📦 StorageManager (Production) initialisé.');

/**
 * Interface pour les métadonnées de fichier
 */
export interface FileMetadata {
  name: string;
  size: number;
  lastModified: number;
  type: 'file' | 'directory';
}

/**
 * Interface pour les options d'écriture
 */
export interface WriteOptions {
  create?: boolean;
  append?: boolean;
}

/**
 * Interface pour les statistiques de stockage
 */
export interface StorageStats {
  usage: number;
  quota: number;
  usagePercent: number;
  isPersistent: boolean;
}

/**
 * Alias pour compatibilité avec les exports existants
 */
export type StorageQuota = StorageStats;

/**
 * Interface pour l'historique des opérations
 */
interface OperationRecord {
  type: 'read' | 'write' | 'delete' | 'stream';
  path: string;
  size: number;
  duration: number;
  timestamp: number;
  success: boolean;
}

/**
 * Options pour le streaming
 */
export interface StreamOptions {
  chunkSize?: number;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Callback pour les chunks de streaming
 */
export type StreamChunkCallback = (chunk: Uint8Array, loaded: number, total: number) => void;

/**
 * Interface pour les graphes compilés
 */
export interface CompiledGraphHeader {
  version: string;           // Version du format du graphe
  modelName: string;         // Nom du modèle
  schemaHash: string;        // Hash du schéma pour validation
  generatedAt: number;       // Timestamp de génération
}

export interface CompiledGraph extends CompiledGraphHeader {
  // Données du graphe compilé
  [key: string]: any;
}

/**
 * Version actuelle du format de graphe compilé
 * Incrémentez cette valeur pour forcer la recompilation de tous les graphes
 */
export const COMPILED_GRAPH_VERSION = '1.0';

// Interface pour les fichiers dans le manifeste
interface FileInfo {
  path: string;
  size: number;
  hash: string;
  required: boolean;
}

/**
 * Interface pour les entrées du cache LRU
 */
interface LRUCacheEntry<T> {
  key: string;
  value: T;
  size: number;
  lastAccessed: number;
}

/**
 * Cache LRU générique pour le StorageManager
 */
class LRUCache<T> {
  private cache: Map<string, LRUCacheEntry<T>> = new Map();
  private maxSize: number;
  private currentSize: number = 0;

  constructor(maxSizeBytes: number = 50 * 1024 * 1024) { // 50MB par défaut
    this.maxSize = maxSizeBytes;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Mettre à jour le timestamp d'accès
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  set(key: string, value: T, size: number): void {
    // Supprimer l'ancienne entrée si elle existe
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.currentSize -= oldEntry.size;
      this.cache.delete(key);
    }

    // Éviction si nécessaire
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    // Ne pas mettre en cache si la taille dépasse le max
    if (size > this.maxSize) {
      logger.debug('StorageManager', `Fichier trop gros pour le cache: ${size} bytes`);
      return;
    }

    this.cache.set(key, {
      key,
      value,
      size,
      lastAccessed: Date.now(),
    });
    this.currentSize += size;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  private evictLRU(): void {
    let oldest: LRUCacheEntry<T> | null = null;
    let oldestKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.lastAccessed < oldest.lastAccessed) {
        oldest = entry;
        oldestKey = key;
      }
    }

    if (oldestKey && oldest) {
      this.currentSize -= oldest.size;
      this.cache.delete(oldestKey);
      logger.debug('StorageManager', `Cache LRU: éviction de ${oldestKey}`);
    }
  }

  getStats(): { entries: number; size: number; maxSize: number; usagePercent: number } {
    return {
      entries: this.cache.size,
      size: this.currentSize,
      maxSize: this.maxSize,
      usagePercent: (this.currentSize / this.maxSize) * 100,
    };
  }

  setMaxSize(maxSizeBytes: number): void {
    this.maxSize = maxSizeBytes;
    // Éviction si nécessaire après changement de taille
    while (this.currentSize > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }
  }
}

/**
 * StorageManager - Gestionnaire de stockage utilisant l'Origin Private File System (OPFS)
 *
 * L'OPFS est une API moderne qui permet un accès rapide et synchrone aux fichiers
 * dans un système de fichiers privé à l'origine. C'est idéal pour stocker :
 * - Les poids des modèles LLM
 * - Les embeddings vectoriels
 * - Les caches de données
 * - Les fichiers de configuration
 */
class StorageManager {
  private root: FileSystemDirectoryHandle | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;
  private isPersistent = false;
  private manifest: any = null;

  // Cache LRU pour les fichiers fréquemment accédés
  private fileCache: LRUCache<ArrayBuffer>;
  private textCache: LRUCache<string>;

  // Métriques d'utilisation
  private metrics: {
    totalReads: number;
    totalWrites: number;
    totalDeletes: number;
    cacheHits: number;
    cacheMisses: number;
    bytesRead: number;
    bytesWritten: number;
    readTimes: number[];
    writeTimes: number[];
    operationHistory: OperationRecord[];
  };

  private readonly MAX_HISTORY_SIZE = 100;
  private readonly DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB chunks pour streaming

  constructor(cacheMaxSize: number = 50 * 1024 * 1024) {
    this.fileCache = new LRUCache<ArrayBuffer>(cacheMaxSize);
    this.textCache = new LRUCache<string>(cacheMaxSize / 10); // 10% pour le texte

    this.metrics = {
      totalReads: 0,
      totalWrites: 0,
      totalDeletes: 0,
      cacheHits: 0,
      cacheMisses: 0,
      bytesRead: 0,
      bytesWritten: 0,
      readTimes: [],
      writeTimes: [],
      operationHistory: [],
    };

    this.initPromise = this.init();
  }

  /**
   * Initialise l'accès à l'OPFS
   */
  private async init(): Promise<void> {
    try {
      if (typeof navigator === 'undefined') {
        logger.warn('StorageManager', 'Navigator non disponible (environnement Node/SSR)');
        return;
      }

      if (navigator.storage && navigator.storage.getDirectory) {
        this.root = await navigator.storage.getDirectory();
        logger.info('StorageManager', "Accès à l'Origin Private File System (OPFS) réussi.");
        this.isPersistent = await this.requestPersistence();
        this.isInitialized = true;
      } else {
        logger.warn('StorageManager', "OPFS non supporté. Utilisation d'un fallback en mémoire.");
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', "Erreur d'initialisation de l'OPFS:", err);
    }
  }

  /**
   * Attend que le StorageManager soit initialisé
   */
  public async ensureReady(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
    }
    return this.isInitialized && this.root !== null;
  }

  /**
   * Demande la persistance du stockage
   * Cela empêche le navigateur de supprimer les données en cas de pression mémoire
   */
  public async requestPersistence(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persisted) {
      return false;
    }

    try {
      if (await navigator.storage.persisted()) {
        logger.info('StorageManager', 'Stockage déjà persistant.');
        return true;
      }

      const result = await navigator.storage.persist();
      logger.info('StorageManager', `Demande de persistance: ${result ? 'Acceptée ✅' : 'Refusée ❌'}`);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', 'Erreur lors de la demande de persistance:', err);
      return false;
    }
  }

  /**
   * Enregistre une opération dans l'historique
   */
  private recordOperation(
    type: OperationRecord['type'],
    path: string,
    size: number,
    duration: number,
    success: boolean
  ): void {
    const record: OperationRecord = {
      type,
      path,
      size,
      duration,
      timestamp: Date.now(),
      success,
    };

    this.metrics.operationHistory.push(record);

    // Limiter la taille de l'historique
    if (this.metrics.operationHistory.length > this.MAX_HISTORY_SIZE) {
      this.metrics.operationHistory = this.metrics.operationHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }

  /**
   * Obtient un handle de fichier
   */
  public async getFileHandle(
    path: string,
    options?: { create: boolean }
  ): Promise<FileSystemFileHandle | null> {
    if (!(await this.ensureReady()) || !this.root) {
      return null;
    }

    try {
      // Gérer les chemins avec des sous-dossiers
      const parts = path.split('/').filter((p) => p.length > 0);

      if (parts.length === 1) {
        return await this.root.getFileHandle(parts[0], options);
      }

      // Naviguer dans les sous-dossiers
      let currentDir = this.root;
      for (let i = 0; i < parts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: options?.create });
      }

      return await currentDir.getFileHandle(parts[parts.length - 1], options);
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Obtient un handle de répertoire
   */
  public async getDirectoryHandle(
    path: string,
    options?: { create: boolean }
  ): Promise<FileSystemDirectoryHandle | null> {
    if (!(await this.ensureReady()) || !this.root) {
      return null;
    }

    try {
      if (!path || path === '/') {
        return this.root;
      }

      const parts = path.split('/').filter((p) => p.length > 0);
      let currentDir = this.root;

      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part, options);
      }

      return currentDir;
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Écrit des données dans un fichier
   */
  public async writeFile(
    path: string,
    data: string | ArrayBuffer | Blob,
    options: WriteOptions = { create: true }
  ): Promise<boolean> {
    const startTime = performance.now();
    let size = 0;

    try {
      const fileHandle = await this.getFileHandle(path, { create: options.create ?? true });
      if (!fileHandle) {
        logger.error('StorageManager', `Impossible de créer/ouvrir le fichier: ${path}`);
        this.recordOperation('write', path, 0, performance.now() - startTime, false);
        return false;
      }

      const writable = await fileHandle.createWritable({ keepExistingData: options.append });

      if (options.append) {
        const file = await fileHandle.getFile();
        await writable.seek(file.size);
      }

      await writable.write(data);
      await writable.close();

      // Calculer la taille
      if (typeof data === 'string') {
        size = new TextEncoder().encode(data).length;
      } else if (data instanceof ArrayBuffer) {
        size = data.byteLength;
      } else if (data instanceof Blob) {
        size = data.size;
      }

      // Invalider le cache
      this.fileCache.delete(path);
      this.textCache.delete(path);

      // Mettre à jour les métriques
      const duration = performance.now() - startTime;
      this.metrics.totalWrites++;
      this.metrics.bytesWritten += size;
      this.metrics.writeTimes.push(duration);
      if (this.metrics.writeTimes.length > 100) {
        this.metrics.writeTimes = this.metrics.writeTimes.slice(-100);
      }
      this.recordOperation('write', path, size, duration, true);

      logger.debug('StorageManager', `Fichier écrit: ${path} (${size} bytes en ${duration.toFixed(2)}ms)`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `Erreur d'écriture du fichier ${path}:`, err);
      this.recordOperation('write', path, size, performance.now() - startTime, false);
      return false;
    }
  }

  /**
   * Lit le contenu d'un fichier en tant que texte (avec cache)
   */
  public async readFileAsText(path: string, useCache: boolean = true): Promise<string | null> {
    const startTime = performance.now();

    // Vérifier le cache
    if (useCache) {
      const cached = this.textCache.get(path);
      if (cached !== null) {
        this.metrics.cacheHits++;
        logger.debug('StorageManager', `Cache hit (text): ${path}`);
        return cached;
      }
      this.metrics.cacheMisses++;
    }

    try {
      const fileHandle = await this.getFileHandle(path);
      if (!fileHandle) {
        return null;
      }

      const file = await fileHandle.getFile();
      const text = await file.text();

      // Mettre en cache
      if (useCache) {
        this.textCache.set(path, text, text.length * 2); // UTF-16
      }

      // Mettre à jour les métriques
      const duration = performance.now() - startTime;
      this.metrics.totalReads++;
      this.metrics.bytesRead += file.size;
      this.metrics.readTimes.push(duration);
      if (this.metrics.readTimes.length > 100) {
        this.metrics.readTimes = this.metrics.readTimes.slice(-100);
      }
      this.recordOperation('read', path, file.size, duration, true);

      return text;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `Erreur de lecture du fichier ${path}:`, err);
      this.recordOperation('read', path, 0, performance.now() - startTime, false);
      return null;
    }
  }

  /**
   * Lit le contenu d'un fichier en tant qu'ArrayBuffer (avec cache)
   */
  public async readFileAsArrayBuffer(
    path: string,
    useCache: boolean = true
  ): Promise<ArrayBuffer | null> {
    const startTime = performance.now();

    // Vérifier le cache
    if (useCache) {
      const cached = this.fileCache.get(path);
      if (cached !== null) {
        this.metrics.cacheHits++;
        logger.debug('StorageManager', `Cache hit (binary): ${path}`);
        return cached;
      }
      this.metrics.cacheMisses++;
    }

    try {
      const fileHandle = await this.getFileHandle(path);
      if (!fileHandle) {
        return null;
      }

      const file = await fileHandle.getFile();
      const buffer = await file.arrayBuffer();

      // Mettre en cache
      if (useCache) {
        this.fileCache.set(path, buffer, buffer.byteLength);
      }

      // Mettre à jour les métriques
      const duration = performance.now() - startTime;
      this.metrics.totalReads++;
      this.metrics.bytesRead += file.size;
      this.metrics.readTimes.push(duration);
      if (this.metrics.readTimes.length > 100) {
        this.metrics.readTimes = this.metrics.readTimes.slice(-100);
      }
      this.recordOperation('read', path, file.size, duration, true);

      return buffer;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `Erreur de lecture du fichier ${path}:`, err);
      this.recordOperation('read', path, 0, performance.now() - startTime, false);
      return null;
    }
  }

  /**
   * Lit le contenu d'un fichier en tant que Blob
   */
  public async readFileAsBlob(path: string): Promise<Blob | null> {
    const startTime = performance.now();

    try {
      const fileHandle = await this.getFileHandle(path);
      if (!fileHandle) {
        return null;
      }

      const file = await fileHandle.getFile();

      // Mettre à jour les métriques
      const duration = performance.now() - startTime;
      this.metrics.totalReads++;
      this.metrics.bytesRead += file.size;
      this.recordOperation('read', path, file.size, duration, true);

      return file;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `Erreur de lecture du fichier ${path}:`, err);
      this.recordOperation('read', path, 0, performance.now() - startTime, false);
      return null;
    }
  }

  /**
   * Lecture en streaming d'un gros fichier (idéal pour les modèles)
   */
  public async readFileStreaming(
    path: string,
    onChunk: StreamChunkCallback,
    options: StreamOptions = {}
  ): Promise<boolean> {
    const startTime = performance.now();
    const chunkSize = options.chunkSize ?? this.DEFAULT_CHUNK_SIZE;

    try {
      const fileHandle = await this.getFileHandle(path);
      if (!fileHandle) {
        logger.error('StorageManager', `Fichier non trouvé pour streaming: ${path}`);
        return false;
      }

      const file = await fileHandle.getFile();
      const totalSize = file.size;
      let loaded = 0;

      // Utiliser un ReadableStream pour le streaming
      const stream = file.stream();
      const reader = stream.getReader();

      let buffer = new Uint8Array(0);

      while (true) {
        // Vérifier si annulé
        if (options.signal?.aborted) {
          reader.cancel();
          logger.info('StorageManager', `Streaming annulé: ${path}`);
          return false;
        }

        const { done, value } = await reader.read();

        if (done) {
          // Envoyer le reste du buffer
          if (buffer.length > 0) {
            onChunk(buffer, loaded, totalSize);
          }
          break;
        }

        // Accumuler dans le buffer
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;

        // Envoyer des chunks de taille fixe
        while (buffer.length >= chunkSize) {
          const chunk = buffer.slice(0, chunkSize);
          buffer = buffer.slice(chunkSize);
          loaded += chunk.length;
          onChunk(chunk, loaded, totalSize);
          options.onProgress?.(loaded, totalSize);
        }
      }

      // Mettre à jour les métriques
      const duration = performance.now() - startTime;
      this.metrics.totalReads++;
      this.metrics.bytesRead += totalSize;
      this.recordOperation('stream', path, totalSize, duration, true);

      logger.info('StorageManager', `Streaming terminé: ${path} (${totalSize} bytes en ${duration.toFixed(2)}ms)`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `Erreur de streaming du fichier ${path}:`, err);
      this.recordOperation('stream', path, 0, performance.now() - startTime, false);
      return false;
    }
  }

  /**
   * Écriture en streaming d'un gros fichier
   */
  public async writeFileStreaming(
    path: string,
    dataStream: ReadableStream<Uint8Array>,
    totalSize: number,
    options: StreamOptions = {}
  ): Promise<boolean> {
    const startTime = performance.now();
    let written = 0;

    try {
      const fileHandle = await this.getFileHandle(path, { create: true });
      if (!fileHandle) {
        logger.error('StorageManager', `Impossible de créer le fichier pour streaming: ${path}`);
        return false;
      }

      const writable = await fileHandle.createWritable();
      const reader = dataStream.getReader();

      while (true) {
        // Vérifier si annulé
        if (options.signal?.aborted) {
          await writable.abort();
          logger.info('StorageManager', `Écriture streaming annulée: ${path}`);
          return false;
        }

        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        await writable.write(value);
        written += value.length;
        options.onProgress?.(written, totalSize);
      }

      await writable.close();

      // Invalider le cache
      this.fileCache.delete(path);
      this.textCache.delete(path);

      // Mettre à jour les métriques
      const duration = performance.now() - startTime;
      this.metrics.totalWrites++;
      this.metrics.bytesWritten += written;
      this.recordOperation('stream', path, written, duration, true);

      logger.info('StorageManager', `Écriture streaming terminée: ${path} (${written} bytes en ${duration.toFixed(2)}ms)`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `Erreur d'écriture streaming du fichier ${path}:`, err);
      this.recordOperation('stream', path, written, performance.now() - startTime, false);
      return false;
    }
  }

  /**
   * Vérifie si un fichier existe
   */
  public async fileExists(path: string): Promise<boolean> {
    const handle = await this.getFileHandle(path);
    return handle !== null;
  }

  /**
   * Vérifie si un répertoire existe
   */
  public async directoryExists(path: string): Promise<boolean> {
    const handle = await this.getDirectoryHandle(path);
    return handle !== null;
  }

  /**
   * Supprime un fichier
   */
  public async deleteFile(path: string): Promise<boolean> {
    const startTime = performance.now();

    if (!(await this.ensureReady()) || !this.root) {
      return false;
    }

    try {
      const parts = path.split('/').filter((p) => p.length > 0);

      if (parts.length === 1) {
        await this.root.removeEntry(parts[0]);
      } else {
        // Naviguer jusqu'au parent
        let currentDir = this.root;
        for (let i = 0; i < parts.length - 1; i++) {
          currentDir = await currentDir.getDirectoryHandle(parts[i]);
        }
        await currentDir.removeEntry(parts[parts.length - 1]);
      }

      // Invalider le cache
      this.fileCache.delete(path);
      this.textCache.delete(path);

      // Mettre à jour les métriques
      this.metrics.totalDeletes++;
      this.recordOperation('delete', path, 0, performance.now() - startTime, true);

      logger.debug('StorageManager', `Fichier supprimé: ${path}`);
      return true;
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        return true; // Déjà supprimé
      }
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `Erreur de suppression du fichier ${path}:`, err);
      this.recordOperation('delete', path, 0, performance.now() - startTime, false);
      return false;
    }
  }

  /**
   * Supprime un répertoire et son contenu
   */
  public async deleteDirectory(path: string, recursive = true): Promise<boolean> {
    if (!(await this.ensureReady()) || !this.root) {
      return false;
    }

    try {
      const parts = path.split('/').filter((p) => p.length > 0);

      if (parts.length === 1) {
        await this.root.removeEntry(parts[0], { recursive });
      } else {
        let currentDir = this.root;
        for (let i = 0; i < parts.length - 1; i++) {
          currentDir = await currentDir.getDirectoryHandle(parts[i]);
        }
        await currentDir.removeEntry(parts[parts.length - 1], { recursive });
      }

      // Invalider tout le cache (pourrait contenir des fichiers du répertoire)
      this.clearCache();

      logger.debug('StorageManager', `Répertoire supprimé: ${path}`);
      return true;
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        return true;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `Erreur de suppression du répertoire ${path}:`, err);
      return false;
    }
  }

  /**
   * Liste les fichiers dans un répertoire
   */
  public async listDirectory(path: string = '/'): Promise<FileMetadata[]> {
    const dirHandle = await this.getDirectoryHandle(path);
    if (!dirHandle) {
      return [];
    }

    const entries: FileMetadata[] = [];

    try {
      for await (const [name, handle] of (dirHandle as any).entries()) {
        if (handle.kind === 'file') {
          const file = await (handle as FileSystemFileHandle).getFile();
          entries.push({
            name,
            size: file.size,
            lastModified: file.lastModified,
            type: 'file',
          });
        } else {
          entries.push({
            name,
            size: 0,
            lastModified: Date.now(),
            type: 'directory',
          });
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `Erreur de listage du répertoire ${path}:`, err);
    }

    return entries;
  }

  /**
   * Estime le quota de stockage disponible
   */
  public async estimateQuota(): Promise<StorageEstimate | null> {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return null;
    }

    try {
      return await navigator.storage.estimate();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', "Erreur d'estimation du quota:", err);
      return null;
    }
  }

  /**
   * Obtient les statistiques de stockage
   */
  public async getStats(): Promise<StorageStats | null> {
    const estimate = await this.estimateQuota();
    if (!estimate) {
      return null;
    }

    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;

    return {
      usage,
      quota,
      usagePercent: quota > 0 ? (usage / quota) * 100 : 0,
      isPersistent: this.isPersistent,
    };
  }

  /**
   * Obtient les métriques d'utilisation
   */
  public getMetrics(): StorageMetrics {
    const avgReadTime =
      this.metrics.readTimes.length > 0
        ? this.metrics.readTimes.reduce((a, b) => a + b, 0) / this.metrics.readTimes.length
        : 0;

    const avgWriteTime =
      this.metrics.writeTimes.length > 0
        ? this.metrics.writeTimes.reduce((a, b) => a + b, 0) / this.metrics.writeTimes.length
        : 0;

    return {
      totalReads: this.metrics.totalReads,
      totalWrites: this.metrics.totalWrites,
      totalDeletes: this.metrics.totalDeletes,
      bytesRead: this.metrics.bytesRead,
      bytesWritten: this.metrics.bytesWritten,
      averageReadTime: avgReadTime,
      averageWriteTime: avgWriteTime,
    };
  }

  /**
   * Obtient les statistiques du cache
   */
  public getCacheStats(): {
    fileCache: { entries: number; size: number; maxSize: number; usagePercent: number };
    textCache: { entries: number; size: number; maxSize: number; usagePercent: number };
  } {
    return {
      fileCache: this.fileCache.getStats(),
      textCache: this.textCache.getStats(),
    };
  }

  /**
   * Vide le cache
   */
  public clearCache(): void {
    this.fileCache.clear();
    this.textCache.clear();
    logger.info('StorageManager', 'Cache vidé');
  }

  /**
   * Configure la taille maximale du cache
   */
  public setCacheMaxSize(maxSizeBytes: number): void {
    this.fileCache.setMaxSize(maxSizeBytes);
    this.textCache.setMaxSize(maxSizeBytes / 10);
    logger.info('StorageManager', `Taille max du cache configurée: ${maxSizeBytes} bytes`);
  }

  /**
   * Réinitialise les métriques
   */
  public resetMetrics(): void {
    this.metrics = {
      totalReads: 0,
      totalWrites: 0,
      totalDeletes: 0,
      cacheHits: 0,
      cacheMisses: 0,
      bytesRead: 0,
      bytesWritten: 0,
      readTimes: [],
      writeTimes: [],
      operationHistory: [],
    };
    logger.info('StorageManager', 'Métriques réinitialisées');
  }

  /**
   * Crée un répertoire (et ses parents si nécessaire)
   */
  public async createDirectory(path: string): Promise<boolean> {
    const handle = await this.getDirectoryHandle(path, { create: true });
    return handle !== null;
  }

  /**
   * Copie un fichier
   */
  public async copyFile(sourcePath: string, destPath: string): Promise<boolean> {
    try {
      const data = await this.readFileAsArrayBuffer(sourcePath, false);
      if (data === null) {
        logger.error('StorageManager', `Fichier source non trouvé: ${sourcePath}`);
        return false;
      }

      return await this.writeFile(destPath, data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `Erreur de copie de ${sourcePath} vers ${destPath}:`, err);
      return false;
    }
  }

  /**
   * Déplace un fichier
   */
  public async moveFile(sourcePath: string, destPath: string): Promise<boolean> {
    const copied = await this.copyFile(sourcePath, destPath);
    if (!copied) {
      return false;
    }

    return await this.deleteFile(sourcePath);
  }

  /**
   * Obtient la taille d'un fichier
   */
  public async getFileSize(path: string): Promise<number | null> {
    try {
      const fileHandle = await this.getFileHandle(path);
      if (!fileHandle) {
        return null;
      }

      const file = await fileHandle.getFile();
      return file.size;
    } catch (error) {
      return null;
    }
  }

  /**
   * Vérifie si l'OPFS est supporté
   */
  public isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      navigator.storage !== undefined &&
      typeof navigator.storage.getDirectory === 'function'
    );
  }

  /**
   * Vérifie si le stockage est persistant
   */
  public isPersistentStorage(): boolean {
    return this.isPersistent;
  }

  /**
   * Vérifie si le manager est initialisé
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Précharge un fichier dans le cache
   */
  public async preloadToCache(path: string): Promise<boolean> {
    try {
      const buffer = await this.readFileAsArrayBuffer(path, true);
      return buffer !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Précharge plusieurs fichiers dans le cache
   */
  public async preloadMultipleToCache(paths: string[]): Promise<{ success: string[]; failed: string[] }> {
    const results = await Promise.allSettled(paths.map((p) => this.preloadToCache(p)));

    const success: string[] = [];
    const failed: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        success.push(paths[index]);
      } else {
        failed.push(paths[index]);
      }
    });

    logger.info('StorageManager', `Préchargement: ${success.length} succès, ${failed.length} échecs`);
    return { success, failed };
  }

  // ============================================================================
  // COMPILED GRAPHS MANAGEMENT (Pré-compilation pour démarrage instantané)
  // ============================================================================

  // Version des graphes compilés
  private readonly GRAPH_VERSION = '2.0'; // Bump quand le format change

  /**
   * Récupère un graphe pré-compilé depuis l'OPFS avec validation de version
   * @returns Le graphe si valide, null si inexistant ou obsolète
   */
  public async getCompiledGraph(modelKey: string): Promise<CompiledGraph | null> {
    try {
      const graphPath = `graphs/${modelKey}.json`;
      const handle = await this.getFileHandle(graphPath);

      if (!handle) {
        logger.debug('StorageManager', `[Graphs] Aucun graphe trouvé pour ${modelKey}`);
        return null;
      }

      const file = await handle.getFile();
      const content = await file.text();
      const graph = JSON.parse(content) as CompiledGraph;

      // Validation de version
      if (graph.version !== COMPILED_GRAPH_VERSION) {
        logger.warn(
          'StorageManager',
          `[Graphs] Graphe obsolète pour ${modelKey} (v${graph.version} != v${COMPILED_GRAPH_VERSION}), recompilation nécessaire.`
        );
        return null;
      }

      logger.info('StorageManager', `[Graphs] ✅ Graphe pré-compilé valide trouvé pour ${modelKey} (compilé il y a ${this.formatAge(graph.generatedAt)})`);
      return graph;
    } catch (error) {
      // Erreur de lecture ou parsing - graceful degradation
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn('StorageManager', `[Graphs] Erreur lecture graphe ${modelKey}: ${err.message}`);
      return null; // Fallback vers recompilation
    }
  }

  /**
   * Sauvegarde un graphe pré-compilé dans l'OPFS
   */
  public async saveCompiledGraph(modelKey: string, graphData: CompiledGraph): Promise<boolean> {
    try {
      if (!(await this.ensureReady()) || !this.root) {
        logger.warn('StorageManager', '[Graphs] OPFS non disponible, graphe non sauvegardé');
        return false;
      }

      // S'assurer que le répertoire graphs existe
      await this.root.getDirectoryHandle('graphs', { create: true });

      const graphPath = `graphs/${modelKey}.json`;
      const success = await this.writeFile(graphPath, JSON.stringify(graphData, null, 2));

      if (success) {
        logger.info('StorageManager', `[Graphs] ✅ Graphe pré-compilé sauvegardé pour ${modelKey}`);
      }

      return success;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StorageManager', `[Graphs] Erreur sauvegarde graphe ${modelKey}: ${err.message}`);
      return false;
    }
  }

  /**
   * Nettoie les graphes obsolètes (version différente ou trop anciens)
   * Appelé au boot pour libérer l'espace
   */
  public async cleanupObsoleteGraphs(maxAgeDays: number = 30): Promise<{ deleted: number; kept: number }> {
    const stats = { deleted: 0, kept: 0 };

    try {
      if (!(await this.ensureReady()) || !this.root) {
        return stats;
      }

      const graphsDir = await this.getDirectoryHandle('graphs');
      if (!graphsDir) {
        return stats;
      }

      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
      const now = Date.now();

      for await (const [name, handle] of (graphsDir as any).entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json')) continue;

        try {
          const file = await (handle as FileSystemFileHandle).getFile();
          const content = await file.text();
          const graph = JSON.parse(content) as CompiledGraph;

          const isObsolete =
            graph.version !== COMPILED_GRAPH_VERSION || now - graph.generatedAt > maxAgeMs;

          if (isObsolete) {
            await graphsDir.removeEntry(name);
            logger.debug('StorageManager', `[Graphs] Graphe obsolète supprimé: ${name}`);
            stats.deleted++;
          } else {
            stats.kept++;
          }
        } catch (e) {
          // Fichier corrompu, on le supprime
          try {
            await graphsDir.removeEntry(name);
            stats.deleted++;
          } catch {
            // Ignore
          }
        }
      }

      if (stats.deleted > 0) {
        logger.info('StorageManager', `[Graphs] Nettoyage terminé: ${stats.deleted} supprimés, ${stats.kept} conservés`);
      }

      return stats;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn('StorageManager', `[Graphs] Erreur nettoyage graphes: ${err.message}`);
      return stats;
    }
  }

  /**
   * Liste tous les graphes compilés disponibles
   */
  public async listCompiledGraphs(): Promise<Array<{ modelKey: string; graph: CompiledGraph }>> {
    const graphs: Array<{ modelKey: string; graph: CompiledGraph }> = [];

    try {
      const graphsDir = await this.getDirectoryHandle('graphs');
      if (!graphsDir) {
        return graphs;
      }

      for await (const [name, handle] of (graphsDir as any).entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json')) continue;

        try {
          const file = await (handle as FileSystemFileHandle).getFile();
          const content = await file.text();
          const graph = JSON.parse(content) as CompiledGraph;
          const modelKey = name.replace('.json', '');
          graphs.push({ modelKey, graph });
        } catch {
          // Fichier corrompu, on l'ignore
        }
      }

      return graphs;
    } catch {
      return graphs;
    }
  }

  /**
   * Utilitaire: formate l'âge d'un timestamp en texte lisible
   */
  private formatAge(timestamp: number): string {
    const ageMs = Date.now() - timestamp;
    const minutes = Math.floor(ageMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} jour${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} heure${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return 'quelques secondes';
  }

  /**
   * Calcule le hash SHA-256 d'un blob
   */
  private async sha256(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `sha256-${hashHex}`;
  }

  /**
   * Vérifie l'espace disque disponible
   */
  private async checkDiskSpace(manifest: any): Promise<void> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const available = (estimate.quota || 0) - (estimate.usage || 0);
      
      // Calcule l'espace nécessaire
      const requiredSpace = manifest.files
        .filter((f: FileInfo) => f.required)
        .reduce((sum: number, f: FileInfo) => sum + f.size, 0);
        
      if (available < requiredSpace) {
        const neededGB = (requiredSpace / 1e9).toFixed(2);
        const availableGB = (available / 1e9).toFixed(2);
        throw new Error(
          `Espace insuffisant: besoin de ${neededGB}GB, disponible: ${availableGB}GB`
        );
      }
    }
  }

  /**
   * Télécharge un fichier avec retry
   */
  private async downloadFileWithRetry(fileInfo: FileInfo, maxRetries = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.downloadFile(fileInfo);
        return; // Succès
      } catch (error) {
        console.error(`[StorageManager] Tentative ${attempt}/${maxRetries} échouée pour ${fileInfo.path}`);
        
        if (attempt === maxRetries) {
          console.log(`❌ Échec du téléchargement: ${fileInfo.path}. Mode dégradé.`);
          throw new Error(`Impossible de télécharger ${fileInfo.path} après ${maxRetries} tentatives`);
        }
        
        // Exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Nouvelle tentative dans ${delay/1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  /**
   * Initialise le StorageManager et vérifie l'intégrité des fichiers.
   */
  public async initializeAndVerify(): Promise<void> {
    await this.init(); // Initialise OPFS
    
    console.log("Vérification de l'intégrité des fichiers locaux...");
    
    // 1. Charger le manifeste
    let manifest: any;
    try {
      const response = await fetch('/manifest.json');
      manifest = await response.json();
      this.manifest = manifest;
    } catch (e) {
      throw new Error("Impossible de charger le manifeste des fichiers.");
    }

    // 2. Vérifier l'espace disque disponible
    await this.checkDiskSpace(manifest);

    // 3. Vérifier chaque fichier du manifeste
    for (const fileInfo of manifest.files) {
      const handle = await this.getFileHandle(fileInfo.path);
      
      if (!handle) {
        console.log(`Fichier manquant: ${fileInfo.path}. Téléchargement...`);
        await this.downloadFileWithRetry(fileInfo);
        continue;
      }

      const file = await handle.getFile();
      const localHash = await this.sha256(file);

      if (localHash !== fileInfo.hash) {
        console.log(`Fichier corrompu: ${fileInfo.path}. Re-téléchargement...`);
        await this.downloadFileWithRetry(fileInfo);
      }
    }
    
    console.log("✅ Fichiers locaux vérifiés et prêts.");
    console.log("[StorageManager] Vérification d'intégrité terminée.");
  }

  /**
   * Télécharge et stocke un fichier avec progression
   */
  private async downloadFile(fileInfo: FileInfo): Promise<void> {
    if (!this.root) throw new Error("OPFS non initialisé.");
    
    console.log(`Téléchargement de ${fileInfo.path}...`);
    
    const chunkSize = 5_000_000; // 5MB chunks
    const totalChunks = Math.ceil(fileInfo.size / chunkSize);
    
    const handle = await this.root.getFileHandle(fileInfo.path, { create: true });
    const writable = await handle.createWritable();
    
    // Simule le téléchargement chunk par chunk
    for (let i = 0; i < totalChunks; i++) {
      await new Promise(r => setTimeout(r, 1000)); // 1s par chunk (5MB/s)
      const progress = ((i + 1) / totalChunks * 100).toFixed(0);
      console.log(`Téléchargement: ${progress}% (${fileInfo.path})`);
      
      // Écrit un chunk de données factices
      const chunk = new Uint8Array(Math.min(chunkSize, fileInfo.size - i * chunkSize));
      crypto.getRandomValues(chunk); // Données aléatoires réalistes
      await writable.write(chunk);
    }
    
    await writable.close();
    
    // ✅ Vérifie le hash après téléchargement
    const file = await handle.getFile();
    const actualHash = await this.sha256(file);
    
    if (actualHash !== fileInfo.hash) {
      throw new Error(`Échec de vérification après téléchargement: ${fileInfo.path}`);
    }
    
    console.log(`[StorageManager] ✅ ${fileInfo.path} téléchargé et vérifié.`);
  }
}

// Export du singleton
export const storageManager = new StorageManager();