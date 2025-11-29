/**
 * TaskExecutor v4.0 - Chef de Chantier Intelligent
 *
 * ARCHITECTURE PRODUCTION:
 * ✅ Intégration complète avec RuntimeManager (pas ModelManager)
 * ✅ Queue séparée par stratégie (respect strict de concurrence)
 * ✅ Gestion d'erreurs robuste avec retry et timeout
 * ✅ Promise.allSettled pour résilience aux échecs individuels
 * ✅ Métriques détaillées et historique d'exécution
 * ✅ Support du streaming avec cancellation
 *
 * Stratégies:
 * - SERIAL: 1 tâche à la fois
 * - PARALLEL_LIMITED: max 2 tâches simultanées
 * - PARALLEL_FULL: max 4 tâches simultanées
 */

import PQueue from 'p-queue';
import { runtimeManager, type InferenceResult, type InferenceOptions } from './RuntimeManager';
import { Router, router } from '../router/Router';
import {
  ExecutionPlan,
  Task,
  TaskResult,
  StreamChunk,
  ExecutionStrategy,
  SystemErrorType,
} from '../router/RouterTypes';
import { fusioner } from './Fusioner';
import { responseCache } from '../cache/ResponseCache';
import { sseStreamer } from '../streaming/SSEStreamer';
import { createLogger } from '../../lib/logger';

const log = createLogger('TaskExecutor');

/**
 * Configuration du TaskExecutor
 */
export interface TaskExecutorConfig {
  maxRetries: number;
  retryDelayMs: number;
  defaultTimeoutMs: number;
  enableCache: boolean;
  enableStreaming: boolean;
  concurrencySerial: number;
  concurrencyLimited: number;
  concurrencyFull: number;
}

/**
 * Résultat détaillé d'une exécution de tâche
 */
export interface TaskExecutionResult {
  taskId: string;
  agentName: string;
  modelKey: string;
  result: string | null;
  error: SystemErrorType | null;
  status: 'success' | 'error' | 'timeout' | 'cancelled';
  duration: number;
  retries: number;
  tokensGenerated: number;
  startTime: number;
  endTime: number;
}

/**
 * Résultat complet d'un plan d'exécution
 */
export interface PlanExecutionResult {
  planId: string;
  strategy: ExecutionStrategy;
  primaryResult: TaskExecutionResult;
  fallbackResults: TaskExecutionResult[];
  fusedResponse: string;
  totalDuration: number;
  capacityScore: number;
  fromCache: boolean;
  success: boolean;
}

/**
 * Statistiques du TaskExecutor
 */
export interface ExecutorStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalRetries: number;
  averageExecutionTime: number;
  cacheHits: number;
  cacheMisses: number;
  tasksByStrategy: Record<ExecutionStrategy, number>;
  errorsByType: Record<string, number>;
}

/**
 * Enregistrement d'exécution pour l'historique
 */
interface ExecutionRecord {
  timestamp: number;
  planId: string;
  strategy: ExecutionStrategy;
  duration: number;
  success: boolean;
  tasksCount: number;
  retries: number;
  fromCache: boolean;
}

const DEFAULT_CONFIG: TaskExecutorConfig = {
  maxRetries: 2,
  retryDelayMs: 500,
  defaultTimeoutMs: 60000,
  enableCache: true,
  enableStreaming: true,
  concurrencySerial: 1,
  concurrencyLimited: 2,
  concurrencyFull: 4,
};

export class TaskExecutor {
  private routerInstance: Router;
  private queueSerial: PQueue;
  private queueParallelLimited: PQueue;
  private queueParallelFull: PQueue;
  private activeRequests: number = 0;
  private config: TaskExecutorConfig;

