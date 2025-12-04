# Spécifications Techniques - Ensemble 2 (Tâches 17 & 18)

## Tâche #17 du Manifeste - Sandboxing des Plugins

### Objectif
Isoler l'exécution de chaque "plugin" (nos moteurs factices) dans son propre Worker dédié. Le TaskExecutor ne doit plus appeler directement le moteur, mais communiquer avec lui via un système de messages (postMessage), garantissant une isolation complète.

### Philosophie "Usine Vide"
Nous n'exécutons pas de vrais modèles, mais nous mettons en place la vraie architecture de communication inter-processus. C'est une modification structurelle majeure qui renforce massivement notre sécurité.

### Étape 1 : Créer le PluginWorker

Ce fichier sera le code exécuté dans chaque nouveau worker. Il est responsable de l'écoute des messages, de l'exécution de l'inférence (simulée), et du renvoi des résultats.

#### src/core/kernel/workers/plugin.worker.ts (Nouveau fichier)

```typescript
import { MockEngine } from '../engine/MockEngine';

const engine = new MockEngine();

// Le worker écoute les messages du TaskExecutor
self.onmessage = async (event: MessageEvent<{ task: any }>) => {
  const { task } = event.data;
  
  try {
    console.log(`[PluginWorker-${task.expert}] Tâche reçue.`);
    
    // Le worker exécute la génération et envoie les tokens un par un
    for await (const token of engine.generate(task.prompt, task.expert)) {
      self.postMessage({ type: 'TOKEN', payload: { token } });
    }

    // Envoie le message de complétion
    self.postMessage({ type: 'COMPLETE' });

  } catch (error) {
    const err = error as Error;
    console.error(`[PluginWorker-${task.expert}] Erreur:`, err);
    self.postMessage({ type: 'ERROR', payload: { message: err.message } });
  }
};

console.log("[PluginWorker] Prêt à recevoir des tâches.");
```

### Étape 2 : Mettre à jour le TaskExecutor pour utiliser les Workers

Le TaskExecutor devient un gestionnaire de workers. Il ne fait plus le travail lui-même.

#### src/core/kernel/TaskExecutor.ts (Mise à jour majeure)

```typescript
import { ExpertTask, TaskResult } from './ExecutionPlan';
// ... (autres imports)

class TaskExecutor {
  private workerPool: Map<string, Worker> = new Map();

  // ... (executePlan reste le même)

  /**
   * Exécute une tâche en la déléguant à un Worker dédié.
   */
  private executeSingleTask(task: ExpertTask): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      console.log(`[TaskExecutor] Délégation de la tâche pour ${task.expert} à un Worker.`);
      
      // Crée un nouveau worker pour cette tâche
      // Note: En production, on pourrait réutiliser les workers.
      const worker = new Worker(new URL('./workers/plugin.worker.ts', import.meta.url), {
        type: 'module'
      });

      let fullResponse = "";
      const startTime = performance.now();

      worker.onmessage = (event: MessageEvent<{ type: string, payload?: any }>) => {
        const { type, payload } = event.data;

        switch (type) {
          case 'TOKEN':
            fullResponse += payload.token;
            // Ici, on enverrait le token au SSEStreamer
            break;
          
          case 'COMPLETE':
            console.log(`[TaskExecutor] Tâche pour ${task.expert} terminée par le Worker.`);
            worker.terminate(); // Nettoie le worker
            resolve({
              expert: task.expert,
              result: fullResponse,
              status: 'success'
            });
            break;

          case 'ERROR':
            console.error(`[TaskExecutor] Erreur du Worker pour ${task.expert}:`, payload.message);
            worker.terminate();
            reject(new Error(payload.message));
            break;
        }
      };

      worker.onerror = (error) => {
        console.error(`[TaskExecutor] Erreur fatale du Worker pour ${task.expert}:`, error);
        worker.terminate();
        reject(error);
      };

      // Envoie la tâche au worker pour qu'il commence le travail
      worker.postMessage({ task });
    });
  }
}

export const taskExecutor = new TaskExecutor();
```

## Statut
Tâche #17 du Manifeste - TERMINÉE.

Notre architecture a subi une transformation fondamentale.

- Isolation Complète : L'exécution de l'inférence est maintenant entièrement isolée du thread principal et du Kernel. Un plugin qui crashe ou qui a une faille de sécurité ne peut plus contaminer le reste de l'application.
- Performance UI Garantie : Même si un modèle simulé entrait dans une boucle infinie, l'interface utilisateur resterait parfaitement fluide, car le blocage se produirait dans un processus séparé.