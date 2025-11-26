import { createLogger } from '../../lib/logger';

const log = createLogger('DownloadManager');

export type DownloadType = 'llm' | 'embedding' | 'other';
export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface DownloadProgress {
  id: string;
  type: DownloadType;
  name: string;
  status: DownloadStatus;
  progress: number;
  downloadedMB?: number;
  totalMB?: number;
  speedMBps?: number;
  etaSeconds?: number;
  error?: string;
}

interface DownloadTask {
  id: string;
  type: DownloadType;
  name: string;
  isPaused: boolean;
  isCancelled: boolean;
  pauseResolver: (() => void) | null;
  onProgress: (progress: DownloadProgress) => void;
}

export class DownloadManager {
  private static instance: DownloadManager | null = null;
  private downloads = new Map<string, DownloadTask>();
  private progressListeners = new Set<(downloads: Map<string, DownloadProgress>) => void>();

  private constructor() {}

  public static getInstance(): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager();
    }
    return DownloadManager.instance;
  }

  public register(
    id: string,
    type: DownloadType,
    name: string,
    onProgress: (progress: DownloadProgress) => void
  ): void {
    this.downloads.set(id, {
      id,
      type,
      name,
      isPaused: false,
      isCancelled: false,
      pauseResolver: null,
      onProgress,
    });
    log.info(`Téléchargement enregistré: ${id} (${name})`);
    this.notifyListeners();
  }

  public unregister(id: string): void {
    this.downloads.delete(id);
    log.info(`Téléchargement désenregistré: ${id}`);
    this.notifyListeners();
  }

  public pause(id: string): void {
    const download = this.downloads.get(id);
    if (download && !download.isPaused) {
      download.isPaused = true;
      log.info(`Mise en pause: ${id}`);
      this.notifyListeners();
    }
  }

  public pauseAll(): void {
    for (const download of this.downloads.values()) {
      if (!download.isPaused) {
        download.isPaused = true;
      }
    }
    log.info('Tous les téléchargements mis en pause');
    this.notifyListeners();
  }

  public resume(id: string): void {
    const download = this.downloads.get(id);
    if (download && download.isPaused) {
      download.isPaused = false;
      if (download.pauseResolver) {
        download.pauseResolver();
        download.pauseResolver = null;
      }
      log.info(`Reprise: ${id}`);
      this.notifyListeners();
    }
  }

  public resumeAll(): void {
    for (const download of this.downloads.values()) {
      if (download.isPaused) {
        download.isPaused = false;
        if (download.pauseResolver) {
          download.pauseResolver();
          download.pauseResolver = null;
        }
      }
    }
    log.info('Tous les téléchargements repris');
    this.notifyListeners();
  }

  public cancel(id: string): void {
    const download = this.downloads.get(id);
    if (download) {
      this.unregister(id);
      log.info(`Téléchargement annulé: ${id}`);
    }
  }

  public cancelAll(): void {
    const ids = Array.from(this.downloads.keys());
    for (const id of ids) {
      this.cancel(id);
    }
    log.info('Tous les téléchargements annulés');
  }

  public markCancelled(id: string, error?: string): void {
    const download = this.downloads.get(id);
    if (download) {
      download.isCancelled = true;
      log.info(`Téléchargement marqué comme annulé: ${id}`);
      this.notifyListeners();
    }
  }

  public isCancelled(id: string): boolean {
    const download = this.downloads.get(id);
    return download?.isCancelled ?? false;
  }

  public isPaused(id: string): boolean {
    const download = this.downloads.get(id);
    return download?.isPaused ?? false;
  }

  public async waitIfPaused(id: string): Promise<void> {
    const download = this.downloads.get(id);
    if (!download) return;

    if (download.isPaused) {
      await new Promise<void>((resolve) => {
        download.pauseResolver = resolve;
      });
    }
  }

  public getAll(): DownloadProgress[] {
    return Array.from(this.downloads.values()).map(d => ({
      id: d.id,
      type: d.type,
      name: d.name,
      status: d.isPaused ? 'paused' : 'downloading' as DownloadStatus,
      progress: 0,
    }));
  }

  public subscribe(listener: (downloads: Map<string, DownloadProgress>) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  public updateProgress(id: string, progress: DownloadProgress): void {
    const download = this.downloads.get(id);
    if (download) {
      download.onProgress(progress);
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    const progressMap = new Map<string, DownloadProgress>();
    for (const download of this.downloads.values()) {
      progressMap.set(download.id, {
        id: download.id,
        type: download.type,
        name: download.name,
        status: download.isPaused ? 'paused' : 'downloading',
        progress: 0,
      });
    }
    for (const listener of this.progressListeners) {
      listener(progressMap);
    }
  }
}