  // Statistiques et historique
  private executionHistory: ExecutionRecord[] = [];
  private readonly MAX_HISTORY_SIZE = 200;
  private stats: ExecutorStats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    totalRetries: 0,
    averageExecutionTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    tasksByStrategy: {
      SERIAL: 0,
      PARALLEL_LIMITED: 0,
      PARALLEL_FULL: 0,
    },
    errorsByType: {},
  };

  // Cancellation tokens
  private activeCancellationTokens: Map<string, AbortController> = new Map();

  constructor(config: Partial<TaskExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.routerInstance = router;

    log.info('TaskExecutor v4.0 - Chef de Chantier Intelligent (RuntimeManager + Retry + Metrics)');

    // Queue pour SERIAL: 1 tâche à la fois
    this.queueSerial = new PQueue({
      concurrency: this.config.concurrencySerial,
      timeout: this.config.defaultTimeoutMs,
      throwOnTimeout: true,
    });

    // Queue pour PARALLEL_LIMITED: max 2 tâches
    this.queueParallelLimited = new PQueue({
      concurrency: this.config.concurrencyLimited,
      timeout: this.config.defaultTimeoutMs,
      throwOnTimeout: true,
    });

    // Queue pour PARALLEL_FULL: max 4 tâches
    this.queueParallelFull = new PQueue({
      concurrency: this.config.concurrencyFull,
      timeout: this.config.defaultTimeoutMs,
      throwOnTimeout: true,
    });

    log.info('Queues initialisées:', {
      serial: this.config.concurrencySerial,
      limited: this.config.concurrencyLimited,
      full: this.config.concurrencyFull,
    });
  }

  /**
   * Configure le TaskExecutor
   */
  public setConfig(config: Partial<TaskExecutorConfig>): void {
    this.config = { ...this.config, ...config };

    // Mettre à jour les queues si la concurrence change
    if (config.concurrencySerial !== undefined) {
      this.queueSerial.concurrency = config.concurrencySerial;
    }
    if (config.concurrencyLimited !== undefined) {
      this.queueParallelLimited.concurrency = config.concurrencyLimited;
    }
    if (config.concurrencyFull !== undefined) {
      this.queueParallelFull.concurrency = config.concurrencyFull;
    }

    log.info('Configuration mise à jour:', this.config);
  }

  /**
   * Sélectionne la queue appropriée selon la stratégie
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
        log.warn(`Stratégie inconnue: ${strategy}, utilisation de SERIAL`);
        return this.queueSerial;
    }
  }

  /**
   * Génère un ID unique pour une tâche
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Génère un ID unique pour un plan
   */
  private generatePlanId(): string {
    return `plan-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Exécute une tâche avec retry et gestion d'erreurs
   */
  private async executeTaskWithRetry(
    task: Task,
    userPrompt: string,
    options: {
      onChunk?: (chunk: StreamChunk) => void;
      signal?: AbortSignal;
      streaming?: boolean;
    } = {}
  ): Promise<TaskExecutionResult> {
    const taskId = this.generateTaskId();
    const startTime = performance.now();
    let retries = 0;
    let lastError: Error | null = null;

    const prompt = task.prompt || userPrompt;
    const inferenceOptions: InferenceOptions = {
      maxTokens: 256,
      temperature: task.temperature,
    };

    while (retries <= this.config.maxRetries) {
      try {
        // Vérifier l'annulation
        if (options.signal?.aborted) {
          return this.createTaskResult(taskId, task, startTime, {
            status: 'cancelled',
            retries,
          });
        }

        log.info(`${task.agentName} démarré (tentative ${retries + 1}/${this.config.maxRetries + 1})`);

        // Vérifier que le runtime est prêt
        if (!runtimeManager.isReady()) {
          throw new Error('RuntimeManager non initialisé');
        }

        let result: InferenceResult;

        if (options.streaming && options.onChunk) {
          // Mode streaming
          options.onChunk({ type: 'status', status: `Exécution de ${task.agentName}...` });

          let fullResponse = '';
          result = await runtimeManager.generateStream(
            prompt,
            (chunk: string) => {
              fullResponse += chunk;
              options.onChunk?.({ type: 'primary', content: chunk });
            },
            inferenceOptions
          );
        } else {
          // Mode non-streaming
          result = await runtimeManager.generate(prompt, inferenceOptions);
        }

        const endTime = performance.now();
        const duration = endTime - startTime;

        log.info(`${task.agentName} succès (${duration.toFixed(0)}ms, ${result.tokensGenerated} tokens)`);

        return {
          taskId,
          agentName: task.agentName,
          modelKey: task.modelKey,
          result: result.text,
          error: null,
          status: 'success',
          duration,
          retries,
          tokensGenerated: result.tokensGenerated,
          startTime,
          endTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retries++;
        this.stats.totalRetries++;

        if (retries <= this.config.maxRetries) {
          log.warn(
            `${task.agentName} échec (tentative ${retries}/${this.config.maxRetries + 1}): ${lastError.message}`
          );

          // Délai avant retry avec backoff
          const delay = this.config.retryDelayMs * Math.pow(2, retries - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Toutes les tentatives ont échoué
    const endTime = performance.now();
    log.error(`${task.agentName} échec définitif après ${retries} tentatives`);

    this.recordError(lastError?.message || 'UnknownError');

    return this.createTaskResult(taskId, task, startTime, {
      status: 'error',
      retries,
      error: {
        type: 'UnknownError',
        message: lastError?.message || 'Erreur inconnue après plusieurs tentatives',
      },
    });
  }

  /**
   * Crée un résultat de tâche
   */
  private createTaskResult(
    taskId: string,
    task: Task,
    startTime: number,
    overrides: Partial<TaskExecutionResult>
  ): TaskExecutionResult {
    const endTime = performance.now();
    return {
      taskId,
      agentName: task.agentName,
      modelKey: task.modelKey,
      result: null,
      error: null,
      status: 'error',
      duration: endTime - startTime,
      retries: 0,
      tokensGenerated: 0,
      startTime,
      endTime,
      ...overrides,
    };
  }

  /**
   * Enregistre une erreur dans les statistiques
   */
  private recordError(errorType: string): void {
    const key = errorType.substring(0, 50); // Limiter la clé
    this.stats.errorsByType[key] = (this.stats.errorsByType[key] || 0) + 1;
  }

  /**
   * Exécute un plan complet avec streaming
   */
  public async *processStream(userPrompt: string): AsyncGenerator<StreamChunk> {
    const planId = this.generatePlanId();
    const startTime = performance.now();
    this.activeRequests++;

    log.info(`Requête #${planId} (${this.activeRequests} active(s))`);

    // Créer un token d'annulation
    const abortController = new AbortController();
    this.activeCancellationTokens.set(planId, abortController);

    try {
      // 1. Créer le plan
      const plan = await this.routerInstance.createPlan(userPrompt);
      log.info(`Plan: ${plan.strategy}, ${plan.fallbackTasks.length + 1} tâche(s)`);

      this.stats.tasksByStrategy[plan.strategy]++;

      // 2. Vérifier le cache
      if (this.config.enableCache) {
        const cached = responseCache.get(userPrompt, plan.primaryTask.modelKey);
        if (cached) {
          this.stats.cacheHits++;
          log.info('Cache HIT - Réponse trouvée');
          sseStreamer.streamInfo('Response found in cache.');

          // Streamer la réponse en cache
          for (const char of cached.response) {
            yield { type: 'primary', content: char };
          }

          yield {
            type: 'fusion',
            content: cached.response,
            expertResults: [
              {
                agentName: 'cache',
                modelKey: plan.primaryTask.modelKey,
                result: cached.response,
                status: 'success',
              },
            ],
          };

          this.recordExecution(planId, plan.strategy, performance.now() - startTime, true, 1, 0, true);
          return;
        }
        this.stats.cacheMisses++;
      }

      sseStreamer.streamInfo('Processing request...');

      // 3. Obtenir la queue appropriée
      const queue = this.getQueue(plan.strategy);
      log.info(`Stratégie: ${plan.strategy}`);
      sseStreamer.streamInfo(`Using strategy: ${plan.strategy}`);

      // 4. Collecter les chunks
      const chunks: StreamChunk[] = [];
      const onChunk = (chunk: StreamChunk) => {
        chunks.push(chunk);
      };

      // 5. Exécuter la tâche principale avec streaming
      const primaryPromise = queue.add(
        () =>
          this.executeTaskWithRetry(plan.primaryTask, userPrompt, {
            onChunk,
            signal: abortController.signal,
            streaming: this.config.enableStreaming,
          }),
        { priority: 100 }
      );

      // 6. Exécuter les tâches fallback (sans streaming)
      const fallbackPromises = plan.fallbackTasks.map((task) =>
        queue.add(
          () =>
            this.executeTaskWithRetry(task, userPrompt, {
              signal: abortController.signal,
              streaming: false,
            }),
          { priority: this.getPriorityValue(task.priority) }
        )
      );

      // 7. Polling pour le streaming des chunks
      let primaryResult: TaskExecutionResult | null = null;
      let lastIndex = 0;
      const pollInterval = 50;

      while (!primaryResult) {
        // Yield les nouveaux chunks
        for (let i = lastIndex; i < chunks.length; i++) {
          yield chunks[i];
          lastIndex = i + 1;
        }

        try {
          primaryResult = await Promise.race([
            primaryPromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), pollInterval)),
          ]);
        } catch (error) {
          log.error('Erreur dans la tâche principale:', error as Error);
          primaryResult = this.createTaskResult(this.generateTaskId(), plan.primaryTask, startTime, {
            status: 'error',
            error: {
              type: 'UnknownError',
              message: error instanceof Error ? error.message : 'Erreur inconnue',
            },
          });
        }
      }

      // Yield les chunks restants
      for (let i = lastIndex; i < chunks.length; i++) {
        yield chunks[i];
      }

      // 8. Attendre les fallbacks avec Promise.allSettled
      let fallbackResults: TaskExecutionResult[] = [];
      if (fallbackPromises.length > 0) {
        log.info(`Attente de ${fallbackPromises.length} fallback(s)...`);

        const settledResults = await Promise.allSettled(fallbackPromises);

        fallbackResults = settledResults.map((settled, index) => {
          if (settled.status === 'fulfilled') {
            return settled.value;
          } else {
            const task = plan.fallbackTasks[index];
            return this.createTaskResult(this.generateTaskId(), task, startTime, {
              status: 'error',
              error: {
                type: 'UnknownError',
                message: settled.reason?.message || 'Erreur inconnue',
              },
            });
          }
        });

        const successCount = fallbackResults.filter((r) => r.status === 'success').length;
        log.info(`Fallback: ${successCount}/${fallbackResults.length} succès`);
      }

      // 9. Fusion des résultats
      const taskResultsForFusion: TaskResult[] = [
        this.convertToTaskResult(primaryResult),
        ...fallbackResults.map((r) => this.convertToTaskResult(r)),
      ];

      const finalResponse = await fusioner.fuse({
        primaryResult: taskResultsForFusion[0],
        expertResults: taskResultsForFusion.slice(1),
      });

      // 10. Mettre en cache
      if (this.config.enableCache && primaryResult.status === 'success') {
        responseCache.set(userPrompt, plan.primaryTask.modelKey, finalResponse, primaryResult.tokensGenerated);
        log.info('Résultat mis en cache');
      }

      // 11. Enregistrer l'exécution
      const totalDuration = performance.now() - startTime;
      const totalRetries = primaryResult.retries + fallbackResults.reduce((sum, r) => sum + r.retries, 0);
      const success = primaryResult.status === 'success';

      this.recordExecution(
        planId,
        plan.strategy,
        totalDuration,
        success,
        1 + fallbackResults.length,
        totalRetries,
        false
      );

      if (success) {
        this.stats.successfulExecutions++;
      } else {
        this.stats.failedExecutions++;
      }
      this.stats.totalExecutions++;

      // 12. Yield le résultat final
      yield {
        type: 'fusion',
        content: finalResponse,
        expertResults: taskResultsForFusion,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      log.error('Erreur:', error as Error);

      this.stats.failedExecutions++;
      this.stats.totalExecutions++;
      this.recordError(errorMessage);

      sseStreamer.streamError(error instanceof Error ? error : new Error(errorMessage));

      yield {
        type: 'status',
        status: `Erreur: ${errorMessage}`,
      };

      throw error;
    } finally {
      this.activeRequests--;
      this.activeCancellationTokens.delete(planId);
    }
  }

  /**
   * Convertit TaskExecutionResult en TaskResult pour le fusioner
   */
  private convertToTaskResult(execResult: TaskExecutionResult): TaskResult {
    return {
      agentName: execResult.agentName,
      modelKey: execResult.modelKey,
      result: execResult.result || undefined,
      error: execResult.error || undefined,
      status: execResult.status === 'cancelled' ? 'error' : execResult.status,
      duration: execResult.duration,
    };
  }

  /**
   * Exécute un plan et retourne le résultat final (non-streaming)
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
   * Exécute un plan et retourne un résultat détaillé
   */
  public async executePlan(plan: ExecutionPlan, userPrompt: string): Promise<PlanExecutionResult> {
    const planId = this.generatePlanId();
    const startTime = performance.now();

    log.info(`Exécution directe du plan ${planId}`);

    // Vérifier le cache
    if (this.config.enableCache) {
      const cached = responseCache.get(userPrompt, plan.primaryTask.modelKey);
      if (cached) {
        this.stats.cacheHits++;
        return {
          planId,
          strategy: plan.strategy,
          primaryResult: this.createTaskResult(this.generateTaskId(), plan.primaryTask, startTime, {
            status: 'success',
            result: cached.response,
          }),
          fallbackResults: [],
          fusedResponse: cached.response,
          totalDuration: performance.now() - startTime,
          capacityScore: plan.capacityScore,
          fromCache: true,
          success: true,
        };
      }
      this.stats.cacheMisses++;
    }

    const queue = this.getQueue(plan.strategy);

    // Exécuter toutes les tâches
    const allTasks = [plan.primaryTask, ...plan.fallbackTasks];
    const taskPromises = allTasks.map((task, index) =>
      queue.add(() => this.executeTaskWithRetry(task, userPrompt), {
        priority: index === 0 ? 100 : this.getPriorityValue(task.priority),
      })
    );

    // Attendre tous les résultats avec allSettled
    const settledResults = await Promise.allSettled(taskPromises);

    const results: TaskExecutionResult[] = settledResults.map((settled, index) => {
      if (settled.status === 'fulfilled') {
        return settled.value;
      } else {
        const task = allTasks[index];
        return this.createTaskResult(this.generateTaskId(), task, startTime, {
          status: 'error',
          error: {
            type: 'UnknownError',
            message: settled.reason?.message || 'Erreur inconnue',
          },
        });
      }
    });

    const primaryResult = results[0];
    const fallbackResults = results.slice(1);

    // Fusion
    const taskResultsForFusion = results.map((r) => this.convertToTaskResult(r));
    const fusedResponse = await fusioner.fuse({
      primaryResult: taskResultsForFusion[0],
      expertResults: taskResultsForFusion.slice(1),
    });

    // Cache
    if (this.config.enableCache && primaryResult.status === 'success') {
      responseCache.set(userPrompt, plan.primaryTask.modelKey, fusedResponse, primaryResult.tokensGenerated);
    }

    const totalDuration = performance.now() - startTime;
    const success = primaryResult.status === 'success';

    this.stats.totalExecutions++;
    if (success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }
    this.stats.tasksByStrategy[plan.strategy]++;

    return {
      planId,
      strategy: plan.strategy,
      primaryResult,
      fallbackResults,
      fusedResponse,
      totalDuration,
      capacityScore: plan.capacityScore,
      fromCache: false,
      success,
    };
  }

  /**
   * Annule une requête en cours
   */
  public cancelRequest(planId: string): boolean {
    const controller = this.activeCancellationTokens.get(planId);
    if (controller) {
      controller.abort();
      this.activeCancellationTokens.delete(planId);
      log.info(`Requête ${planId} annulée`);
      return true;
    }
    return false;
  }

  /**
   * Annule toutes les requêtes en cours
   */
  public cancelAllRequests(): number {
    let cancelled = 0;
    for (const [planId, controller] of this.activeCancellationTokens.entries()) {
      controller.abort();
      this.activeCancellationTokens.delete(planId);
      cancelled++;
    }
    log.info(`${cancelled} requête(s) annulée(s)`);
    return cancelled;
  }

  /**
   * Convertit la priorité de tâche en valeur numérique
   */
  private getPriorityValue(priority?: string): number {
    switch (priority) {
      case 'HIGH':
        return 50;
      case 'MEDIUM':
        return 25;
      case 'LOW':
        return 10;
      default:
        return 20;
    }
  }

  /**
   * Enregistre une exécution dans l'historique
   */
  private recordExecution(
    planId: string,
    strategy: ExecutionStrategy,
    duration: number,
    success: boolean,
    tasksCount: number,
    retries: number,
    fromCache: boolean
  ): void {
    const record: ExecutionRecord = {
      timestamp: Date.now(),
      planId,
      strategy,
      duration,
      success,
      tasksCount,
      retries,
      fromCache,
    };

    this.executionHistory.push(record);

    // Limiter la taille de l'historique
    if (this.executionHistory.length > this.MAX_HISTORY_SIZE) {
      this.executionHistory = this.executionHistory.slice(-this.MAX_HISTORY_SIZE);
    }

    // Recalculer le temps moyen d'exécution
    const totalTime = this.executionHistory.reduce((sum, r) => sum + r.duration, 0);
    this.stats.averageExecutionTime = totalTime / this.executionHistory.length;
  }

  /**
   * Obtient les statistiques du TaskExecutor
   */
  public getStats(): ExecutorStats {
    return { ...this.stats };
  }

  /**
   * Obtient l'historique des exécutions
   */
  public getExecutionHistory(limit: number = 50): ExecutionRecord[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Obtient le nombre de requêtes actives
   */
  public getActiveRequestsCount(): number {
    return this.activeRequests;
  }

  /**
   * Obtient l'état des queues
   */
  public getQueueStatus(): {
    serial: { pending: number; size: number };
    limited: { pending: number; size: number };
    full: { pending: number; size: number };
  } {
    return {
      serial: { pending: this.queueSerial.pending, size: this.queueSerial.size },
      limited: { pending: this.queueParallelLimited.pending, size: this.queueParallelLimited.size },
      full: { pending: this.queueParallelFull.pending, size: this.queueParallelFull.size },
    };
  }

  /**
   * Réinitialise les statistiques
   */
  public resetStats(): void {
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalRetries: 0,
      averageExecutionTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      tasksByStrategy: {
        SERIAL: 0,
        PARALLEL_LIMITED: 0,
        PARALLEL_FULL: 0,
      },
      errorsByType: {},
    };
    this.executionHistory = [];
    log.info('Statistiques réinitialisées');
  }

  /**
   * Vide les queues
   */
  public clearQueues(): void {
    this.queueSerial.clear();
    this.queueParallelLimited.clear();
    this.queueParallelFull.clear();
    log.info('Queues vidées');
  }

  /**
   * Pause toutes les queues
   */
  public pauseQueues(): void {
    this.queueSerial.pause();
    this.queueParallelLimited.pause();
    this.queueParallelFull.pause();
    log.info('Queues en pause');
  }

  /**
   * Reprend toutes les queues
   */
  public resumeQueues(): void {
    this.queueSerial.start();
    this.queueParallelLimited.start();
    this.queueParallelFull.start();
    log.info('Queues reprises');
  }
}

// Export singleton
export const taskExecutor = new TaskExecutor();
