/**
 * PluginWorker v1.0 - Sandbox d'Exécution Isolée
 *
 * ARCHITECTURE:
 * - Isolation totale dans un Web Worker dédié
 * - Communication asynchrone par postMessage
 * - Heartbeat automatique pour surveillance
 * - Health check par ping/pong
 * - Gestion des événements TOKEN, COMPLETE, ERROR
 */

import { MockEngine } from '../engine/MockEngine';

const engine = new MockEngine();

// Heartbeat automatique (keep-alive)
setInterval(() => {
  self.postMessage({ type: 'HEARTBEAT', timestamp: Date.now() });
}, 10000);

// Le worker écoute les messages du TaskExecutor
self.onmessage = async (event: MessageEvent<{ task: any, taskId: string }>) => {
  const { task, taskId } = event.data;
  
  try {
    console.log(`[PluginWorker-${task.expert}] Tâche reçue.`);
    
    // Le worker exécute la génération et envoie les tokens un par un
    for await (const token of engine.generate(task.prompt, task.expert)) {
      self.postMessage({ type: 'TOKEN', payload: { token }, taskId }); // ✅ Inclut l'ID
    }

    // Envoie le message de complétion
    self.postMessage({ type: 'COMPLETE', taskId });

  } catch (error) {
    const err = error as Error;
    console.error(`[PluginWorker-${task.expert}] Erreur:`, err);
    self.postMessage({ type: 'ERROR', payload: { message: err.message }, taskId });
  }
};

// Gestion du ping/pong pour health check
self.onmessage = function(event: MessageEvent) {
  if (event.data.type === 'PING') {
    self.postMessage({ type: 'PONG' });
    return;
  }
  // ... reste du code d'exécution
};

console.log("[PluginWorker] Prêt à recevoir des tâches.");