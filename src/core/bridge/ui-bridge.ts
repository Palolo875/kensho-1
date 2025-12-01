import type { KenshoResponse } from '../types/messages';

type MessageHandler = (data: KenshoResponse) => void;

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
}

const DEFAULT_CONFIG: BridgeConfig = {
  defaultTimeout: 60000,
  reconnectAttempts: 3,
  reconnectDelay: 1000,
};

export class KenshoBridge {
  private worker?: SharedWorker;
  private port?: MessagePort;
  private onMessageHandler?: MessageHandler;
  private pendingRequests = new Map<string, PendingRequest>();
  private messageQueue: Array<{ type: string; payload: unknown; requestId: string }> = [];
  private isReady = false;
  private connectionId?: string;
  private config: BridgeConfig;
  private reconnectAttempts = 0;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  connect(onMessage?: MessageHandler): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof SharedWorker === 'undefined') {
        const error = new Error("Les SharedWorkers ne sont pas supportés par ce navigateur.");
        console.error("[UI Bridge]", error.message);
        reject(error);
        return;
      }

      try {
        this.onMessageHandler = onMessage;

        this.worker = new SharedWorker(
          new URL('../../kensho-worker.ts', import.meta.url),
          { type: 'module', name: 'kensho-kernel' }
        );

        this.port = this.worker.port;

        this.port.onmessage = (event: MessageEvent) => {
          this.handleWorkerMessage(event.data);
          
          if (event.data?.type === 'connected') {
            this.connectionId = event.data.payload?.connectionId;
            this.isReady = true;
            this.reconnectAttempts = 0;
            this.flushMessageQueue();
            console.log(`[UI Bridge] ✅ Connecté au noyau Kensho (${this.connectionId})`);
            resolve();
          }
        };

        this.port.addEventListener('messageerror', (event: MessageEvent) => {
          console.error("[UI Bridge] Erreur de message:", event);
          this.handleConnectionError();
        });

        this.worker.onerror = (error) => {
          console.error("[UI Bridge] Erreur du worker:", error);
          reject(new Error("Échec du démarrage du worker"));
        };

        this.port.start();

      } catch (error) {
        console.error("[UI Bridge] Erreur lors de la connexion:", error);
        reject(error);
      }
    });
  }

  private handleWorkerMessage(data: KenshoResponse): void {
    const { type, requestId, payload } = data;

    if (requestId && this.pendingRequests.has(requestId)) {
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

  private handleConnectionError(): void {
    this.isReady = false;
    
    if (this.reconnectAttempts < this.config.reconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[UI Bridge] Tentative de reconnexion ${this.reconnectAttempts}/${this.config.reconnectAttempts}...`);
      
      setTimeout(() => {
        this.connect(this.onMessageHandler).catch(console.error);
      }, this.config.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error("[UI Bridge] Échec de la reconnexion après plusieurs tentatives");
      
      for (const [requestId, pending] of this.pendingRequests) {
        pending.reject(new Error("Connexion perdue avec le worker"));
        this.pendingRequests.delete(requestId);
      }
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
    
    console.log("[UI Bridge] Déconnecté du noyau Kensho");
  }

  isConnected(): boolean {
    return this.isReady;
  }

  getConnectionId(): string | undefined {
    return this.connectionId;
  }
}

export const kenshoBridge = new KenshoBridge();

export function connectToKernel(
  onMessage: MessageHandler
): Promise<{ 
  sendMessage: typeof kenshoBridge.sendMessage;
  processPrompt: typeof kenshoBridge.processPrompt;
  disconnect: typeof kenshoBridge.disconnect;
}> {
  return kenshoBridge.connect(onMessage).then(() => ({
    sendMessage: kenshoBridge.sendMessage.bind(kenshoBridge),
    processPrompt: kenshoBridge.processPrompt.bind(kenshoBridge),
    disconnect: kenshoBridge.disconnect.bind(kenshoBridge),
  }));
}
