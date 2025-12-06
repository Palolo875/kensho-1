/**
 * FileStorageService - Service unifié pour les opérations de fichiers avec OPFS
 */

import { logger } from '../monitoring/LoggerService';
import { UnifiedCache } from '../cache/UnifiedCache';

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

export class FileStorageService {
  private root: FileSystemDirectoryHandle | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;
  private isPersistent = false;
  
  // Cache unifié pour les fichiers
  private fileCache: UnifiedCache<ArrayBuffer>;
  private textCache: UnifiedCache<string>;

  private readonly DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB chunks pour streaming

  constructor(cacheMaxSize: number = 50 * 1024 * 1024) {
    this.fileCache = new UnifiedCache<ArrayBuffer>({ maxSizeBytes: cacheMaxSize });
    this.textCache = new UnifiedCache<string>({ maxSizeBytes: cacheMaxSize / 10 }); // 10% pour le texte
    
    this.initPromise = this.init();
  }

  /**
   * Initialise l'accès à l'OPFS
   */
  private async init(): Promise<void> {
    try {
      if (typeof navigator === 'undefined') {
        logger.warn('FileStorageService', 'Navigator non disponible (environnement Node/SSR)');
        return;
      }

      if (navigator.storage && navigator.storage.getDirectory) {
        this.root = await navigator.storage.getDirectory();
        logger.info('FileStorageService', "Accès à l'Origin Private File System (OPFS) réussi.");
        this.isPersistent = await this.requestPersistence();
        this.isInitialized = true;
      } else {
        logger.warn('FileStorageService', "OPFS non supporté. Utilisation d'un fallback en mémoire.");
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('FileStorageService', "Erreur d'initialisation de l'OPFS:", err);
    }
  }

  /**
   * Attend que le service soit initialisé
   */
  public async ensureReady(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
    }
    return this.isInitialized && this.root !== null;
  }

  /**
   * Demande la persistance du stockage
   */
  public async requestPersistence(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persisted) {
      return false;
    }

    try {
      if (await navigator.storage.persisted()) {
        logger.info('FileStorageService', 'Stockage déjà persistant.');
        return true;
      }

      const result = await navigator.storage.persist();
      logger.info('FileStorageService', `Demande de persistance: ${result ? 'Acceptée ✅' : 'Refusée ❌'}`);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('FileStorageService', 'Erreur lors de la demande de persistance:', err);
      return false;
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
   * Écrit des données dans un fichier
   */
  public async writeFile(
    path: string,
    data: string | ArrayBuffer | Blob,
    options: WriteOptions = { create: true }
  ): Promise<boolean> {
    try {
      const fileHandle = await this.getFileHandle(path, { create: options.create ?? true });
      if (!fileHandle) {
        logger.error('FileStorageService', `Impossible de créer/ouvrir le fichier: ${path}`);
        return false;
      }

      const writable = await fileHandle.createWritable({ keepExistingData: options.append });

      if (options.append) {
        const file = await fileHandle.getFile();
        await writable.seek(file.size);
      }

      await writable.write(data);
      await writable.close();

      // Invalider le cache
      this.fileCache.delete(path);
      this.textCache.delete(path);

      logger.debug('FileStorageService', `Fichier écrit: ${path}`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('FileStorageService', `Erreur d'écriture du fichier ${path}:`, err);
      return false;
    }
  }

  /**
   * Lit le contenu d'un fichier en tant que texte (avec cache)
   */
  public async readFileAsText(path: string, useCache: boolean = true): Promise<string | null> {
    // Vérifier le cache
    if (useCache) {
      const cached = this.textCache.get(path);
      if (cached !== null) {
        logger.debug('FileStorageService', `Cache hit (text): ${path}`);
        return cached;
      }
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

      return text;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('FileStorageService', `Erreur de lecture du fichier ${path}:`, err);
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
    // Vérifier le cache
    if (useCache) {
      const cached = this.fileCache.get(path);
      if (cached !== null) {
        logger.debug('FileStorageService', `Cache hit (binary): ${path}`);
        return cached;
      }
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

      return buffer;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('FileStorageService', `Erreur de lecture du fichier ${path}:`, err);
      return null;
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
   * Supprime un fichier
   */
  public async deleteFile(path: string): Promise<boolean> {
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

      logger.debug('FileStorageService', `Fichier supprimé: ${path}`);
      return true;
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        return true; // Déjà supprimé
      }
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('FileStorageService', `Erreur de suppression du fichier ${path}:`, err);
      return false;
    }
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
    logger.info('FileStorageService', 'Cache vidé');
  }
}