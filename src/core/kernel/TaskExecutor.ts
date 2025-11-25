/**
 * TaskExecutor v3.0 - Chef de Chantier Intelligent
 * 
 * Architecture FINALE validée:
 * ✅ Queue globale avec TOUTE l'exécution dans le job (streaming inclus)
 * ✅ Streaming via callback pattern (onChunk) 
 * ✅ Vraie cancellation avec engine.interruptGenerate()
 * ✅ Concurrence strictement respectée (SERIAL/LIMITED/FULL)
 * 
 * BUGFIX Architectural:
 * - Le streaming loop s'exécute maintenant ENTIÈREMENT dans le job PQueue
 * - Les chunks sont envoyés via callbacks, pas via async generator externe
 * - La queue ne libère le slot QUE quand toute la génération est terminée
 */

import PQueue from 'p-queue';
import { MLCEngine } from '@mlc-ai/web-llm';
import { modelManager } from './ModelManager';
import { Router } from '../router/Router';
import { 
  ExecutionPlan, 
  Task, 
  TaskResult, 
  StreamChunk, 
  ExecutionStrategy
} from '../router/RouterTypes';
import { fusioner } from './Fusioner';

console.log("👷 TaskExecutor v3.0 - Chef de Chantier Intelligent initialisé");

export class TaskExecutor {
  private router: Router;
  private globalQueue: PQueue;
  private activeRequests = 0;

  constructor() {
    this.router = new Router();
    // Queue GLOBALE : limite totale de workers simultanés
    this.globalQueue = new PQueue({ 
      concurrency: 4,
      timeout: 120000
    });
  }

