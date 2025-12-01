import { createLogger } from '../../lib/logger';

const log = createLogger('OPFSPersistence');

export interface WorkerMetrics {
  version: string;
  timestamp: number;
  sessionCount: number;
  historicalStats: {
    totalRequests: number;
    totalTokensGenerated: number;
    totalUptime: number;
  };
  currentSession: {
    requests: number;
    tokens: number;
    uptime: number;
    startTime: number;
  } | null;
}

const METRICS_FILE = 'kensho-worker-metrics.json';
const PROTOCOL_VERSION = '1.0';

export class OPFSPersistence {
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private isAvailable = false;
  private cachedMetrics: WorkerMetrics | null = null;

  async initialize(): Promise<boolean> {
    try {
      if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
        log.warn('OPFS non disponible dans cet environnement');
        return false;
      }

      this.opfsRoot = await navigator.storage.getDirectory();
      this.isAvailable = true;
      
      const loaded = await this.loadMetrics();
      
      if (loaded && loaded.currentSession) {
        this.cachedMetrics = {
          ...loaded,
          historicalStats: {
            totalRequests: loaded.historicalStats.totalRequests + loaded.currentSession.requests,
            totalTokensGenerated: loaded.historicalStats.totalTokensGenerated + loaded.currentSession.tokens,
            totalUptime: loaded.historicalStats.totalUptime + loaded.currentSession.uptime,
          },
          currentSession: null,
        };
        log.info('Session précédente fusionnée dans l\'historique');
      }
      
      log.info('OPFS initialisé avec succès');
      return true;
    } catch (error) {
      log.error('Erreur d\'initialisation OPFS:', error as Error);
      this.isAvailable = false;
      return false;
    }
  }

  async saveCurrentSession(sessionStats: {
    requests: number;
    tokens: number;
    uptime: number;
  }): Promise<boolean> {
    if (!this.isAvailable || !this.opfsRoot || !this.cachedMetrics) {
      return false;
    }

    try {
      const metrics: WorkerMetrics = {
        ...this.cachedMetrics,
        timestamp: Date.now(),
        currentSession: {
          ...sessionStats,
          startTime: this.cachedMetrics.currentSession?.startTime || Date.now(),
        },
      };

      const fileHandle = await this.opfsRoot.getFileHandle(METRICS_FILE, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(metrics, null, 2));
      await writable.close();

      this.cachedMetrics = metrics;
      return true;
    } catch (error) {
      log.error('Erreur de sauvegarde session:', error as Error);
      return false;
    }
  }

  async loadMetrics(): Promise<WorkerMetrics | null> {
    if (!this.isAvailable || !this.opfsRoot) {
      return null;
    }

    try {
      const fileHandle = await this.opfsRoot.getFileHandle(METRICS_FILE);
      const file = await fileHandle.getFile();
      const content = await file.text();
      const metrics = JSON.parse(content) as WorkerMetrics;

      if (metrics.version !== PROTOCOL_VERSION) {
        log.warn('Version de métriques incompatible, reset');
        return null;
      }

      log.info(`Métriques chargées: ${metrics.historicalStats.totalRequests} requêtes historiques`);
      return metrics;
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        log.debug('Pas de métriques existantes');
      }
      return null;
    }
  }

  async startNewSession(): Promise<void> {
    if (!this.isAvailable || !this.opfsRoot) return;

    try {
      const existing = this.cachedMetrics;
      
      const metrics: WorkerMetrics = {
        version: PROTOCOL_VERSION,
        timestamp: Date.now(),
        sessionCount: (existing?.sessionCount || 0) + 1,
        historicalStats: existing?.historicalStats || {
          totalRequests: 0,
          totalTokensGenerated: 0,
          totalUptime: 0,
        },
        currentSession: {
          requests: 0,
          tokens: 0,
          uptime: 0,
          startTime: Date.now(),
        },
      };

      const fileHandle = await this.opfsRoot.getFileHandle(METRICS_FILE, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(metrics, null, 2));
      await writable.close();

      this.cachedMetrics = metrics;
      log.info(`Nouvelle session #${metrics.sessionCount} démarrée`);
    } catch (error) {
      log.error('Erreur démarrage session:', error as Error);
    }
  }

  getHistoricalStats(): { totalRequests: number; totalUptime: number; sessionCount: number } {
    const historical = this.cachedMetrics?.historicalStats || { totalRequests: 0, totalUptime: 0 };
    const current = this.cachedMetrics?.currentSession || { requests: 0, uptime: 0 };
    
    return {
      totalRequests: historical.totalRequests + current.requests,
      totalUptime: historical.totalUptime + current.uptime,
      sessionCount: this.cachedMetrics?.sessionCount || 0,
    };
  }

  async clearMetrics(): Promise<boolean> {
    if (!this.isAvailable || !this.opfsRoot) {
      return false;
    }

    try {
      await this.opfsRoot.removeEntry(METRICS_FILE);
      this.cachedMetrics = null;
      log.info('Métriques effacées');
      return true;
    } catch (error) {
      if ((error as Error).name !== 'NotFoundError') {
        log.error('Erreur suppression métriques:', error as Error);
      }
      return false;
    }
  }

  isInitialized(): boolean {
    return this.isAvailable;
  }
}

export const opfsPersistence = new OPFSPersistence();
