import type { KenshoResponse, WorkerState } from '../types/messages';

type MessageHandler = (data: KenshoResponse) => void;
type StateChangeHandler = (state: WorkerState, details?: { version?: string; uptime?: number }) => void;

interface PendingRequest {
  resolve: (value: KenshoResponse['payload']) => void;
  reject: (error: Error) => void;
  timeoutId: number;
  onChunk?: (chunk: string) => void;
}

export interface BridgeConfig {
  defaultTimeout: number;
  reconnectAttempts: number;
  reconnectDelay: number;
  heartbeatTimeout: number;
}

const DEFAULT_CONFIG: BridgeConfig = {
  defaultTimeout: 60000,
  reconnectAttempts: 5,
  reconnectDelay: 1000,
  heartbeatTimeout: 15000,
};

export class KenshoBridge {
  private worker?: SharedWorker;
  private port?: MessagePort;
  private onMessageHandler?: MessageHandler;
  private onStateChangeHandler?: StateChangeHandler;
  private pendingRequests = new Map<string, PendingRequest>();
  private messageQueue: Array<{ type: string; payload: unknown; requestId: string }> = [];
  private isReady = false;
  private connectionId?: string;
  private config: BridgeConfig;
  private reconnectAttempts = 0;
  private currentState: WorkerState = 'disconnected';
  private lastHeartbeat = 0;
  private heartbeatCheckInterval?: number;
  private workerVersion?: string;
  private workerUptime = 0;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private setState(state: WorkerState, details?: { version?: string; uptime?: number }): void {
    if (this.currentState !== state) {
      this.currentState = state;
      console.log(`[UI Bridge] État: ${state}`);
      this.onStateChangeHandler?.(state, details);
    }
  }

