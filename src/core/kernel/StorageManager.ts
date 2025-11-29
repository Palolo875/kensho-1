// src/core/kernel/StorageManager.ts
// VRAIE Implémentation de production utilisant l'Origin Private File System (OPFS)

import { createLogger } from '../../lib/logger';

const log = createLogger('StorageManager');

log.info('📦 StorageManager (Production) initialisé.');

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

  constructor() {
    this.initPromise = this.init();
  }

  /**
   * Initialise l'accès à l'OPFS
   */
  private async init(): Promise<void> {
    try {
      if (typeof navigator === 'undefined') {
        log.warn('Navigator non disponible (environnement Node/SSR)');
        return;
      }

      if (navigator.storage && navigator.storage.getDirectory) {
        this.root = await navigator.storage.getDirectory();
        log.info('Accès à l\'Origin Private File System (OPFS) réussi.');
        this.isPersistent = await this.requestPersistence();
        this.isInitialized = true;
      } else {
        log.warn('OPFS non supporté. Utilisation d\'un fallback en mémoire.');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Erreur d\'initialisation de l\'OPFS:', err);
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
        log.info('Stockage déjà persistant.');
        return true;
      }

      const result = await navigator.storage.persist();
      log.info(`Demande de persistance: ${result ? 'Acceptée ✅' : 'Refusée ❌'}`);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Erreur lors de la demande de persistance:', err);
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
    if (!await this.ensureReady() || !this.root) {
      return null;
    }

    try {
      // Gérer les chemins avec des sous-dossiers
      const parts = path.split('/').filter(p => p.length > 0);

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
    if (!await this.ensureReady() || !this.root) {
      return null;
    }

    try {
      if (!path || path === '/') {
        return this.root;
      }

      const parts = path.split('/').filter(p => p.length > 0);
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
    try {
      const fileHandle = await this.getFileHandle(path, { create: options.create ?? true });
      if (!fileHandle) {
        log.error(`Impossible de créer/ouvrir le fichier: ${path}`);
        return false;
      }

      const writable = await fileHandle.createWritable({ keepExistingData: options.append });

      if (options.append) {
        const file = await fileHandle.getFile();
        await writable.seek(file.size);
      }

      await writable.write(data);
      await writable.close();

      log.debug(`Fichier écrit: ${path}`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Erreur d'écriture du fichier ${path}:`, err);
      return false;
    }
  }

  /**
   * Lit le contenu d'un fichier en tant que texte
   */
  public async readFileAsText(path: string): Promise<string | null> {
    try {
      const fileHandle = await this.getFileHandle(path);
      if (!fileHandle) {
        return null;
      }

      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Erreur de lecture du fichier ${path}:`, err);
      return null;
    }
  }

  /**
   * Lit le contenu d'un fichier en tant qu'ArrayBuffer
   */
  public async readFileAsArrayBuffer(path: string): Promise<ArrayBuffer | null> {
    try {
      const fileHandle = await this.getFileHandle(path);
      if (!fileHandle) {
        return null;
      }

      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Erreur de lecture du fichier ${path}:`, err);
      return null;
    }
  }

  /**
   * Lit le contenu d'un fichier en tant que Blob
   */
  public async readFileAsBlob(path: string): Promise<Blob | null> {
    try {
      const fileHandle = await this.getFileHandle(path);
      if (!fileHandle) {
        return null;
      }

      return await fileHandle.getFile();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Erreur de lecture du fichier ${path}:`, err);
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
    if (!await this.ensureReady() || !this.root) {
      return false;
    }

    try {
      const parts = path.split('/').filter(p => p.length > 0);

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

      log.debug(`Fichier supprimé: ${path}`);
      return true;
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        return true; // Déjà supprimé
      }
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Erreur de suppression du fichier ${path}:`, err);
      return false;
    }
  }

  /**
   * Supprime un répertoire et son contenu
   */
  public async deleteDirectory(path: string, recursive = true): Promise<boolean> {
    if (!await this.ensureReady() || !this.root) {
      return false;
    }

    try {
      const parts = path.split('/').filter(p => p.length > 0);

      if (parts.length === 1) {
        await this.root.removeEntry(parts[0], { recursive });
      } else {
        let currentDir = this.root;
        for (let i = 0; i < parts.length - 1; i++) {
          currentDir = await currentDir.getDirectoryHandle(parts[i]);
        }
        await currentDir.removeEntry(parts[parts.length - 1], { recursive });
      }

      log.debug(`Répertoire supprimé: ${path}`);
      return true;
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        return true;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Erreur de suppression du répertoire ${path}:`, err);
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
            type: 'file'
          });
        } else {
          entries.push({
            name,
            size: 0,
            lastModified: Date.now(),
            type: 'directory'
          });
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Erreur de listage du répertoire ${path}:`, err);
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
      log.error('Erreur d\'estimation du quota:', err);
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
      isPersistent: this.isPersistent
    };
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
      const data = await this.readFileAsArrayBuffer(sourcePath);
      if (data === null) {
        log.error(`Fichier source non trouvé: ${sourcePath}`);
        return false;
      }

      return await this.writeFile(destPath, data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Erreur de copie de ${sourcePath} vers ${destPath}:`, err);
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
    return typeof navigator !== 'undefined' &&
           navigator.storage !== undefined &&
           typeof navigator.storage.getDirectory === 'function';
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
}

// Export du singleton
export const storageManager = new StorageManager();