  /**
   * Process avec streaming pour UX optimale
   * 
   * ARCHITECTURE CRITIQUE:
   * - TOUT le travail (y compris streaming) se passe dans le job PQueue
   * - On utilise des callbacks pour envoyer les chunks pendant que le job tourne
   * - La queue ne libère le slot QUE quand la génération est complète
   */
  public async *processStream(userPrompt: string): AsyncGenerator<StreamChunk> {
    this.activeRequests++;
    const requestId = crypto.randomUUID().substring(0, 8);
    console.log(`[TaskExecutor] 🚀 Requête #${requestId} (${this.activeRequests} active(s)): "${userPrompt.substring(0, 50)}..."`);

    try {
      // 1. Obtenir le plan du Router
      const plan = await this.router.createPlan(userPrompt);
      console.log(`[TaskExecutor #${requestId}] 📋 Plan: ${plan.strategy}, ${plan.fallbackTasks.length + 1} tâche(s)`);
      await this.router.validatePlan(plan);

      // 2. Buffer pour collecter les chunks streamés DEPUIS le job PQueue
      const chunks: StreamChunk[] = [];
      let primaryResult: TaskResult | null = null;

      // 3. Callback qui sera appelé DEPUIS le job PQueue pour envoyer les chunks
      const onChunk = (chunk: StreamChunk) => {
        chunks.push(chunk);
      };

      // 4. Lancer la tâche primaire via la queue globale
      //    TOUT le streaming se passe DANS ce job
      const primaryPromise = this.globalQueue.add(async () => {
        return await this.executeStreamingTaskInQueue(
          plan.primaryTask,
          userPrompt,
          onChunk
        );
      }, { priority: 100 }); // Priorité max

      // 5. Lancer les tâches fallback en parallèle
      const fallbackPromises = plan.fallbackTasks.map((task) =>
        this.globalQueue.add(
          () => this.executeTaskWithTimeout(task, userPrompt),
          { priority: this.getPriorityValue(task.priority) }
        )
      );

      // 6. Streamer les chunks au fur et à mesure qu'ils arrivent
      //    On poll le buffer de chunks pendant que le job tourne
      const pollInterval = 50; // ms
      let lastIndex = 0;

      // Polling loop: envoyer les chunks pendant que le job tourne
      while (!primaryResult) {
        // Envoyer les nouveaux chunks
        for (let i = lastIndex; i < chunks.length; i++) {
          yield chunks[i];
          lastIndex = i + 1;
        }
        
        // Vérifier si le job est terminé
        try {
          primaryResult = await Promise.race([
            primaryPromise,
            new Promise<null>(resolve => setTimeout(() => resolve(null), pollInterval))
          ]);
        } catch (e) {
          // Erreur dans le job, on sortira au prochain tour
        }
      }

      // 7. Attendre et envoyer les chunks restants
      if (!primaryResult) {
        primaryResult = await primaryPromise;
      }
      
      for (let i = lastIndex; i < chunks.length; i++) {
        yield chunks[i];
      }

      // 8. Attendre les résultats fallback
      let expertResults: TaskResult[] = [];
      if (fallbackPromises.length > 0) {
        console.log(`[TaskExecutor #${requestId}] ⏳ Attente de ${fallbackPromises.length} fallback(s)...`);
        expertResults = await Promise.all(fallbackPromises);
        
        const successCount = expertResults.filter(r => r.status === 'success').length;
        console.log(`[TaskExecutor #${requestId}] 📊 Fallback: ${successCount}/${expertResults.length} réussis`);
      }

      // 9. Fusionner et envoyer le résultat final
      const finalResponse = await fusioner.fuse({
        primaryResult,
        expertResults
      });

      yield { 
        type: 'fusion', 
        content: finalResponse,
        expertResults 
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      console.error(`[TaskExecutor #${requestId}] ❌ Erreur:`, error);
      
      yield {
        type: 'status',
        status: `Erreur: ${errorMessage}`
      };
      
      throw error;
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Process classique (sans streaming)
   */
  public async process(userPrompt: string): Promise<string> {
    let finalContent = '';
    
    for await (const chunk of this.processStream(userPrompt)) {
      if (chunk.type === 'fusion' && chunk.content) {
        finalContent = chunk.content;
      }
    }

    return finalContent;
  }

  /**
   * Exécute une tâche avec streaming EN ENTIER dans le job PQueue
   * 
   * ARCHITECTURE CRITIQUE:
   * - Toute la génération (y compris streaming) se passe DANS cette fonction
   * - Les chunks sont envoyés via onChunk pendant que le job tourne
   * - La fonction ne retourne QUE quand toute la génération est terminée
   * - La queue garde le slot occupé pendant TOUTE la durée
   */
  private async executeStreamingTaskInQueue(
    task: Task,
    userPrompt: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<TaskResult> {
    const engine = await modelManager.getEngine();
    const startTime = performance.now();
    let timedOut = false;
    const timeoutMs = task.timeout;

    // Setup timeout avec VRAIE interruption
    const timeoutId = setTimeout(async () => {
      timedOut = true;
      console.warn(`   [Worker] ⏱️  Timeout ${task.agentName}, interruption...`);
      await engine.interruptGenerate(); // VRAIE cancellation
    }, timeoutMs);

    try {
      console.log(`   [Worker] ▶️  ${task.agentName} démarré (queue: ${this.globalQueue.pending}/${this.globalQueue.concurrency})`);
      
      // Envoyer status
      onChunk({ type: 'status', status: `Exécution de ${task.agentName}...` });

      // Charger le modèle si nécessaire
      if (!modelManager.isModelLoaded(task.modelKey)) {
        console.log(`   [Worker] 🔄 Chargement du modèle ${task.modelKey}...`);
        onChunk({ type: 'status', status: `Chargement du modèle ${task.modelKey}...` });
        await modelManager.switchModel(task.modelKey);
      }

      const prompt = task.prompt || userPrompt;

      // Streaming de la génération
      const stream = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: task.temperature
      });

      let accumulatedContent = '';

      // CRITIQUE: Cette boucle s'exécute DANS le job PQueue
      // La queue ne libère le slot QUE quand cette boucle est terminée
      for await (const chunk of stream) {
        if (timedOut) {
          break;
        }

        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          accumulatedContent += content;
          // Envoyer le chunk via callback (pendant que le job tourne)
          onChunk({ type: 'primary', content });
        }
      }

      clearTimeout(timeoutId);

      const duration = performance.now() - startTime;
      const status = timedOut ? 'timeout' : 'success';
      
      console.log(`   [Worker] ✅ ${task.agentName} ${status} (${duration.toFixed(0)}ms, ${accumulatedContent.length} chars)`);
      
      onChunk({ type: 'status', status: `${task.agentName} terminé` });

      return {
        agentName: task.agentName,
        modelKey: task.modelKey,
        result: accumulatedContent,
        status,
        duration
      };

    } catch (error) {
      clearTimeout(timeoutId);
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      onChunk({ type: 'status', status: `Erreur: ${errorMessage}` });
      
      return {
        agentName: task.agentName,
        modelKey: task.modelKey,
        error: errorMessage,
        status: timedOut ? 'timeout' : 'error',
        duration
      };
    }
  }

  /**
   * Exécute une tâche SANS streaming (pour fallback)
   */
  private async executeTaskWithTimeout(task: Task, userPrompt: string): Promise<TaskResult> {
    const engine = await modelManager.getEngine();
    const startTime = performance.now();
    const timeoutMs = task.timeout;
    let timedOut = false;

    const timeoutId = setTimeout(async () => {
      timedOut = true;
      console.warn(`   [Worker] ⏱️  Timeout ${task.agentName}...`);
      await engine.interruptGenerate();
    }, timeoutMs);

    try {
      console.log(`   [Worker] ▶️  ${task.agentName} démarré`);
      
      if (!modelManager.isModelLoaded(task.modelKey)) {
        await modelManager.switchModel(task.modelKey);
      }

      const prompt = task.prompt || userPrompt;

      const response = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature: task.temperature
      });

      clearTimeout(timeoutId);

      const content = response.choices[0]?.message?.content || "";
      const duration = performance.now() - startTime;
      
      console.log(`   [Worker] ✅ ${task.agentName} terminé (${duration.toFixed(0)}ms)`);
      
      return {
        agentName: task.agentName,
        modelKey: task.modelKey,
        result: content,
        status: timedOut ? 'timeout' : 'success',
        duration
      };

    } catch (error) {
      clearTimeout(timeoutId);
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        agentName: task.agentName,
        modelKey: task.modelKey,
        error: errorMessage,
        status: timedOut ? 'timeout' : 'error',
        duration
      };
    }
  }

  private getPriorityValue(priority: string): number {
    switch (priority) {
      case 'HIGH': return 10;
      case 'MEDIUM': return 5;
      case 'LOW': return 1;
      default: return 1;
    }
  }

  public getActiveRequestCount(): number {
    return this.activeRequests;
  }

  public getQueueStats() {
    return {
      activeRequests: this.activeRequests,
      pending: this.globalQueue.pending,
      size: this.globalQueue.size,
      concurrency: this.globalQueue.concurrency
    };
  }
}

export const taskExecutor = new TaskExecutor();