  connect(options: {
    onMessage?: MessageHandler;
    onStateChange?: StateChangeHandler;
  } = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      this.onMessageHandler = options.onMessage;
      this.onStateChangeHandler = options.onStateChange;
      
      if (typeof SharedWorker === 'undefined') {
        const error = new Error("Les SharedWorkers ne sont pas supportés par ce navigateur.");
        console.error("[UI Bridge]", error.message);
        this.setState('error');
        reject(error);
        return;
      }

      this.setState('connecting');

      try {
        this.worker = new SharedWorker(
          new URL('../../kensho-worker.ts', import.meta.url),
          { type: 'module', name: 'kensho-kernel' }
        );

        this.port = this.worker.port;

        this.port.onmessage = (event: MessageEvent) => {
          this.handleWorkerMessage(event.data);
          
          if (event.data?.type === 'ready') {
            this.connectionId = event.data.payload?.connectionId;
            this.workerVersion = event.data.payload?.version;
            this.isReady = true;
            this.reconnectAttempts = 0;
            this.lastHeartbeat = Date.now();
            this.startHeartbeatCheck();
            this.flushMessageQueue();
            this.setState('ready', { 
              version: this.workerVersion, 
              uptime: event.data.payload?.uptime 
            });
            console.log(`[UI Bridge] ✅ Connecté v${this.workerVersion} (${this.connectionId})`);
            resolve();
          } else if (event.data?.type === 'connected') {
            this.connectionId = event.data.payload?.connectionId;
            this.workerVersion = event.data.payload?.version;
            this.setState('initializing', { version: this.workerVersion });
          } else if (event.data?.type === 'initializing') {
            this.setState('initializing');
          }
        };

        this.port.addEventListener('messageerror', (event: MessageEvent) => {
          console.error("[UI Bridge] Erreur de message:", event);
          this.handleConnectionError();
        });

        this.worker.onerror = (error) => {
          console.error("[UI Bridge] Erreur du worker:", error);
          this.setState('error');
          reject(new Error("Échec du démarrage du worker"));
        };

        this.port.start();

        setTimeout(() => {
          if (!this.isReady && this.currentState === 'connecting') {
            this.setState('initializing');
          }
        }, 2000);

      } catch (error) {
        console.error("[UI Bridge] Erreur lors de la connexion:", error);
        this.setState('error');
        reject(error);
      }
    });
  }

  private handleWorkerMessage(data: KenshoResponse): void {
    const { type, requestId, payload } = data;

    if (type === 'heartbeat') {
      this.lastHeartbeat = Date.now();
      this.workerUptime = payload?.uptime || 0;
      return;
    }

    if (requestId && requestId !== 'system' && this.pendingRequests.has(requestId)) {
      const pending = this.pendingRequests.get(requestId)!;

      if (type === 'stream-chunk' && payload?.chunk && pending.onChunk) {
        pending.onChunk(payload.chunk);
        return;
      }

      if (type === 'error') {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error(payload?.message || 'Erreur inconnue'));
        this.pendingRequests.delete(requestId);
        return;
      }

      if (type === 'final-response' || type === 'task-cancelled' || 
          type === 'cache-cleared' || type === 'status' || type === 'pong') {
        clearTimeout(pending.timeoutId);
        pending.resolve(payload);
        this.pendingRequests.delete(requestId);
      }
    }

    this.onMessageHandler?.(data);
  }

  private startHeartbeatCheck(): void {
    this.stopHeartbeatCheck();
    
    this.heartbeatCheckInterval = window.setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
      
      if (timeSinceLastHeartbeat > this.config.heartbeatTimeout) {
        console.warn('[UI Bridge] Heartbeat timeout - worker potentiellement mort');
        this.handleConnectionError();
      }
    }, this.config.heartbeatTimeout / 2);
  }

  private stopHeartbeatCheck(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = undefined;
    }
  }

  private handleConnectionError(): void {
    this.isReady = false;
    this.stopHeartbeatCheck();
    
    if (this.reconnectAttempts < this.config.reconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.config.reconnectDelay * this.reconnectAttempts;
      
      console.log(`[UI Bridge] Tentative de reconnexion ${this.reconnectAttempts}/${this.config.reconnectAttempts} dans ${delay}ms...`);
      this.setState('connecting');
      
      setTimeout(() => {
        this.connect({
          onMessage: this.onMessageHandler,
          onStateChange: this.onStateChangeHandler,
        }).catch(console.error);
      }, delay);
    } else {
      console.error("[UI Bridge] Échec de la reconnexion après plusieurs tentatives");
      this.setState('error');
      
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error("Connexion perdue avec le worker"));
      }
      this.pendingRequests.clear();
    }
  }

  sendMessage<T = KenshoResponse['payload']>(
    type: string, 
    payload: unknown, 
    options: {
      timeout?: number;
      onChunk?: (chunk: string) => void;
    } = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timeout = options.timeout ?? this.config.defaultTimeout;

      if (!this.isReady || !this.port) {
        this.messageQueue.push({ type, payload, requestId });
        
        if (!this.worker) {
          reject(new Error("Bridge non connecté. Appelez connect() d'abord."));
          return;
        }
        
        console.log("[UI Bridge] Message mis en file d'attente");
        
        const timeoutId = window.setTimeout(() => {
          const index = this.messageQueue.findIndex(m => m.requestId === requestId);
          if (index >= 0) {
            this.messageQueue.splice(index, 1);
          }
          this.pendingRequests.delete(requestId);
          reject(new Error(`Timeout: le worker n'est pas prêt après ${timeout}ms`));
        }, timeout);

        this.pendingRequests.set(requestId, { 
          resolve: resolve as (value: KenshoResponse['payload']) => void, 
          reject, 
          timeoutId,
          onChunk: options.onChunk
        });
        return;
      }

      const timeoutId = window.setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Requête ${requestId} timeout après ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(requestId, { 
        resolve: resolve as (value: KenshoResponse['payload']) => void, 
        reject, 
        timeoutId,
        onChunk: options.onChunk
      });

      this.port.postMessage({ type, payload, requestId });
      console.log(`[UI Bridge] Message envoyé: ${type} (${requestId})`);
    });
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isReady && this.port) {
      const message = this.messageQueue.shift()!;
      this.port.postMessage(message);
      console.log(`[UI Bridge] Message en attente envoyé: ${message.type}`);
    }
  }

  async processPrompt(
    prompt: string, 
    options: {
      streaming?: boolean;
      temperature?: number;
      maxTokens?: number;
      onChunk?: (chunk: string) => void;
      timeout?: number;
    } = {}
  ): Promise<string> {
    const result = await this.sendMessage<{ response?: string }>('process-prompt', {
      prompt,
      options: {
        streaming: options.streaming,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      }
    }, {
      timeout: options.timeout,
      onChunk: options.onChunk,
    });

    return result?.response || '';
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.sendMessage('cancel-task', { taskId });
  }

  async clearCache(): Promise<void> {
    await this.sendMessage('clear-cache', {});
  }

  async getStatus(): Promise<{
    activeConnections: number;
    activeTasks: number;
    cacheSize: number;
    uptime: number;
  }> {
    const result = await this.sendMessage<{ status?: {
      activeConnections: number;
      activeTasks: number;
      cacheSize: number;
      uptime: number;
    } }>('get-status', {});
    
    return result?.status || {
      activeConnections: 0,
      activeTasks: 0,
      cacheSize: 0,
      uptime: 0,
    };
  }

  async ping(): Promise<number> {
    const start = performance.now();
    await this.sendMessage('ping', {}, { timeout: 5000 });
    return performance.now() - start;
  }

  disconnect(): void {
    this.stopHeartbeatCheck();
    
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Bridge déconnecté"));
    }
    this.pendingRequests.clear();
    this.messageQueue = [];
    
    this.port?.close();
    this.worker = undefined;
    this.port = undefined;
    this.isReady = false;
    this.connectionId = undefined;
    
    this.setState('disconnected');
    console.log("[UI Bridge] Déconnecté du noyau Kensho");
  }

  isConnected(): boolean {
    return this.isReady;
  }

  getConnectionId(): string | undefined {
    return this.connectionId;
  }

  getState(): WorkerState {
    return this.currentState;
  }

  getWorkerVersion(): string | undefined {
    return this.workerVersion;
  }

  getWorkerUptime(): number {
    return this.workerUptime;
  }
}

export const kenshoBridge = new KenshoBridge();

export function connectToKernel(options: {
  onMessage?: MessageHandler;
  onStateChange?: StateChangeHandler;
} = {}): Promise<{ 
  sendMessage: typeof kenshoBridge.sendMessage;
  processPrompt: typeof kenshoBridge.processPrompt;
  disconnect: typeof kenshoBridge.disconnect;
  getState: typeof kenshoBridge.getState;
}> {
  return kenshoBridge.connect(options).then(() => ({
    sendMessage: kenshoBridge.sendMessage.bind(kenshoBridge),
    processPrompt: kenshoBridge.processPrompt.bind(kenshoBridge),
    disconnect: kenshoBridge.disconnect.bind(kenshoBridge),
    getState: kenshoBridge.getState.bind(kenshoBridge),
  }));
}
