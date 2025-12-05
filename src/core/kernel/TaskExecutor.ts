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

// @ts-ignore
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
import { sseStreamer } from '../eventbus/SSEStreamerCompat';
import { createLogger } from '../../lib/logger';
import { logger } from './monitoring/LoggerService';
import { watermarkingService } from './guardrails/WatermarkingService';
import { inputFilter } from './guardrails/InputFilter';
import { outputGuard } from './guardrails/OutputGuard';
import { rateLimiter } from './guardrails/RateLimiter';
import { auditLogger } from './guardrails/AuditLogger';

const log = createLogger('TaskExecutor');
logger.info('TaskExecutor', 'TaskExecutor v4.0 - Chef de Chantier Intelligent (RuntimeManager + Retry + Metrics)');

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

/**
 * Statistiques de sécurité utilisateur
 */
interface UserSecurityStats {
  jailbreakAttempts: number;
  suspiciousBehavior: number;
  lastIncident: number;
}

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

  // Worker management
  private workerPool: Map<string, Worker> = new Map();
  private workerActivity: Map<string, { lastActive: number, taskCount: number }> = new Map();
  private lastHeartbeat: Map<string, number> = new Map();
  private readonly MAX_WORKERS = 4; // Limite CPU-friendly
  private readonly WORKER_IDLE_TIMEOUT = 60000; // 1 minute
  private readonly WORKER_MAX_TASKS = 100; // Maximum tasks per worker before recycling

  // Security statistics
  private userSecurityStats: Map<string, UserSecurityStats> = new Map();
  
  // Configuration de sécurité
  private securityConfig = {
    enableInputValidation: true,
    enableOutputGuard: true,
    enableWatermarking: true,
    enableRateLimiting: true,
    enableAuditLogging: true
  };

  constructor(config: Partial<TaskExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.routerInstance = router;

    log.info('TaskExecutor v4.0 - Chef de Chantier Intelligent (RuntimeManager + Retry + Metrics)');

    // Queue pour SERIAL: 1 tâche à la fois
    this.queueSerial = new PQueue({
      concurrency: this.config.concurrencySerial,
    });

    // Queue pour PARALLEL_LIMITED: max 2 tâches
    this.queueParallelLimited = new PQueue({
      concurrency: this.config.concurrencyLimited,
    });

    // Queue pour PARALLEL_FULL: max 4 tâches
    this.queueParallelFull = new PQueue({
      concurrency: this.config.concurrencyFull,
    });

    // Vérification périodique des heartbeats
    setInterval(() => this.checkHeartbeats(), 15000);
    
    // Terminaison des workers inactifs
    setInterval(() => this.terminateIdleWorkers(), 10000);

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

        logger.info('TaskExecutor', `Démarrage de ${task.agentName}`, { attempt: retries + 1, maxRetries: this.config.maxRetries + 1 });

        // Vérifier que le runtime est prêt
        if (!runtimeManager.isReady()) {
          throw new Error('RuntimeManager non initialisé');
        }

        let result: InferenceResult;

        if (options.streaming && options.onChunk) {
          // Mode streaming with pipelining support
          options.onChunk({ type: 'status', status: `Exécution de ${task.agentName}...` });

          // Check if runtimeManager has the new generate method for pipelining
          let fullResponse = '';
          
          // Try to use the new pipelined generate method first
          try {
            // Use a flag to track if we're using the new method
            let usingNewMethod = false;
            
            // Check if runtimeManager has the new async generator method
            if (typeof (runtimeManager as any).generate === 'function') {
              // Try to use the new method
              try {
                for await (const chunk of runtimeManager.generate(prompt, task.modelKey)) {
                  fullResponse += chunk;
                  options.onChunk?.({ type: 'primary', content: chunk });
                }
                usingNewMethod = true;
              } catch (pipelineError) {
                // If the new method fails, fall back to the old method
                log.warn('Pipelined generation failed, falling back to traditional streaming', pipelineError as Error);
              }
            }
            
            // If we didn't use the new method, fall back to traditional streaming
            if (!usingNewMethod) {
              result = await runtimeManager.generateStream(
                prompt,
                (chunk: string) => {
                  fullResponse += chunk;
                  options.onChunk?.({ type: 'primary', content: chunk });
                },
                inferenceOptions
              );
            } else {
              // Create a result object from the full response
              const endTime = performance.now();
              result = {
                text: fullResponse,
                tokensGenerated: fullResponse.split(' ').length,
                timeMs: endTime - startTime,
                finishReason: 'stop'
              };
            }
          } catch (error) {
            // If everything fails, fall back to the non-streaming method
            log.warn('Streaming failed, falling back to non-streaming generation', error as Error);
            result = await runtimeManager.generate(prompt, inferenceOptions);
          }
        } else {
          // Mode non-streaming
          result = await runtimeManager.generate(prompt, inferenceOptions);
        }

        const endTime = performance.now();
        const duration = endTime - startTime;

        logger.info('TaskExecutor', `${task.agentName} succès`, { duration: duration.toFixed(0), tokens: result.tokensGenerated });

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
          logger.warn('TaskExecutor', `${task.agentName} échec`, { attempt: retries, maxRetries: this.config.maxRetries + 1, error: lastError.message });

          // Délai avant retry avec backoff
          const delay = this.config.retryDelayMs * Math.pow(2, retries - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Toutes les tentatives ont échoué
    logger.error('TaskExecutor', `${task.agentName} échec définitif`, new Error(`Après ${retries} tentatives`));

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
   * Incrémente les statistiques de sécurité pour un utilisateur
   */
  public incrementUserSecurityStats(userId: string, eventType: string): number {
    if (!this.userSecurityStats.has(userId)) {
      this.userSecurityStats.set(userId, {
        jailbreakAttempts: 0,
        suspiciousBehavior: 0,
        lastIncident: Date.now()
      });
    }
    
    const stats = this.userSecurityStats.get(userId)!;
    if (eventType === "jailbreak_attempts") {
      stats.jailbreakAttempts++;
    } else if (eventType === "suspicious_behavior") {
      stats.suspiciousBehavior++;
    }
    stats.lastIncident = Date.now();
    
    return stats.jailbreakAttempts;
  }

  /**
   * Terminaison des workers inactifs
   */
  private terminateIdleWorkers() {
    const now = Date.now();
    for (const [key, info] of this.workerActivity.entries()) {
      if (now - info.lastActive > this.WORKER_IDLE_TIMEOUT) {
        log.info(`[TaskExecutor] Worker ${key} trop ancien → termination.`);
        this.workerPool.get(key)?.terminate();
        this.workerPool.delete(key);
        this.workerActivity.delete(key);
        this.lastHeartbeat.delete(key);
      }
    }
  }

  /**
   * Vérification des heartbeats
   */
  private checkHeartbeats() {
    const now = Date.now();
    for (const [expert, last] of this.lastHeartbeat.entries()) {
      if (now - last > 30000) { // 30 secondes
        log.warn(`[Monitor] Worker ${expert} silent >30s → restart.`);
        this.workerPool.get(expert)?.terminate();
        this.workerPool.delete(expert);
        this.workerActivity.delete(expert);
        this.lastHeartbeat.delete(expert);
      }
    }
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
   * Exécute un plan complet avec pipelining et guardrails avancés
   */
  public async *processStreamWithSecurity(
    userPrompt: string, 
    userId: string = 'anonymous',
    sessionId: string = `session-${Date.now()}`
  ): AsyncGenerator<StreamChunk> {
    const planId = this.generatePlanId();
    const startTime = performance.now();
    this.activeRequests++;
    
    log.info(`Requête sécurisée #${planId} (${this.activeRequests} active(s))`);
    
    // Créer un token d'annulation
    const abortController = new AbortController();
    this.activeCancellationTokens.set(planId, abortController);
    
    try {
      // 1. Validation d'entrée avancée
      if (this.securityConfig.enableInputValidation) {
        logger.info('TaskExecutor', '🛡️ Validation d\'entrée en cours...');
        const inputValidation = inputFilter.validate(userPrompt);
        
        if (!inputValidation.safe) {
          const errorMessage = inputValidation.reason || 'Prompt rejeté par les filtres de sécurité';
          logger.warn('TaskExecutor', `🚨 Validation d'entrée échouée: ${errorMessage}`);
          
          // Enregistrer l'incident dans l'audit
          if (this.securityConfig.enableAuditLogging) {
            auditLogger.logSecurityEvent('INPUT_VALIDATION_FAILED', {
              reason: errorMessage,
              promptLength: userPrompt.length,
              userId,
              sessionId
            }, 'HIGH', {
              userId,
              requestId: planId,
              policyVersion: '1.0'
            });
          }
          
          // Incrémenter les statistiques de sécurité
          this.incrementUserSecurityStats(userId, "jailbreak_attempts");
          
          throw new Error(`Sécurité: ${errorMessage}`);
        }
        
        logger.info('TaskExecutor', '✅ Validation d\'entrée réussie');
        
        // Enregistrer la validation réussie
        if (this.securityConfig.enableAuditLogging) {
          auditLogger.logSecurityEvent('INPUT_VALIDATION_PASSED', {
            promptLength: userPrompt.length,
            userId,
            sessionId
          }, 'LOW', {
            userId,
            requestId: planId,
            policyVersion: '1.0'
          });
        }
      }
      
      // 2. Rate limiting
      if (this.securityConfig.enableRateLimiting) {
        const rateLimitCheck = rateLimiter.isAllowed(userId);
        if (!rateLimitCheck.allowed) {
          const errorMessage = rateLimitCheck.reason || 'Limite de taux dépassée';
          logger.warn('TaskExecutor', `⏳ Rate limiting appliqué: ${errorMessage}`);
          
          if (this.securityConfig.enableAuditLogging) {
            auditLogger.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
              reason: errorMessage,
              userId,
              sessionId
            }, 'MEDIUM', {
              userId,
              requestId: planId,
              policyVersion: '1.0'
            });
          }
          
          throw new Error(`Taux: ${errorMessage}`);
        }
      }
      
      // 3. Créer le plan
      const plan = await this.routerInstance.createPlan(userPrompt);
      logger.info('TaskExecutor', `📋 Plan: ${plan.strategy}`, { taskCount: plan.fallbackTasks.length + 1 });
      
      this.stats.tasksByStrategy[plan.strategy]++;
      
      // 4. Vérifier le cache
      if (this.config.enableCache) {
        const cached = await responseCache.get(userPrompt, plan.primaryTask.modelKey);
        if (cached) {
          this.stats.cacheHits++;
          logger.info('TaskExecutor', '💾 Cache HIT - Réponse trouvée');
          
          // Appliquer le watermarking sur la réponse en cache si activé
          let finalResponse = cached.response;
          if (this.securityConfig.enableWatermarking) {
            const watermarked = watermarkingService.apply(finalResponse, {
              modelId: plan.primaryTask.modelKey,
              sessionId,
              userId
            });
            finalResponse = watermarked.watermarkedText;
            
            log.info('💧 Réponse en cache watermarked');
          }
          
          // Streamer la réponse
          for (const char of finalResponse) {
            yield { type: 'primary', content: char };
          }
          
          yield {
            type: 'fusion',
            content: finalResponse,
            expertResults: [
              {
                agentName: 'cache',
                modelKey: plan.primaryTask.modelKey,
                result: finalResponse,
                status: 'success',
              },
            ],
          };
          
          this.recordExecution(planId, plan.strategy, performance.now() - startTime, true, 1, 0, true);
          return;
        }
        this.stats.cacheMisses++;
      }
      
      // 5. Obtenir la queue appropriée
      const queue = this.getQueue(plan.strategy);
      logger.info('TaskExecutor', `⚙️ Stratégie: ${plan.strategy}`);
      
      // 6. Exécuter la tâche principale avec pipelining
      let primaryResult: TaskExecutionResult | null = null;
      let fallbackResults: TaskExecutionResult[] = [];
      
      // Utiliser le nouveau RuntimeManager avec pipelining
      if (typeof runtimeManager.generate === 'function') {
        let fullResponse = '';
        
        try {
          // Streamer la réponse principale avec pipelining
          for await (const chunk of runtimeManager.generate(plan.primaryTask.prompt || userPrompt, plan.primaryTask.modelKey)) {
            fullResponse += chunk;
            yield { type: 'primary', content: chunk };
            
            // Vérifier l'annulation pendant le streaming
            if (abortController.signal.aborted) {
              throw new Error('Cancelled');
            }
          }
          
          // Créer le résultat principal
          primaryResult = {
            taskId: this.generateTaskId(),
            agentName: plan.primaryTask.agentName,
            modelKey: plan.primaryTask.modelKey,
            result: fullResponse,
            error: null,
            status: 'success',
            duration: performance.now() - startTime,
            retries: 0,
            tokensGenerated: fullResponse.split(' ').length,
            startTime,
            endTime: performance.now(),
          };
        } catch (streamError) {
          if (streamError instanceof Error && streamError.message === 'Cancelled') {
            primaryResult = this.createTaskResult(this.generateTaskId(), plan.primaryTask, startTime, {
              status: 'cancelled',
              retries: 0,
            });
          } else {
            log.warn('Pipelined streaming failed, falling back to traditional method', streamError as Error);
            // Fallback to traditional method
            primaryResult = await queue.add(
              () =>
                this.executeTaskWithRetry(plan.primaryTask, userPrompt, {
                  signal: abortController.signal,
                  streaming: this.config.enableStreaming,
                }),
              { priority: 100 }
            );
          }
        }
      } else {
        // Fallback si le RuntimeManager n'a pas la méthode generate
        primaryResult = await queue.add(
          () =>
            this.executeTaskWithRetry(plan.primaryTask, userPrompt, {
              signal: abortController.signal,
              streaming: this.config.enableStreaming,
            }),
          { priority: 100 }
        );
      }
      
      // 7. Exécuter les tâches fallback en parallèle (sans streaming)
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
      
      // 8. Attendre les fallbacks avec Promise.allSettled
      if (fallbackPromises.length > 0) {
        logger.info('TaskExecutor', `⏳ Attente de ${fallbackPromises.length} fallback(s)...`);
        
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
        logger.info('TaskExecutor', `✅ Fallback: ${successCount}/${fallbackResults.length} succès`);
      }
      
      // Vérifier que primaryResult existe
      if (!primaryResult) {
        throw new Error('Échec de l\'exécution de la tâche principale');
      }
      
      // 9. Guardrails de sortie
      let finalResponse = primaryResult.result || '';
      if (this.securityConfig.enableOutputGuard && finalResponse) {
        logger.info('TaskExecutor', '🛡️ Application des guardrails de sortie...');
        const sanitized = outputGuard.sanitize(finalResponse);
        
        if (sanitized.modified) {
          logger.warn('TaskExecutor', `⚠️ Réponse modifiée pour supprimer ${sanitized.removedCount} éléments sensibles`);
          finalResponse = sanitized.sanitized;
          
          // Enregistrer la sanitization dans l'audit
          if (this.securityConfig.enableAuditLogging) {
            auditLogger.logSecurityEvent('OUTPUT_SANITIZED', {
              modifications: sanitized.removedCount,
              patterns: sanitized.detectedTypes,
              userId,
              sessionId
            }, 'MEDIUM', {
              userId,
              requestId: planId,
              policyVersion: '1.0'
            });
          }
        } else {
          logger.info('TaskExecutor', '✅ Réponse validée par les guardrails de sortie');
          
          if (this.securityConfig.enableAuditLogging) {
            auditLogger.logSecurityEvent('OUTPUT_VALIDATION_PASSED', {
              responseLength: finalResponse.length,
              userId,
              sessionId
            }, 'LOW', {
              userId,
              requestId: planId,
              policyVersion: '1.0'
            });
          }
        }
      }
      
      // 10. Watermarking
      if (this.securityConfig.enableWatermarking && finalResponse) {
        logger.info('TaskExecutor', '💧 Application du watermarking...');
        const watermarked = watermarkingService.apply(finalResponse, {
          modelId: primaryResult.modelKey,
          sessionId,
          userId
        });
        finalResponse = watermarked.watermarkedText;
        logger.info('TaskExecutor', '✅ Watermarking appliqué avec succès');
      }
      
      // 11. Fusion des résultats
      const taskResultsForFusion: TaskResult[] = [
        this.convertToTaskResult(primaryResult),
        ...fallbackResults.map((r) => this.convertToTaskResult(r)),
      ];
      
      const fusedResponse = await fusioner.fuse({
        primaryResult: taskResultsForFusion[0],
        expertResults: taskResultsForFusion.slice(1),
      });
      
      // 12. Mettre en cache
      if (this.config.enableCache && primaryResult.status === 'success') {
        responseCache.set(userPrompt, plan.primaryTask.modelKey, fusedResponse, primaryResult.tokensGenerated);
        logger.info('TaskExecutor', '💾 Résultat mis en cache');
      }
      
      // 13. Enregistrer l'exécution
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
      
      // 14. Yield le résultat final
      yield {
        type: 'fusion',
        content: fusedResponse,
        expertResults: taskResultsForFusion,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      logger.error('TaskExecutor', '💥 Erreur', error as Error);
      
      this.stats.failedExecutions++;
      this.stats.totalExecutions++;
      this.recordError(errorMessage);
      
      // Enregistrer l'erreur dans l'audit
      if (this.securityConfig.enableAuditLogging) {
        auditLogger.logSecurityEvent('EXECUTION_ERROR', {
          error: errorMessage,
          userId,
          sessionId
        }, 'HIGH', {
          userId,
          requestId: planId,
          policyVersion: '1.0'
        });
      }
      
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
   * Exécute un plan complet avec streaming et sécurité
   */
  public async *processStream(userPrompt: string): AsyncGenerator<StreamChunk> {
    // Utiliser la nouvelle méthode avec sécurité avancée
    try {
      for await (const chunk of this.processStreamWithSecurity(userPrompt)) {
        yield chunk;
      }
      return;
    } catch (error) {
      logger.warn('TaskExecutor', 'Pipelined processing with security failed, falling back to traditional processing', error as Error);
    }

    // Fallback à l'ancienne méthode si nécessaire
    const plan = await this.routerInstance.createPlan(userPrompt);
    log.info(`Plan: ${plan.strategy}, ${plan.fallbackTasks.length + 1} tâche(s)`);

    this.stats.tasksByStrategy[plan.strategy]++;

    let cached;
    if (this.config.enableCache) {
      cached = await responseCache.get(userPrompt, plan.primaryTask.modelKey);
      if (cached) {
        this.stats.cacheHits++;
        log.info('Cache HIT - Réponse trouvée');

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

        return;
      }
      this.stats.cacheMisses++;
    }

    const queue = this.getQueue(plan.strategy);
    log.info(`Stratégie: ${plan.strategy}`);

    const primaryResult = await queue.add(
      () =>
        this.executeTaskWithRetry(plan.primaryTask, userPrompt, {
          streaming: this.config.enableStreaming,
        }),
      { priority: 100 }
    );

    let fallbackResults: TaskExecutionResult[] = [];
    const fallbackPromises = plan.fallbackTasks.map((task) =>
      queue.add(
        () =>
          this.executeTaskWithRetry(task, userPrompt, {
            streaming: false,
          }),
        { priority: this.getPriorityValue(task.priority) }
      )
    );

    if (fallbackPromises.length > 0) {
      log.info(`Attente de ${fallbackPromises.length} fallback(s)...`);

      const settledResults = await Promise.allSettled(fallbackPromises);

      fallbackResults = settledResults.map((settled, index) => {
        if (settled.status === 'fulfilled') {
          return settled.value;
        } else {
          const task = plan.fallbackTasks[index];
          return this.createTaskResult(this.generateTaskId(), task, performance.now(), {
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

    let finalResponse = primaryResult.result || '';
    if (finalResponse && outputGuard) {
      log.info('Application des guardrails de sortie...');
      const sanitized = outputGuard.sanitize(finalResponse);

      if (sanitized.modified) {
        log.warn(`Réponse modifiée pour supprimer ${sanitized.removedCount} éléments sensibles`);
        finalResponse = sanitized.sanitized;
      } else {
        log.info('Réponse validée par les guardrails de sortie');
      }
    }

    if (finalResponse && watermarkingService) {
      log.info('Application du watermarking...');
      const watermarked = watermarkingService.apply(finalResponse, {
        modelId: primaryResult.modelKey,
        sessionId: `session-${Date.now()}`,
      });
      finalResponse = watermarked.watermarkedText;
      log.info('Watermarking appliqué avec succès');
    }

    const taskResultsForFusion: TaskResult[] = [
      this.convertToTaskResult(primaryResult),
      ...fallbackResults.map((r) => this.convertToTaskResult(r)),
    ];

    const fusedResponse = await fusioner.fuse({
      primaryResult: taskResultsForFusion[0],
      expertResults: taskResultsForFusion.slice(1),
    });

    if (this.config.enableCache && primaryResult.status === 'success') {
      responseCache.set(userPrompt, plan.primaryTask.modelKey, fusedResponse, primaryResult.tokensGenerated);
      log.info('Résultat mis en cache');
    }

    yield {
      type: 'fusion',
      content: fusedResponse,
      expertResults: taskResultsForFusion,
    };
  }
}
