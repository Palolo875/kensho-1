/**
 * TaskExecutor v3.0 - Chef de Chantier Intelligent
 * 
 * ARCHITECTURE MULTI-QUEUE (FINALE):
 * ✅ Queue séparée par stratégie (respect strict de concurrence)
 * ✅ Streaming entièrement dans le job PQueue
 * ✅ Vraie cancellation via engine.interruptGenerate()
 * ✅ Callback pattern pour envoyer les chunks en temps réel
 * 
 * Stratégies:
 * - SERIAL: 1 tâche à la fois
 * - PARALLEL_LIMITED: max 2 tâches simultanées  
 * - PARALLEL_FULL: max 4 tâches simultanées
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

console.log("👷 TaskExecutor v3.0 - Chef de Chantier Intelligent (Multi-Queue)");

export class TaskExecutor {
  private router: Router;
  private queueSerial: PQueue;
  private queueParallelLimited: PQueue;
  private queueParallelFull: PQueue;
  private activeRequests = 0;

  constructor() {
    this.router = new Router();
    
    // Queue pour SERIAL: 1 tâche à la fois
    this.queueSerial = new PQueue({ 
      concurrency: 1,
      timeout: 120000
    });
    
    // Queue pour PARALLEL_LIMITED: max 2 tâches
    this.queueParallelLimited = new PQueue({ 
      concurrency: 2,
      timeout: 120000
    });
    
    // Queue pour PARALLEL_FULL: max 4 tâches
    this.queueParallelFull = new PQueue({ 
      concurrency: 4,
      timeout: 120000
    });
  }

  /**
   * Obtient la queue appropriée selon la stratégie
   */
  private getQueue(strategy: ExecutionStrategy): PQueue {
    switch (strategy) {
      case 'SERIAL':
        return this.queueSerial;
      case 'PARALLEL_LIMITED':
        return this.queueParallelLimited;
      case 'PARALLEL_FULL':
        return this.queueParallelFull;
      default:
        return this.queueSerial;
    }
  }

  /**
   * Process avec streaming pour UX optimale
   */
  public async *processStream(userPrompt: string): AsyncGenerator<StreamChunk> {
    this.activeRequests++;
    const requestId = crypto.randomUUID().substring(0, 8);
    console.log(`[TaskExecutor] 🚀 Requête #${requestId} (${this.activeRequests} active(s))`);

    try {
      // 1. Obtenir le plan du Router
      const plan = await this.router.createPlan(userPrompt);
      console.log(`[TaskExecutor #${requestId}] 📋 Plan: ${plan.strategy}, ${plan.fallbackTasks.length + 1} tâche(s)`);
      await this.router.validatePlan(plan);

      // 2. Sélectionner la queue appropriée
      const queue = this.getQueue(plan.strategy);
      console.log(`[TaskExecutor #${requestId}] ⚙️  Stratégie: ${plan.strategy}`);

      // 3. Buffer pour les chunks streamés
      const chunks: StreamChunk[] = [];
      const onChunk = (chunk: StreamChunk) => {
        chunks.push(chunk);
      };

      // 4. Exécuter la tâche primaire via la queue (avec streaming)
      const primaryPromise = queue.add(
        () => this.executeStreamingTaskInQueue(plan.primaryTask, userPrompt, onChunk),
        { priority: 100 }
      );

      // 5. Exécuter les tâches fallback via la même queue
      const fallbackPromises = plan.fallbackTasks.map((task) =>
        queue.add(
          () => this.executeTaskWithTimeout(task, userPrompt),
          { priority: this.getPriorityValue(task.priority) }
        )
      );

      // 6. Polling: streamer les chunks pendant que les jobs tournent
      let primaryResult: TaskResult | null = null;
      let lastIndex = 0;
      const pollInterval = 50;

      while (!primaryResult) {
        // Envoyer les nouveaux chunks
        for (let i = lastIndex; i < chunks.length; i++) {
          yield chunks[i];
          lastIndex = i + 1;
        }

        // Vérifier si le job primaire est terminé (avec timeout)
        try {
          primaryResult = await Promise.race([
            primaryPromise,
            new Promise<null>(resolve => 
              setTimeout(() => resolve(null), pollInterval)
            )
          ]);
        } catch (e) {
          // Le job a échoué, on le saura au prochain tour
        }
      }

      // 7. Envoyer les chunks restants
      for (let i = lastIndex; i < chunks.length; i++) {
        yield chunks[i];
      }

      // 8. Attendre les tâches fallback
      let expertResults: TaskResult[] = [];
      if (fallbackPromises.length > 0) {
        console.log(`[TaskExecutor #${requestId}] ⏳ Attente de ${fallbackPromises.length} fallback(s)...`);
        expertResults = await Promise.all(fallbackPromises);
        
        const successCount = expertResults.filter(r => r.status === 'success').length;
        console.log(`[TaskExecutor #${requestId}] 📊 Fallback: ${successCount}/${expertResults.length}`);
      }

      // 9. Fusionner et envoyer le résultat final
      const finalResponse = await fusioner.fuse({
        primaryResult: primaryResult!,
        expertResults
      });

      yield { 
        type: 'fusion', 
        content: finalResponse,
        expertResults 
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      console.error(`[TaskExecutor] ❌ Erreur:`, error);
      
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
   * CRITIQUE: Toute la génération (y compris streaming) se passe DANS cette fonction
   * La queue ne libère le slot QUE quand la génération est complète
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
      await engine.interruptGenerate();
    }, timeoutMs);

    try {
      console.log(`   [Worker] ▶️  ${task.agentName} démarré`);
      
      onChunk({ type: 'status', status: `Exécution de ${task.agentName}...` });

      // Charger le modèle si nécessaire
      if (!modelManager.isModelLoaded(task.modelKey)) {
        console.log(`   [Worker] 🔄 Chargement du modèle ${task.modelKey}...`);
        onChunk({ type: 'status', status: `Chargement du modèle ${task.modelKey}...` });
        await modelManager.switchModel(task.modelKey);
      }

      const prompt = task.prompt || userPrompt;

      // Streaming de la génération (DANS le job PQueue)
      const stream = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: task.temperature
      });

      let accumulatedContent = '';

      // CRITIQUE: Cette boucle s'exécute ENTIÈREMENT dans le job
      for await (const chunk of stream) {
        if (timedOut) break;

        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          accumulatedContent += content;
          onChunk({ type: 'primary', content });
        }
      }

      clearTimeout(timeoutId);

      const duration = performance.now() - startTime;
      const status = timedOut ? 'timeout' : 'success';
      
      console.log(`   [Worker] ✅ ${task.agentName} ${status} (${duration.toFixed(0)}ms)`);
      
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
      serialQueue: { pending: this.queueSerial.pending, concurrency: this.queueSerial.concurrency },
      parallelLimitedQueue: { pending: this.queueParallelLimited.pending, concurrency: this.queueParallelLimited.concurrency },
      parallelFullQueue: { pending: this.queueParallelFull.pending, concurrency: this.queueParallelFull.concurrency }
    };
  }
}

export const taskExecutor = new TaskExecutor();
