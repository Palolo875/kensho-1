import { parentPort } from 'worker_threads';
import { createLogger } from '../../lib/logger';
import { eventBus } from '../../core/eventbus/EventBus';
import { 
  AgentMessage, 
  AgentResponse, 
  createAgentResponse,
  validateAgentMessage
} from '../../core/types/agent-messages';

const log = createLogger('ExampleAgent');

/**
 * Exemple d'agent simple pour démonstration
 * Cet agent peut effectuer des calculs mathématiques simples
 */
class ExampleAgent {
  private agentId: string;
  private isReady = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.setupMessageHandler();
    this.startHeartbeat();
  }

  /**
   * Configure le gestionnaire de messages
   */
  private setupMessageHandler(): void {
    if (!parentPort) {
      log.error('parentPort non disponible');
      return;
    }

    parentPort.on('message', async (rawMessage: unknown) => {
      const validation = validateAgentMessage(rawMessage);
      
      if (!validation.success) {
        log.error('Message invalide:', validation.error);
        if (typeof rawMessage === 'object' && rawMessage !== null && 'requestId' in rawMessage) {
          this.sendResponse(createAgentResponse('ERROR', (rawMessage as { requestId: string }).requestId, { 
            message: validation.error
          }));
        }
        return;
      }

      const message = validation.data;
      log.info(`Message reçu: ${message.type} (${message.requestId})`);

      try {
        const response = await this.handleMessage(message);
        this.sendResponse(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
        log.error('Erreur lors du traitement du message:', error);
        this.sendResponse(createAgentResponse('ERROR', message.requestId, { 
          message: errorMessage 
        }));
      }
    });
  }

  /**
   * Gère un message entrant
   */
  private async handleMessage(message: AgentMessage): Promise<AgentResponse> {
    switch (message.type) {
      case 'CALCULATE':
        return this.handleCalculate(message);
      
      case 'GET_AGENT_INFO':
        return this.handleGetAgentInfo(message);
        
      default:
        return createAgentResponse('ERROR', message.requestId, {
          message: `Type de message inconnu: ${message.type}`
        });
    }
  }

  /**
   * Effectue un calcul mathématique
   */
  private handleCalculate(message: AgentMessage): AgentResponse {
    const { operation, operands } = message.payload;
    
    let result: number;
    
    switch (operation) {
      case 'ADD':
        result = operands.reduce((sum, operand) => sum + operand, 0);
        break;
      case 'MULTIPLY':
        result = operands.reduce((product, operand) => product * operand, 1);
        break;
      case 'SUBTRACT':
        result = operands[0] - (operands.slice(1).reduce((sum, operand) => sum + operand, 0));
        break;
      case 'DIVIDE':
        result = operands[0] / (operands.slice(1).reduce((product, operand) => product * operand, 1));
        break;
      default:
        throw new Error(`Opération non supportée: ${operation}`);
    }
    
    return createAgentResponse('SUCCESS', message.requestId, {
      result,
      operation,
      operands
    });
  }

  /**
   * Retourne les informations sur l'agent
   */
  private handleGetAgentInfo(message: AgentMessage): AgentResponse {
    return createAgentResponse('SUCCESS', message.requestId, {
      agentId: this.agentId,
      type: 'ExampleAgent',
      isReady: this.isReady,
      timestamp: Date.now()
    });
  }

  /**
   * Envoie une réponse au parent
   */
  private sendResponse(response: AgentResponse): void {
    if (parentPort) {
      parentPort.postMessage(response);
    }
  }

  /**
   * Démarre le signal de vie
   */
  private startHeartbeat(): void {
    // Envoyer un signal de disponibilité
    eventBus.emit('AGENT_READY', {
      agentId: this.agentId,
      agentType: 'ExampleAgent'
    });
    
    this.isReady = true;
    
    // Envoyer des signaux de vie régulièrement
    this.heartbeatInterval = setInterval(() => {
      eventBus.emit('AGENT_HEARTBEAT', {
        agentId: this.agentId,
        timestamp: Date.now()
      });
    }, 5000); // Toutes les 5 secondes
  }

  /**
   * Arrête l'agent proprement
   */
  public shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.isReady = false;
    log.info('Agent arrêté');
  }
}

// Démarrer l'agent
const agent = new ExampleAgent('example-agent-1');

// Gérer l'arrêt propre
process.on('SIGTERM', () => {
  agent.shutdown();
  process.exit(0);
});

process.on('SIGINT', () => {
  agent.shutdown();
  process.exit(0);
});

log.info('ExampleAgent démarré');