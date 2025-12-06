import { parentPort } from 'worker_threads';
import { createLogger } from '../../lib/logger';
import { 
  AgentMessage, 
  AgentResponse, 
  createAgentResponse,
  validateAgentMessage
} from '../../core/types/agent-messages';
import { OrchestratorAgent } from './OrchestratorAgent';

const log = createLogger('OrchestratorWorker');

/**
 * Worker de l'orchestrateur
 * Exécute l'orchestrateur dans un thread séparé
 */

// Créer l'instance de l'orchestrateur
const orchestrator = new OrchestratorAgent({
  maxConcurrentAgents: 10,
  agentTimeoutMs: 30000,
  enableLoadBalancing: true,
  enableFaultTolerance: true
});

// Initialiser l'orchestrateur
orchestrator.initialize().catch(error => {
  log.error('Erreur lors de l\'initialisation de l\'orchestrateur:', error);
});

/**
 * Gérer les messages du parent
 */
if (parentPort) {
  parentPort.on('message', async (rawMessage: unknown) => {
    const validation = validateAgentMessage(rawMessage);
    
    if (!validation.success) {
      log.error('Message invalide:', validation.error);
      if (typeof rawMessage === 'object' && rawMessage !== null && 'requestId' in rawMessage) {
        sendResponse(createAgentResponse('ERROR', (rawMessage as { requestId: string }).requestId, { 
          message: validation.error
        }));
      }
      return;
    }

    const message = validation.data;
    log.info(`Message reçu: ${message.type} (${message.requestId})`);

    try {
      const response = await orchestrator.handleMessage(message);
      sendResponse(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
      log.error('Erreur lors du traitement du message:', error);
      sendResponse(createAgentResponse('ERROR', message.requestId, { 
        message: errorMessage 
      }));
    }
  });
}

/**
 * Envoyer une réponse au parent
 */
function sendResponse(response: AgentResponse): void {
  if (parentPort) {
    parentPort.postMessage(response);
  }
}

/**
 * Gérer l'arrêt propre
 */
process.on('SIGTERM', async () => {
  await orchestrator.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await orchestrator.shutdown();
  process.exit(0);
});

// Signaler que le worker est prêt
sendResponse(createAgentResponse('ORCHESTRATOR_READY', 'init', {
  message: 'Orchestrator worker prêt',
  timestamp: Date.now()
}));

log.info('OrchestratorWorker démarré et prêt');