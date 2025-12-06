import { MessagePort } from 'worker_threads';
import { createLogger } from '../../lib/logger';
import { eventBus } from '../../core/eventbus/EventBus';
import { 
  AgentMessage,
  AgentResponse,
  createAgentResponse
} from '../../core/types/agent-messages';

const log = createLogger('OrchestratorAgent');

/**
 * Configuration de l'orchestrateur
 */
export interface OrchestratorConfig {
  maxConcurrentAgents: number;
  agentTimeoutMs: number;
  enableLoadBalancing: boolean;
  enableFaultTolerance: boolean;
}

/**
 * Statistiques de l'orchestrateur
 */
export interface OrchestratorStats {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  averageTaskTime: number;
  activeAgents: number;
  totalAgentRestarts: number;
}

/**
 * Agent géré par l'orchestrateur
 */
interface ManagedAgent {
  id: string;
  port: MessagePort;
  type: string;
  isActive: boolean;
  lastHeartbeat: number;
  taskCount: number;
  errorCount: number;
}

/**
 * Orchestrateur Multi-Agents - Gère l'exécution coordonnée de plusieurs agents
 *
 * Responsabilités:
 * - Gestion du cycle de vie des agents (démarrage, arrêt, redémarrage)
 * - Distribution équilibrée des tâches
 * - Tolérance aux pannes avec redémarrage automatique
 * - Surveillance des performances
 * - Communication avec le noyau principal
 */
export class OrchestratorAgent {
  private config: OrchestratorConfig;
  private agents: Map<string, ManagedAgent> = new Map();
  private stats: OrchestratorStats = {
    totalTasks: 0,
    successfulTasks: 0,
    failedTasks: 0,
    averageTaskTime: 0,
    activeAgents: 0,
    totalAgentRestarts: 0
  };
  private taskStartTime: Map<string, number> = new Map();
  private isShuttingDown = false;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = {
      maxConcurrentAgents: 10,
      agentTimeoutMs: 30000,
      enableLoadBalancing: true,
      enableFaultTolerance: true,
      ...config
    };

