/**
 * Gestionnaire centralisé des téléchargements
 * Permet de contrôler TOUS les téléchargements (LLM, embeddings, etc.)
 * avec pause/reprise/annulation
 */

export type DownloadType = 'llm' | 'embedding' | 'other';
export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface DownloadProgress {
  id: string;
  type: DownloadType;
  name: string;
  status: DownloadStatus;
  progress: number; // 0-1
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

  /**
   * Enregistre un nouveau téléchargement
   */
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
      pauseResolver: null,
      onProgress,
    });
    console.log(`[DownloadManager] ✅ Téléchargement enregistré: ${id} (${name})`);
    this.notifyListeners();
  }

  /**
   * Désenregistre un téléchargement
   */
  public unregister(id: string): void {
    this.downloads.delete(id);
    console.log(`[DownloadManager] ✅ Téléchargement désenregistré: ${id}`);
    this.notifyListeners();
  }

  /**
   * Met en pause un téléchargement spécifique
   */
  public pause(id: string): void {
    const download = this.downloads.get(id);
    if (download && !download.isPaused) {
      download.isPaused = true;
      console.log(`[DownloadManager] ⏸️ Mise en pause: ${id}`);
      this.notifyListeners();
    }
  }

  /**
   * Met en pause TOUS les téléchargements
   */
  public pauseAll(): void {
    for (const download of this.downloads.values()) {
      if (!download.isPaused) {
        download.isPaused = true;
      }
    }
    console.log(`[DownloadManager] ⏸️ Tous les téléchargements mis en pause`);
    this.notifyListeners();
  }

  /**
   * Reprend un téléchargement spécifique
   */
  public resume(id: string): void {
    const download = this.downloads.get(id);
    if (download && download.isPaused) {
      download.isPaused = false;
      if (download.pauseResolver) {
        download.pauseResolver();
        download.pauseResolver = null;
      }
      console.log(`[DownloadManager] ▶️ Reprise: ${id}`);
      this.notifyListeners();
    }
  }

  /**
   * Reprend TOUS les téléchargements
   */
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
    console.log(`[DownloadManager] ▶️ Tous les téléchargements repris`);
    this.notifyListeners();
  }

  /**
   * Annule un téléchargement
   */
  public cancel(id: string): void {
    const download = this.downloads.get(id);
    if (download) {
      this.unregister(id);
      console.log(`[DownloadManager] ❌ Téléchargement annulé: ${id}`);
    }
  }

  /**
   * Annule TOUS les téléchargements
   */
  public cancelAll(): void {
    const ids = Array.from(this.downloads.keys());
    for (const id of ids) {
      this.cancel(id);
    }
    console.log(`[DownloadManager] ❌ Tous les téléchargements annulés`);
  }

  /**
   * Vérifie si un téléchargement est en pause
   */
  public isPaused(id: string): boolean {
    const download = this.downloads.get(id);
    return download?.isPaused ?? false;
  }

  /**
   * Attend la reprise si en pause
   */
  public async waitIfPaused(id: string): Promise<void> {
    const download = this.downloads.get(id);
    if (!download) return;

    if (download.isPaused) {
      await new Promise<void>((resolve) => {
        download.pauseResolver = resolve;
      });
    }
  }

  /**
   * Obtient tous les téléchargements
   */
  public getAll(): DownloadProgress[] {
    return Array.from(this.downloads.values()).map(d => ({
      id: d.id,
      type: d.type,
      name: d.name,
      status: d.isPaused ? 'paused' : 'downloading' as DownloadStatus,
      progress: 0,
    }));
  }

  /**
   * S'abonne aux changements de tous les téléchargements
   */
  public subscribe(listener: (downloads: Map<string, DownloadProgress>) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  /**
   * Met à jour la progression d'un téléchargement
   */
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
