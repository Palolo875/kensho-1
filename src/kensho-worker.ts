import { initializeKernel, type KernelInstance } from './core/kernel/KernelInitializer';

interface SharedWorkerGlobalScope {
  onconnect: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

declare const self: SharedWorkerGlobalScope;

console.log("🚀 Kensho Worker v1.0 démarré. Prêt pour les connexions.");

const connections = new Map<string, {
  port: MessagePort;
  kernel: KernelInstance;
  connectionId: string;
}>();

let startTime = Date.now();

function generateConnectionId(): string {
  return `conn-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  const connectionId = generateConnectionId();
  
  console.log(`[Worker] 🔌 Nouvelle connexion établie: ${connectionId}`);

  try {
    const kernel = initializeKernel(port, connectionId);

    connections.set(connectionId, {
      port,
      kernel,
      connectionId,
    });

    port.onmessage = async (event: MessageEvent) => {
      try {
        await kernel.handleMessage(event.data);
      } catch (error) {
        console.error(`[Worker] Erreur non gérée:`, error);
        port.postMessage({
          type: 'error',
          requestId: event.data?.requestId || 'unknown',
          payload: { 
            message: 'Erreur interne du worker',
            stack: error instanceof Error ? error.stack : undefined
          },
          timestamp: Date.now(),
        });
      }
    };

    port.onmessageerror = (error) => {
      console.error(`[Worker] Erreur de message pour ${connectionId}:`, error);
    };

    port.start();

    port.postMessage({
      type: 'connected',
      requestId: 'system',
      payload: { connectionId },
      timestamp: Date.now(),
    });

    console.log(`[Worker] ✅ Connexion ${connectionId} initialisée. Total: ${connections.size}`);

  } catch (error) {
    console.error(`[Worker] Erreur lors de l'initialisation:`, error);
    port.postMessage({
      type: 'error',
      requestId: 'system',
      payload: { 
        message: 'Échec de l\'initialisation du kernel',
        stack: error instanceof Error ? error.stack : undefined
      },
      timestamp: Date.now(),
    });
  }
};

self.onerror = (error: ErrorEvent) => {
  console.error('[Worker] Erreur globale:', error);
};

function getWorkerStatus() {
  return {
    activeConnections: connections.size,
    uptime: Date.now() - startTime,
    memory: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0,
  };
}

(self as unknown as { getStatus: typeof getWorkerStatus }).getStatus = getWorkerStatus;