    log.info('Orchestrateur Multi-Agents initialisé', this.config);
  }

  /**
   * Initialise l'orchestrateur
   */
  public async initialize(): Promise<void> {
    log.info('Initialisation de l\'orchestrateur...');
    
    // S'abonner aux événements du bus
    eventBus.on('AGENT_READY', (data) => this.handleAgentReady(data));
    eventBus.on('AGENT_ERROR', (data) => this.handleAgentError(data));
    eventBus.on('AGENT_HEARTBEAT', (data) => this.handleAgentHeartbeat(data));
    
    // Envoyer un événement pour signaler que l'orchestrateur est prêt
    eventBus.emit('ORCHESTRATOR_READY', { timestamp: Date.now() });
    
    log.info('Orchestrateur prêt');
  }

  /**
   * Gère un message entrant
   */
  public async handleMessage(message: AgentMessage): Promise<AgentResponse> {
    const startTime = Date.now();
    this.stats.totalTasks++;
    this.taskStartTime.set(message.requestId, startTime);

    try {
      log.info(`Traitement du message: ${message.type} (${message.requestId})`);

      switch (message.type) {
        case 'ORCHESTRATE_TASK':
          return await this.handleOrchestrateTask(message);
        
        case 'GET_ORCHESTRATOR_STATUS':
          return this.handleGetStatus(message);
          
        case 'REGISTER_AGENT':
          return await this.handleRegisterAgent(message);
          
        case 'UNREGISTER_AGENT':
          return await this.handleUnregisterAgent(message);
          
        default:
          return createAgentResponse('ERROR', message.requestId, {
            message: `Type de message inconnu: ${message.type}`
          });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      log.error(`Erreur lors du traitement du message ${message.requestId}:`, error);
      
      this.stats.failedTasks++;
      this.updateAverageTaskTime(startTime);
      
      return createAgentResponse('ERROR', message.requestId, {
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      });
    }
  }

  /**
   * Orchestre une tâche en distribuant aux agents appropriés
   */
  private async handleOrchestrateTask(message: AgentMessage): Promise<AgentResponse> {
    const { tasks, coordinationStrategy = 'SEQUENTIAL' } = message.payload;
    
    log.info(`Orchestration de ${tasks.length} tâches avec stratégie ${coordinationStrategy}`);
    
    try {
      let results: any[] = [];
      
      if (coordinationStrategy === 'PARALLEL') {
        results = await this.executeTasksInParallel(tasks);
      } else {
        results = await this.executeTasksSequentially(tasks);
      }
      
      this.stats.successfulTasks++;
      this.updateAverageTaskTime(this.taskStartTime.get(message.requestId) || Date.now());
      
      return createAgentResponse('TASK_COMPLETED', message.requestId, {
        results,
        strategy: coordinationStrategy
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Échec de l\'orchestration';
      log.error('Échec de l\'orchestration:', error);
      
      this.stats.failedTasks++;
      this.updateAverageTaskTime(this.taskStartTime.get(message.requestId) || Date.now());
      
      return createAgentResponse('ERROR', message.requestId, {
        message: errorMessage
      });
    }
  }

  /**
   * Exécute des tâches en parallèle
   */
  private async executeTasksInParallel(tasks: any[]): Promise<any[]> {
    const promises = tasks.map(async (task) => {
      const agent = this.selectAgentForTask(task);
      if (!agent) {
        throw new Error(`Aucun agent disponible pour la tâche: ${task.type}`);
      }
      
      return this.sendTaskToAgent(agent, task);
    });
    
    return Promise.all(promises);
  }

  /**
   * Exécute des tâches séquentiellement
   */
  private async executeTasksSequentially(tasks: any[]): Promise<any[]> {
    const results: any[] = [];
    
    for (const task of tasks) {
      const agent = this.selectAgentForTask(task);
      if (!agent) {
        throw new Error(`Aucun agent disponible pour la tâche: ${task.type}`);
      }
      
      const result = await this.sendTaskToAgent(agent, task);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Sélectionne l'agent approprié pour une tâche
   */
  private selectAgentForTask(task: any): ManagedAgent | null {
    if (this.config.enableLoadBalancing) {
      // Sélectionner l'agent avec le moins de tâches
      let bestAgent: ManagedAgent | null = null;
      let minTaskCount = Infinity;
      
      for (const agent of this.agents.values()) {
        if (agent.isActive && agent.taskCount < minTaskCount) {
          bestAgent = agent;
          minTaskCount = agent.taskCount;
        }
      }
      
      return bestAgent;
    } else {
      // Sélectionner le premier agent actif
      for (const agent of this.agents.values()) {
        if (agent.isActive) {
          return agent;
        }
      }
    }
    
    return null;
  }

  /**
   * Envoie une tâche à un agent
   */
  private async sendTaskToAgent(agent: ManagedAgent, task: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout lors de l'envoi de la tâche à l'agent ${agent.id}`));
      }, this.config.agentTimeoutMs);
      
      const requestId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const responseHandler = (response: AgentResponse) => {
        if (response.requestId === requestId) {
          clearTimeout(timeout);
          agent.port.removeListener('message', responseHandler);
          
          if (response.type === 'ERROR') {
            reject(new Error(response.payload?.message || 'Erreur de l\'agent'));
          } else {
            resolve(response.payload);
          }
        }
      };
      
      agent.port.on('message', responseHandler);
      
      agent.port.postMessage({
        type: task.type,
        payload: task.payload,
        requestId
      });
      
      agent.taskCount++;
    });
  }

  /**
   * Gère l'enregistrement d'un nouvel agent
   */
  private async handleRegisterAgent(message: AgentMessage): Promise<AgentResponse> {
    const { agentId, agentType, port } = message.payload;
    
    if (this.agents.has(agentId)) {
      return createAgentResponse('ERROR', message.requestId, {
        message: `Agent ${agentId} déjà enregistré`
      });
    }
    
    const agent: ManagedAgent = {
      id: agentId,
      port,
      type: agentType,
      isActive: true,
      lastHeartbeat: Date.now(),
      taskCount: 0,
      errorCount: 0
    };
    
    this.agents.set(agentId, agent);
    this.stats.activeAgents++;
    
    log.info(`Agent ${agentId} (${agentType}) enregistré`);
    
    // Envoyer un message de confirmation à l'agent
    port.postMessage(createAgentResponse('AGENT_REGISTERED', message.requestId, {
      agentId,
      message: 'Agent enregistré avec succès'
    }));
    
    return createAgentResponse('SUCCESS', message.requestId, {
      message: `Agent ${agentId} enregistré`
    });
  }

  /**
   * Gère le désenregistrement d'un agent
   */
  private async handleUnregisterAgent(message: AgentMessage): Promise<AgentResponse> {
    const { agentId } = message.payload;
    
    const agent = this.agents.get(agentId);
    if (!agent) {
      return createAgentResponse('ERROR', message.requestId, {
        message: `Agent ${agentId} non trouvé`
      });
    }
    
    // Fermer le port de communication
    agent.port.close();
    this.agents.delete(agentId);
    this.stats.activeAgents--;
    
    log.info(`Agent ${agentId} désenregistré`);
    
    return createAgentResponse('SUCCESS', message.requestId, {
      message: `Agent ${agentId} désenregistré`
    });
  }

  /**
   * Gère l'événement de disponibilité d'un agent
   */
  private handleAgentReady(data: any): void {
    log.info('Agent prêt:', data);
  }

  /**
   * Gère les erreurs d'agent
   */
  private handleAgentError(data: any): void {
    log.error('Erreur d\'agent:', data);
    
    if (this.config.enableFaultTolerance) {
      const agentId = data.agentId;
      const agent = this.agents.get(agentId);
      
      if (agent) {
        agent.errorCount++;
        
        // Redémarrer l'agent si trop d'erreurs
        if (agent.errorCount > 3) {
          log.warn(`Redémarrage de l'agent ${agentId} après ${agent.errorCount} erreurs`);
          this.restartAgent(agentId);
        }
      }
    }
  }

  /**
   * Gère les signaux de vie des agents
   */
  private handleAgentHeartbeat(data: any): void {
    const agent = this.agents.get(data.agentId);
    if (agent) {
      agent.lastHeartbeat = Date.now();
      agent.isActive = true;
    }
  }

  /**
   * Redémarre un agent
   */
  private async restartAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    log.info(`Redémarrage de l'agent ${agentId}...`);
    
    // Fermer l'ancien port
    agent.port.close();
    
    // Supprimer l'agent de la liste
    this.agents.delete(agentId);
    this.stats.activeAgents--;
    this.stats.totalAgentRestarts++;
    
    // TODO: Implémenter le redémarrage réel de l'agent
    // Cela dépendrait de l'implémentation spécifique de chaque type d'agent
    
    log.info(`Agent ${agentId} redémarré`);
  }

  /**
   * Gère la requête de statut
   */
  private handleGetStatus(message: AgentMessage): AgentResponse {
    return createAgentResponse('ORCHESTRATOR_STATUS', message.requestId, {
      stats: { ...this.stats },
      config: { ...this.config },
      agents: Array.from(this.agents.values()).map(agent => ({
        id: agent.id,
        type: agent.type,
        isActive: agent.isActive,
        taskCount: agent.taskCount,
        errorCount: agent.errorCount,
        lastHeartbeat: agent.lastHeartbeat
      }))
    });
  }

  /**
   * Met à jour le temps moyen de traitement des tâches
   */
  private updateAverageTaskTime(startTime: number): void {
    const taskTime = Date.now() - startTime;
    const totalTaskTime = this.stats.averageTaskTime * (this.stats.totalTasks - 1) + taskTime;
    this.stats.averageTaskTime = totalTaskTime / this.stats.totalTasks;
  }

  /**
   * Effectue un nettoyage propre
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    log.info('Arrêt de l\'orchestrateur...');
    
    // Fermer tous les ports d'agents
    for (const agent of this.agents.values()) {
      try {
        agent.port.close();
      } catch (error) {
        log.warn(`Erreur lors de la fermeture du port de l'agent ${agent.id}:`, error);
      }
    }
    
    this.agents.clear();
    this.stats.activeAgents = 0;
    
    log.info('Orchestrateur arrêté');
  }
}

// Export singleton
export const orchestratorAgent = new OrchestratorAgent();