import { createLogger } from '../../lib/logger';

const log = createLogger('CacheManager');

export interface CacheSnapshot {
  version: string;
  timestamp: number;
  entries: Array<{
    key: string;
    value: string;
    modelUsed: string;
    tokensUsed: number;
    promptHash?: string;
    createdAt: number;
  }>;
}

const CACHE_FILE = 'kensho-response-cache.json';
const PROTOCOL_VERSION = '1.0';

export class CacheManager {
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private isAvailable = false;

  async initialize(opfsRoot: FileSystemDirectoryHandle | null): Promise<void> {
    this.opfsRoot = opfsRoot;
    this.isAvailable = !!opfsRoot;

    if (this.isAvailable) {
      const snapshot = await this.loadSnapshot();
      if (snapshot) {
        log.info(`Cache restauré: ${snapshot.entries.length} entrées`);
      }
    }
  }

  async saveSnapshot(entries: CacheSnapshot['entries']): Promise<boolean> {
    if (!this.isAvailable || !this.opfsRoot) return false;

    try {
      const snapshot: CacheSnapshot = {
        version: PROTOCOL_VERSION,
        timestamp: Date.now(),
        entries,
      };

      const fileHandle = await this.opfsRoot.getFileHandle(CACHE_FILE, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(snapshot, null, 2));
      await writable.close();

      log.debug(`Cache snapshot sauvegardé: ${entries.length} entrées`);
      return true;
    } catch (error) {
      log.error('Erreur sauvegarde cache:', error as Error);
      return false;
    }
  }

  async loadSnapshot(): Promise<CacheSnapshot | null> {
    if (!this.isAvailable || !this.opfsRoot) return null;

    try {
      const fileHandle = await this.opfsRoot.getFileHandle(CACHE_FILE);
      const file = await fileHandle.getFile();
      const content = await file.text();
      const snapshot = JSON.parse(content) as CacheSnapshot;

      if (snapshot.version !== PROTOCOL_VERSION) {
        log.warn('Version cache incompatible');
        return null;
      }

      const age = Date.now() - snapshot.timestamp;
      if (age > 12 * 60 * 60 * 1000) {
        log.warn('Cache trop ancien, ignoré');
        return null;
      }

      return snapshot;
    } catch (error) {
      if ((error as Error).name !== 'NotFoundError') {
        log.debug('Pas de cache existant');
      }
      return null;
    }
  }

  async clearSnapshot(): Promise<void> {
    if (!this.isAvailable || !this.opfsRoot) return;

    try {
      await this.opfsRoot.removeEntry(CACHE_FILE);
      log.info('Cache snapshot effacé');
    } catch (error) {
      if ((error as Error).name !== 'NotFoundError') {
        log.error('Erreur suppression cache:', error as Error);
      }
    }
  }
}

export const cacheManager = new CacheManager();
