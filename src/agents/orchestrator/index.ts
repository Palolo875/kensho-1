import { Worker } from 'worker_threads';
import { createLogger } from '../../lib/logger';
import { eventBus } from '../../core/eventbus/EventBus';

const log = createLogger('OrchestratorIndex');

/**
 * Point d'entrée de l'orchestrateur
 * Crée et initialise l'orchestrateur dans un worker
 */

// Créer le worker de l'orchestrateur
const orchestratorWorker = new Worker(
  new URL('./OrchestratorWorker.ts', import.meta.url),
  { type: 'module' }
);

// Gérer les messages du worker
orchestratorWorker.on('message', (message) => {
  log.debug('Message de l\'orchestrateur:', message);
  
  // Relayer les événements importants au bus d'événements
  if (message.type === 'ORCHESTRATOR_READY') {
    eventBus.emit('ORCHESTRATOR_READY', message.payload);
  }
});

// Gérer les erreurs du worker
orchestratorWorker.on('error', (error) => {
  log.error('Erreur du worker orchestrateur:', error);
  eventBus.emit('ORCHESTRATOR_ERROR', { error: error.message });
});

// Gérer l'arrêt du worker
orchestratorWorker.on('exit', (code) => {
  log.info(`Worker orchestrateur arrêté avec le code ${code}`);
  eventBus.emit('ORCHESTRATOR_EXIT', { code });
});

log.info('Orchestrator worker démarré');