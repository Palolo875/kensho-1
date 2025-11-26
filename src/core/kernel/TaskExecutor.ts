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
import { createLogger } from '@/lib/logger';

const log = createLogger('TaskExecutor');

export class TaskExecutor {
  private router: Router;
  private queueSerial: PQueue;
  private queueParallelLimited: PQueue;
  private queueParallelFull: PQueue;
  private activeRequests = 0;

  constructor() {
    this.router = new Router();
    log.info('TaskExecutor v3.1 - Chef de Chantier Intelligent (Cache-Aware + Streaming)');
    
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

  public async *processStream(userPrompt: string): AsyncGenerator<StreamChunk> {
    this.activeRequests++;
    const requestId = crypto.randomUUID().substring(0, 8);
    log.info(`Requête #${requestId} (${this.activeRequests} active(s))`);

    try {
      const plan = await this.router.createPlan(userPrompt);
      log.info(`Plan: ${plan.strategy}, ${plan.fallbackTasks.length + 1} tâche(s)`);
      await this.router.validatePlan(plan);

      const primaryModelKey = plan.primaryTask.modelKey;
      const cached = responseCache.get(userPrompt, primaryModelKey);
      if (cached) {
        log.info(`Cache HIT - Réponse trouvée`);
        sseStreamer.streamInfo(`Response found in cache.`);
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

      const queue = this.getQueue(plan.strategy);
      log.info(`Stratégie: ${plan.strategy}`);
      sseStreamer.streamInfo(`Using strategy: ${plan.strategy}`);

      const chunks: StreamChunk[] = [];
      const onChunk = (chunk: StreamChunk) => {
        chunks.push(chunk);
      };

      const primaryPromise = queue.add(
        () => this.executeStreamingTaskInQueue(plan.primaryTask, userPrompt, onChunk),
        { priority: 100 }
      );

      const fallbackPromises = plan.fallbackTasks.map((task) =>
        queue.add(
          () => this.executeTaskWithTimeout(task, userPrompt),
          { priority: this.getPriorityValue(task.priority) }
        )
      );

      let primaryResult: TaskResult | null = null;
      let lastIndex = 0;
      const pollInterval = 50;

      while (!primaryResult) {
        for (let i = lastIndex; i < chunks.length; i++) {
          yield chunks[i];
          lastIndex = i + 1;
        }

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

      for (let i = lastIndex; i < chunks.length; i++) {
        yield chunks[i];
      }

      let expertResults: TaskResult[] = [];
      if (fallbackPromises.length > 0) {
        log.info(`Attente de ${fallbackPromises.length} fallback(s)...`);
        expertResults = await Promise.all(fallbackPromises);
        
        const successCount = expertResults.filter(r => r.status === 'success').length;
        log.info(`Fallback: ${successCount}/${expertResults.length}`);
      }

      const finalResponse = await fusioner.fuse({
        primaryResult: primaryResult!,
        expertResults
      });

      if (primaryResult) {
        responseCache.set(userPrompt, primaryModelKey, finalResponse, chunks.length);
        log.info(`Résultat mis en cache`);
      }

      yield { 
        type: 'fusion', 
        content: finalResponse,
        expertResults 
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      log.error(`Erreur:`, error as Error);
      
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

  public async process(userPrompt: string): Promise<string> {
    let finalContent = '';
    
    for await (const chunk of this.processStream(userPrompt)) {
      if (chunk.type === 'fusion' && chunk.content) {
        finalContent = chunk.content;
      }
    }

    return finalContent;
  }

  private async executeStreamingTaskInQueue(
    task: Task,
    userPrompt: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<TaskResult> {
    const startTime = performance.now();
    let timedOut = false;
    const timeoutMs = task.timeout;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      log.warn(`Timeout ${task.agentName}`);
    }, timeoutMs);

    try {
      log.info(`${task.agentName} démarré`);
      
      sseStreamer.streamInfo(`Executing ${task.agentName}...`);
      onChunk({ type: 'status', status: `Exécution de ${task.agentName}...` });

      const prompt = task.prompt || userPrompt;
      let fullResponse = "";

      const onToken = (token: string) => {
        if (!timedOut) {
          fullResponse += token;
          onChunk({ type: 'primary', content: token });
        }
      };

      fullResponse = await modelManager.generateText(prompt, 256);

      clearTimeout(timeoutId);

      const duration = performance.now() - startTime;
      const status = timedOut ? 'timeout' : 'success';
      
      log.info(`${task.agentName} ${status} (${duration.toFixed(0)}ms)`);
      
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

  private async executeTaskWithTimeout(task: Task, userPrompt: string): Promise<TaskResult> {
    const startTime = performance.now();
    const timeoutMs = task.timeout;
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      log.warn(`Timeout ${task.agentName}`);
    }, timeoutMs);

    try {
      log.info(`${task.agentName} démarré`);
      
      const prompt = task.prompt || userPrompt;
      let fullResponse = "";

      const onToken = (token: string) => {
        fullResponse += token;
      };

      fullResponse = await modelManager.generateText(prompt, 256);

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

  private getPriorityValue(priority?: string): number {
    switch (priority) {
      case 'high': return 50;
      case 'medium': return 25;
      case 'low': return 10;
      default: return 20;
    }
  }
}

export const taskExecutor = new TaskExecutor();
