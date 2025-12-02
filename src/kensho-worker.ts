import { initializeKernel, type KernelInstance } from './core/kernel/KernelInitializer';
import { opfsPersistence } from './core/kernel/OPFSPersistence';
import { PROTOCOL_VERSION, type KenshoResponse } from './core/types/messages';
import { createLogger } from './lib/logger';

const log = createLogger('KenshoWorker');

interface SharedWorkerGlobalScope {
  onconnect: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

declare const self: SharedWorkerGlobalScope;

log.info(`🚀 Kensho Worker v${PROTOCOL_VERSION} démarré. Prêt pour les connexions.`);

interface ConnectionInfo {
  port: MessagePort;
  kernel: KernelInstance;
  connectionId: string;
  connectedAt: number;
}

const WORKER_STATE = {
  isInitialized: false,
  isInitializing: false,
  startTime: Date.now(),
  totalRequests: 0,
  totalTokensGenerated: 0,
};

const connections = new Map<string, ConnectionInfo>();

function generateConnectionId(): string {
  return `conn-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function createSystemResponse(type: KenshoResponse['type'], payload?: KenshoResponse['payload']): KenshoResponse {
  return {
    type,
    requestId: 'system',
    payload,
    timestamp: Date.now(),
  };
}

function sendToAllPorts(response: KenshoResponse): void {
  connections.forEach(({ port }) => {
    try {
      port.postMessage(response);
    } catch (error) {
      log.error('[Worker] Erreur broadcast:', error);
    }
  });
}

function getWorkerMetrics() {
  const memoryUsage = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
  return {
    activeConnections: connections.size,
    uptime: Date.now() - WORKER_STATE.startTime,
    memoryUsage,
    totalRequests: WORKER_STATE.totalRequests,
    isInitialized: WORKER_STATE.isInitialized,
  };
}

async function initializeWorker(): Promise<void> {
  if (WORKER_STATE.isInitialized || WORKER_STATE.isInitializing) {
    return;
  }

  WORKER_STATE.isInitializing = true;
  log.info('[Worker] Initialisation du kernel...');

  sendToAllPorts(createSystemResponse('initializing', { 
    version: PROTOCOL_VERSION 
  }));

  try {
    const opfsReady = await opfsPersistence.initialize();
    
    if (opfsReady) {
      await opfsPersistence.startNewSession();
      
      const historicalStats = opfsPersistence.getHistoricalStats();
      log.info(`[Worker] Historique: ${historicalStats.totalRequests} requêtes, ${historicalStats.sessionCount} sessions`);
    }

    WORKER_STATE.isInitialized = true;
    WORKER_STATE.isInitializing = false;

    log.info('[Worker] ✅ Kernel initialisé avec succès');

    sendToAllPorts(createSystemResponse('ready', { 
      version: PROTOCOL_VERSION,
      ...getWorkerMetrics()
    }));

  } catch (error) {
    WORKER_STATE.isInitializing = false;
    log.error('[Worker] 💥 Erreur d\'initialisation:', error);
    
    sendToAllPorts(createSystemResponse('error', {
      code: 'INIT_FAILED',
      message: error instanceof Error ? error.message : 'Échec de l\'initialisation'
    }));
  }
}

const HEARTBEAT_INTERVAL = 5000;
setInterval(() => {
  if (connections.size > 0) {
    const metrics = getWorkerMetrics();
    sendToAllPorts(createSystemResponse('heartbeat', {
      uptime: metrics.uptime,
      memoryUsage: metrics.memoryUsage,
      status: {
        activeConnections: metrics.activeConnections,
        activeTasks: 0,
        cacheSize: 0,
        uptime: metrics.uptime,
      }
    }));
  }
}, HEARTBEAT_INTERVAL);

const METRICS_SAVE_INTERVAL = 60000;
setInterval(async () => {
  if (WORKER_STATE.isInitialized && opfsPersistence.isInitialized()) {
    await opfsPersistence.saveCurrentSession({
      requests: WORKER_STATE.totalRequests,
      tokens: WORKER_STATE.totalTokensGenerated,
      uptime: Date.now() - WORKER_STATE.startTime,
    });
  }
}, METRICS_SAVE_INTERVAL);

self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  const connectionId = generateConnectionId();
  
  log.info(`[Worker] 🔌 Nouvelle connexion: ${connectionId}`);

  try {
    const kernel = initializeKernel(port, connectionId);

    connections.set(connectionId, {
      port,
      kernel,
      connectionId,
      connectedAt: Date.now(),
    });

    port.onmessage = async (event: MessageEvent) => {
      WORKER_STATE.totalRequests++;

      try {
        if (!WORKER_STATE.isInitialized && event.data?.type !== 'ping') {
          if (!WORKER_STATE.isInitializing) {
            initializeWorker();
          }
          
          port.postMessage(createSystemResponse('initializing', {
            version: PROTOCOL_VERSION,
            message: 'Worker en cours d\'initialisation'
          }));
          return;
        }

        await kernel.handleMessage(event.data);
      } catch (error) {
        log.error(`[Worker] Erreur non gérée:`, error);
        port.postMessage({
          type: 'error',
          requestId: event.data?.requestId || 'unknown',
          payload: { 
            code: 'INTERNAL_ERROR',
            message: 'Erreur interne du worker',
            stack: error instanceof Error ? error.stack : undefined
          },
          timestamp: Date.now(),
        });
      }
    };

    port.onmessageerror = (error: MessageEvent) => {
      log.error(`[Worker] Erreur de message pour ${connectionId}:`, error);
      connections.delete(connectionId);
    };

    port.start();

    if (WORKER_STATE.isInitialized) {
      port.postMessage(createSystemResponse('ready', {
        connectionId,
        version: PROTOCOL_VERSION,
        ...getWorkerMetrics()
      }));
    } else {
      port.postMessage(createSystemResponse('connected', {
        connectionId,
        version: PROTOCOL_VERSION
      }));

      if (!WORKER_STATE.isInitializing) {
        initializeWorker();
      }
    }

    log.info(`[Worker] ✅ Connexion ${connectionId} établie. Total: ${connections.size}`);

  } catch (error) {
    log.error(`[Worker] Erreur lors de l'initialisation:`, error);
    port.postMessage(createSystemResponse('error', {
      code: 'CONNECTION_FAILED',
      message: 'Échec de l\'initialisation de la connexion',
      stack: error instanceof Error ? error.stack : undefined
    }));
  }
};

self.onerror = (error: ErrorEvent) => {
  log.error('[Worker] Erreur globale:', error);
  sendToAllPorts(createSystemResponse('error', {
    code: 'WORKER_ERROR',
    message: error.message || 'Erreur globale du worker'
  }));
};

(self as unknown as { getStatus: typeof getWorkerMetrics }).getStatus = getWorkerMetrics;
