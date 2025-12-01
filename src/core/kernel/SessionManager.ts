import { createLogger } from '../../lib/logger';

const log = createLogger('SessionManager');

export interface PendingTask {
  requestId: string;
  type: string;
  payload: unknown;
  createdAt: number;
  retries: number;
}

export interface SessionSnapshot {
  version: string;
  sessionId: string;
  timestamp: number;
  pendingTasks: PendingTask[];
  completedTasks: string[];
}

const SESSION_FILE = 'kensho-session-snapshot.json';
const PROTOCOL_VERSION = '1.0';

export class SessionManager {
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private isAvailable = false;
  private sessionId: string;
  private pendingTasks = new Map<string, PendingTask>();
  private completedTasks = new Set<string>();

  constructor() {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  async initialize(opfsRoot: FileSystemDirectoryHandle | null): Promise<void> {
    try {
      this.opfsRoot = opfsRoot;
      this.isAvailable = !!opfsRoot;

      if (this.isAvailable) {
        const snapshot = await this.loadSnapshot();
        if (snapshot) {
          this.pendingTasks = new Map(snapshot.pendingTasks.map(t => [t.requestId, t]));
          this.completedTasks = new Set(snapshot.completedTasks);
          log.info(`Session restaurée: ${snapshot.pendingTasks.length} tâches en attente`);
        }
      }
    } catch (error) {
      log.error('Erreur init SessionManager:', error as Error);
      this.isAvailable = false;
    }
  }

  addPendingTask(requestId: string, type: string, payload: unknown): void {
    if (this.completedTasks.has(requestId)) {
      return;
    }

    this.pendingTasks.set(requestId, {
      requestId,
      type,
      payload,
      createdAt: Date.now(),
      retries: 0,
    });
  }

  markTaskCompleted(requestId: string): void {
    this.pendingTasks.delete(requestId);
    this.completedTasks.add(requestId);
  }

  getPendingTasks(): PendingTask[] {
    return Array.from(this.pendingTasks.values());
  }

  async saveSnapshot(): Promise<boolean> {
    if (!this.isAvailable || !this.opfsRoot) return false;

    try {
      const snapshot: SessionSnapshot = {
        version: PROTOCOL_VERSION,
        sessionId: this.sessionId,
        timestamp: Date.now(),
        pendingTasks: Array.from(this.pendingTasks.values()),
        completedTasks: Array.from(this.completedTasks),
      };

      const fileHandle = await this.opfsRoot.getFileHandle(SESSION_FILE, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(snapshot, null, 2));
      await writable.close();

      log.debug('Snapshot session sauvegardé');
      return true;
    } catch (error) {
      log.error('Erreur sauvegarde snapshot:', error as Error);
      return false;
    }
  }

  private async loadSnapshot(): Promise<SessionSnapshot | null> {
    if (!this.isAvailable || !this.opfsRoot) return null;

    try {
      const fileHandle = await this.opfsRoot.getFileHandle(SESSION_FILE);
      const file = await fileHandle.getFile();
      const content = await file.text();
      const snapshot = JSON.parse(content) as SessionSnapshot;

      if (snapshot.version !== PROTOCOL_VERSION) {
        log.warn('Version snapshot incompatible');
        return null;
      }

      const age = Date.now() - snapshot.timestamp;
      if (age > 24 * 60 * 60 * 1000) {
        log.warn('Snapshot trop ancien');
        return null;
      }

      return snapshot;
    } catch (error) {
      if ((error as Error).name !== 'NotFoundError') {
        log.debug('Pas de snapshot existant');
      }
      return null;
    }
  }

  async clearSnapshot(): Promise<void> {
    if (!this.isAvailable || !this.opfsRoot) return;

    try {
      await this.opfsRoot.removeEntry(SESSION_FILE);
      this.pendingTasks.clear();
      this.completedTasks.clear();
    } catch (error) {
      if ((error as Error).name !== 'NotFoundError') {
        log.error('Erreur suppression snapshot:', error as Error);
      }
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

export const sessionManager = new SessionManager();
