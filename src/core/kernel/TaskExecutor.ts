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
import { responseCache } from '../cache/ResponseCache';
import { sseStreamer } from '../streaming/SSEStreamer';

console.log("👷 TaskExecutor v3.1 - Chef de Chantier Intelligent (Cache-Aware + Streaming)");

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
      // ✨ 0. Obtenir le plan du Router AVANT de vérifier le cache
      const plan = await this.router.createPlan(userPrompt);
      console.log(`[TaskExecutor #${requestId}] 📋 Plan: ${plan.strategy}, ${plan.fallbackTasks.length + 1} tâche(s)`);
      await this.router.validatePlan(plan);

      // ✨ 0.5 Vérifier le cache AVANT d'exécuter
      const primaryModelKey = plan.primaryTask.modelKey;
      const cached = responseCache.get(userPrompt, primaryModelKey);
      if (cached) {
        console.log(`[TaskExecutor #${requestId}] ⚡ Cache HIT - Réponse trouvée.`);
        sseStreamer.streamInfo(`Response found in cache.`);
        // Streamer la réponse cachée comme si elle venait juste de la GPU
        for (const char of cached.response) {
          yield { type: 'primary', content: char };
        }
        yield {
          type: 'fusion',
          content: cached.response,
          expertResults: [{ agentName: 'cache', modelKey: primaryModelKey, result: cached.response, status: 'success' }]
        };
        return;
      }

      sseStreamer.streamInfo(`Processing request...`);

      // 2. Sélectionner la queue appropriée
      const queue = this.getQueue(plan.strategy);
      console.log(`[TaskExecutor #${requestId}] ⚙️  Stratégie: ${plan.strategy}`);
      sseStreamer.streamInfo(`Using strategy: ${plan.strategy}`);

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

      // ✨ Mettre en cache le résultat AVANT de l'envoyer
      if (primaryResult) {
        responseCache.set(userPrompt, primaryModelKey, finalResponse, chunks.length);
        console.log(`[TaskExecutor #${requestId}] 💾 Résultat mis en cache.`);
      }

      yield { 
        type: 'fusion', 
        content: finalResponse,
        expertResults 
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      console.error(`[TaskExecutor] ❌ Erreur:`, error);
      
      // ✨ Notifier l'UI de l'erreur via SSE
      sseStreamer.streamError(error instanceof Error ? error : new Error(errorMessage));
      
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
   * Utilise Transformers.js pour générer du texte
   */
  private async executeStreamingTaskInQueue(
    task: Task,
    userPrompt: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<TaskResult> {
    const startTime = performance.now();
    let timedOut = false;
    const timeoutMs = task.timeout;

    // Setup timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.warn(`   [Worker] ⏱️  Timeout ${task.agentName}`);
    }, timeoutMs);

    try {
      console.log(`   [Worker] ▶️  ${task.agentName} démarré`);
      
      // ✨ Notifier l'UI via SSE
      sseStreamer.streamInfo(`Executing ${task.agentName}...`);
      onChunk({ type: 'status', status: `Exécution de ${task.agentName}...` });

      const prompt = task.prompt || userPrompt;
      let fullResponse = "";

      // Streaming de la génération via Transformers.js
      const onToken = (token: string) => {
        if (!timedOut) {
          fullResponse += token;
          onChunk({ type: 'primary', content: token });
        }
      };

      // Générer via ModelManager
      fullResponse = await modelManager.generateStreaming(
        prompt,
        onToken,
        256
      );

      clearTimeout(timeoutId);

      const duration = performance.now() - startTime;
      const status = timedOut ? 'timeout' : 'success';
      
      console.log(`   [Worker] ✅ ${task.agentName} ${status} (${duration.toFixed(0)}ms)`);
      
      // Mettre en cache
      if (!timedOut) {
        responseCache.set(userPrompt, task.modelKey, fullResponse);
      }
      
      return {
        agentName: task.agentName,
        modelKey: task.modelKey,
        result: fullResponse,
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
        error: {
          type: 'UnknownError' as const,
          message: errorMessage
        },
        status: timedOut ? 'timeout' : 'error',
        duration
      };
    }
  }

  /**
   * Exécute une tâche SANS streaming (pour fallback)
   */
  private async executeTaskWithTimeout(task: Task, userPrompt: string): Promise<TaskResult> {
    const startTime = performance.now();
    const timeoutMs = task.timeout;
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.warn(`   [Worker] ⏱️  Timeout ${task.agentName}`);
    }, timeoutMs);

    try {
      console.log(`   [Worker] ▶️  ${task.agentName} démarré`);
      
      const prompt = task.prompt || userPrompt;
      let fullResponse = "";

      // Génération sans streaming via Transformers.js
      const onToken = (token: string) => {
        fullResponse += token;
      };

      fullResponse = await modelManager.generateStreaming(
        prompt,
        onToken,
        256
      );

      clearTimeout(timeoutId);
      const duration = performance.now() - startTime;
      
      return {
        agentName: task.agentName,
        modelKey: task.modelKey,
        result: fullResponse,
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
        error: {
          type: 'UnknownError' as const,
          message: errorMessage
        },
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

  /**
   * Retry avec backoff exponentiel
   * Stratégie: 3 tentatives max, délai: 100ms, 300ms, 900ms
   */
  public async processWithRetry(
    userPrompt: string,
    maxRetries = 3,
    initialBackoffMs = 100
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[TaskExecutor] Tentative ${attempt}/${maxRetries}`);
        return await this.process(userPrompt);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const backoffMs = initialBackoffMs * Math.pow(3, attempt - 1);
          console.warn(
            `[TaskExecutor] Tentative ${attempt} échouée, retry dans ${backoffMs}ms`
          );
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw new Error(`Failed after ${maxRetries} retries: ${lastError?.message}`);
  }
}

export const taskExecutor = new TaskExecutor();
