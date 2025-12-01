interface WorkerSnapshot {
  version: string;
  timestamp: number;
  cacheEntries: Array<{
    key: string;
    value: string;
    modelUsed: string;
    tokensUsed: number;
    createdAt: number;
  }>;
  memoryState: {
    loadedModels: string[];
    lastAccessTimes: Record<string, number>;
    inferenceCounts: Record<string, number>;
  };
  stats: {
    totalRequests: number;
    totalTokensGenerated: number;
    uptime: number;
  };
}

const SNAPSHOT_FILE = 'kensho-kernel-snapshot.json';
const PROTOCOL_VERSION = '1.0';

export class OPFSPersistence {
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private isAvailable = false;

  async initialize(): Promise<boolean> {
    try {
      if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
        console.warn('[OPFS] Origin Private File System non disponible');
        return false;
      }

      this.opfsRoot = await navigator.storage.getDirectory();
      this.isAvailable = true;
      console.log('[OPFS] Système de fichiers privé initialisé');
      return true;
    } catch (error) {
      console.error('[OPFS] Erreur d\'initialisation:', error);
      this.isAvailable = false;
      return false;
    }
  }

  async saveSnapshot(snapshot: Partial<WorkerSnapshot>): Promise<boolean> {
    if (!this.isAvailable || !this.opfsRoot) {
      console.warn('[OPFS] Sauvegarde ignorée - OPFS non disponible');
      return false;
    }

    try {
      const fullSnapshot: WorkerSnapshot = {
        version: PROTOCOL_VERSION,
        timestamp: Date.now(),
        cacheEntries: snapshot.cacheEntries || [],
        memoryState: snapshot.memoryState || {
          loadedModels: [],
          lastAccessTimes: {},
          inferenceCounts: {},
        },
        stats: snapshot.stats || {
          totalRequests: 0,
          totalTokensGenerated: 0,
          uptime: 0,
        },
      };

      const fileHandle = await this.opfsRoot.getFileHandle(SNAPSHOT_FILE, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(fullSnapshot, null, 2));
      await writable.close();

      console.log('[OPFS] Snapshot sauvegardé');
      return true;
    } catch (error) {
      console.error('[OPFS] Erreur de sauvegarde:', error);
      return false;
    }
  }

  async loadSnapshot(): Promise<WorkerSnapshot | null> {
    if (!this.isAvailable || !this.opfsRoot) {
      return null;
    }

    try {
      const fileHandle = await this.opfsRoot.getFileHandle(SNAPSHOT_FILE);
      const file = await fileHandle.getFile();
      const content = await file.text();
      const snapshot = JSON.parse(content) as WorkerSnapshot;

      if (snapshot.version !== PROTOCOL_VERSION) {
        console.warn('[OPFS] Version de snapshot incompatible, ignoré');
        return null;
      }

      const age = Date.now() - snapshot.timestamp;
      const maxAge = 24 * 60 * 60 * 1000;
      if (age > maxAge) {
        console.warn('[OPFS] Snapshot trop ancien (>24h), ignoré');
        return null;
      }

      console.log('[OPFS] Snapshot chargé avec succès');
      return snapshot;
    } catch (error) {
      if ((error as Error).name !== 'NotFoundError') {
        console.error('[OPFS] Erreur de chargement:', error);
      }
      return null;
    }
  }

  async clearSnapshot(): Promise<boolean> {
    if (!this.isAvailable || !this.opfsRoot) {
      return false;
    }

    try {
      await this.opfsRoot.removeEntry(SNAPSHOT_FILE);
      console.log('[OPFS] Snapshot supprimé');
      return true;
    } catch (error) {
      if ((error as Error).name !== 'NotFoundError') {
        console.error('[OPFS] Erreur de suppression:', error);
      }
      return false;
    }
  }

  isInitialized(): boolean {
    return this.isAvailable;
  }
}

export const opfsPersistence = new OPFSPersistence();
