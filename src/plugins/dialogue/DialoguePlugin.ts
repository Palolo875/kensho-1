/**
 * DialoguePlugin v2.0 - Production-Ready Orchestrator
 * 
 * ARCHITECTURE:
 * - Cache key plan-aware (fix BUG CRITIQUE: hash(prompt + plan.experts))
 * - AbortController pour cancellation
 * - Retry logic avec backoff exponentiel
 * - Gestion d'erreurs robuste avec cleanup
 * - Métriques de performance breakdown
 * - Intégration MonitoringService
 */

import { router } from '../../core/router/Router';
import { taskExecutor } from '../../core/kernel/TaskExecutor';
import { fusioner } from '../../core/kernel/Fusioner';
import type { TaskResult } from '../../core/router/RouterTypes';
import { responseCache } from '../../core/cache/ResponseCache';
import { eventBus } from '../../core/streaming/EventBus';
import { inputFilter } from '../../core/kernel/guardrails/InputFilter';
import { outputGuard } from '../../core/kernel/guardrails/OutputGuard';
import { monitoringService } from '../../core/kernel/monitoring/MonitoringService';
import { createLogger } from '../../lib/logger';

const log = createLogger('DialoguePlugin');

export interface DialogueOptions {
  streaming?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export interface DialogueMetrics {
  validationTimeMs: number;
  planningTimeMs: number;
  executionTimeMs: number;
  fusionTimeMs: number;
  outputGuardTimeMs: number;
  cachingTimeMs: number;
  totalTimeMs: number;
  fromCache: boolean;
}

interface ActiveRequest {
  planId: string;
  abortController: AbortController;
  startTime: number;
}

const DEFAULT_OPTIONS: Required<DialogueOptions> = {
  streaming: true,
  maxRetries: 2,
  retryDelayMs: 500,
  timeoutMs: 60000
};

export class DialoguePlugin {
  private activeRequests = new Map<string, ActiveRequest>();
  private requestCounter = 0;

  constructor() {
    log.info('🔌 DialoguePlugin v2.0 initialisé (Production-Ready)');
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${++this.requestCounter}`;
  }

  private generateModelKey(experts: string[]): string {
    return [...experts].sort().join('|');
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async process(prompt: string, options: DialogueOptions = {}): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const requestId = this.generateRequestId();
    const abortController = new AbortController();
    const startTime = Date.now();
    
    const metrics: DialogueMetrics = {
      validationTimeMs: 0,
      planningTimeMs: 0,
      executionTimeMs: 0,
      fusionTimeMs: 0,
      outputGuardTimeMs: 0,
      cachingTimeMs: 0,
      totalTimeMs: 0,
      fromCache: false
    };

    let planId: string | null = null;

    try {
      const stepStart = Date.now();
      const validation = inputFilter.validate(prompt);
      metrics.validationTimeMs = Date.now() - stepStart;
      
      if (!validation.safe) {
        log.warn(`[DialoguePlugin] Prompt rejeté: ${validation.reason}`);
        eventBus.streamError(new Error(validation.reason || 'Prompt invalide'));
        throw new Error(validation.reason || 'Prompt invalide');
      }

      eventBus.streamStatus('Début de l\'exécution...');

      const planStart = Date.now();
      const plan = await router.createPlan(prompt);
      metrics.planningTimeMs = Date.now() - planStart;
      
      planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      
      this.activeRequests.set(requestId, {
        planId,
        abortController,
        startTime
      });

      monitoringService.startExecution(planId, {
        expertsUsed: [plan.primaryTask.agentName, ...plan.fallbackTasks.map(t => t.agentName)],
        cacheHit: false
      });

      eventBus.streamStatus(`Plan créé: ${plan.strategy}`);

      const expertsList = [
        plan.primaryTask.agentName,
        ...plan.fallbackTasks.map(t => t.agentName)
      ];
      const modelKey = this.generateModelKey(expertsList);

      const cacheStart = Date.now();
      const cachedResponse = await responseCache.get(prompt, modelKey);
      
      if (cachedResponse) {
        metrics.cachingTimeMs = Date.now() - cacheStart;
        metrics.fromCache = true;
        metrics.totalTimeMs = Date.now() - startTime;
        
        log.info(`[DialoguePlugin] Cache HIT pour ${modelKey}`);
        eventBus.streamStatus('Réponse trouvée dans le cache');
        eventBus.streamComplete(cachedResponse.response);
        
        monitoringService.completeExecution(planId);
        this.activeRequests.delete(requestId);
        
        return cachedResponse.response;
      }

      log.info(`[DialoguePlugin] Cache MISS, exécution du plan ${plan.strategy}`);
      eventBus.streamStatus(`Exécution du plan (${plan.strategy})...`);

      const execStart = Date.now();
      let results: TaskResult[] = [];
      let lastError: Error | null = null;
      let attempt = 0;

      while (attempt <= opts.maxRetries) {
        if (abortController.signal.aborted) {
          throw new Error('Requête annulée');
        }

        try {
          results = await this.executeWithTimeout(
            plan,
            prompt,
            opts.timeoutMs,
            abortController.signal
          );
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          attempt++;
          
          if (this.isRetriableError(lastError) && attempt <= opts.maxRetries) {
            const delay = opts.retryDelayMs * Math.pow(2, attempt - 1);
            log.warn(`[DialoguePlugin] Retry ${attempt}/${opts.maxRetries} après ${delay}ms`);
            eventBus.streamStatus(`Nouvelle tentative (${attempt}/${opts.maxRetries})...`);
            await this.delay(delay);
          } else {
            throw lastError;
          }
        }
      }

      metrics.executionTimeMs = Date.now() - execStart;

      if (abortController.signal.aborted) {
        throw new Error('Requête annulée');
      }

      const fusionStart = Date.now();
      eventBus.streamStatus('Fusion des résultats...');
      
      const primaryResult = results[0];
      const expertResults = results.slice(1);
      const fusedResponse = await fusioner.fuse({
        primaryResult,
        expertResults
      });
      
      metrics.fusionTimeMs = Date.now() - fusionStart;

      const outputStart = Date.now();
      const sanitizationResult = outputGuard.sanitize(fusedResponse);
      const sanitizedResponse = sanitizationResult.sanitized;
      metrics.outputGuardTimeMs = Date.now() - outputStart;

      eventBus.streamStatus('Exécution terminée');
      eventBus.streamComplete(sanitizedResponse);

      const cacheSetStart = Date.now();
      responseCache.set(prompt, modelKey, sanitizedResponse);
      metrics.cachingTimeMs += Date.now() - cacheSetStart;

      metrics.totalTimeMs = Date.now() - startTime;

      this.logMetricsBreakdown(metrics);
      
      monitoringService.completeExecution(planId);
      this.activeRequests.delete(requestId);

      return sanitizedResponse;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('[DialoguePlugin] Erreur dans le pipeline:', err);
      
      if (planId) {
        monitoringService.recordError(planId, err.message);
        monitoringService.completeExecution(planId);
      }
      
      eventBus.streamError(err);
      this.activeRequests.delete(requestId);
      
      throw err;
    }
  }

  private async executeWithTimeout(
    _plan: any,
    prompt: string,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<TaskResult[]> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout d\'exécution dépassé'));
      }, timeoutMs);

      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new Error('Requête annulée'));
      };

      signal.addEventListener('abort', abortHandler);

      try {
        const results: TaskResult[] = [];
        
        for await (const chunk of taskExecutor.processStream(prompt)) {
          if (signal.aborted) {
            throw new Error('Requête annulée');
          }
          
          if (chunk.type === 'fusion' && chunk.expertResults) {
            results.push(...chunk.expertResults);
          }
        }

        clearTimeout(timeoutId);
        signal.removeEventListener('abort', abortHandler);
        resolve(results.length > 0 ? results : [{
          agentName: 'fallback',
          modelKey: 'default',
          result: 'Exécution terminée',
          status: 'success'
        }]);
      } catch (error) {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', abortHandler);
        reject(error);
      }
    });
  }

  private isRetriableError(error: Error): boolean {
    const retriablePatterns = [
      'timeout',
      '503',
      '429',
      'rate limit',
      'network',
      'connection',
      'ECONNRESET',
      'ETIMEDOUT'
    ];
    
    const message = error.message.toLowerCase();
    return retriablePatterns.some(pattern => message.includes(pattern));
  }

  private logMetricsBreakdown(metrics: DialogueMetrics): void {
    const breakdown = {
      validation: `${metrics.validationTimeMs}ms (${this.percentage(metrics.validationTimeMs, metrics.totalTimeMs)}%)`,
      planning: `${metrics.planningTimeMs}ms (${this.percentage(metrics.planningTimeMs, metrics.totalTimeMs)}%)`,
      execution: `${metrics.executionTimeMs}ms (${this.percentage(metrics.executionTimeMs, metrics.totalTimeMs)}%)`,
      fusion: `${metrics.fusionTimeMs}ms (${this.percentage(metrics.fusionTimeMs, metrics.totalTimeMs)}%)`,
      outputGuard: `${metrics.outputGuardTimeMs}ms (${this.percentage(metrics.outputGuardTimeMs, metrics.totalTimeMs)}%)`,
      caching: `${metrics.cachingTimeMs}ms (${this.percentage(metrics.cachingTimeMs, metrics.totalTimeMs)}%)`,
      total: `${metrics.totalTimeMs}ms`,
      fromCache: metrics.fromCache
    };

    log.info('[DialoguePlugin] 📊 Performance Breakdown:', breakdown);

    eventBus.emit('STATUS', {
      status: 'PIPELINE_METRICS',
      details: JSON.stringify(breakdown)
    });
  }

  private percentage(part: number, total: number): string {
    if (total === 0) return '0';
    return ((part / total) * 100).toFixed(1);
  }

  public cancel(requestId: string): boolean {
    const request = this.activeRequests.get(requestId);
    if (request) {
      request.abortController.abort();
      
      if (request.planId) {
        monitoringService.recordError(request.planId, 'Requête annulée par l\'utilisateur');
        monitoringService.completeExecution(request.planId);
      }
      
      this.activeRequests.delete(requestId);
      log.info(`[DialoguePlugin] Requête ${requestId} annulée`);
      return true;
    }
    return false;
  }

  public cancelAll(): number {
    let count = 0;
    for (const [_requestId, request] of this.activeRequests) {
      request.abortController.abort();
      
      if (request.planId) {
        monitoringService.recordError(request.planId, 'Requête annulée (cancelAll)');
        monitoringService.completeExecution(request.planId);
      }
      
      count++;
    }
    this.activeRequests.clear();
    log.info(`[DialoguePlugin] ${count} requête(s) annulée(s)`);
    return count;
  }

  public getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  public getActiveRequestIds(): string[] {
    return Array.from(this.activeRequests.keys());
  }

  public async *processStream(
    prompt: string, 
    options: DialogueOptions = {}
  ): AsyncGenerator<{ type: string; data: any; timestamp: number }> {
    void options;
    const requestId = this.generateRequestId();
    const abortController = new AbortController();
    const startTime = Date.now();

    try {
      const validation = inputFilter.validate(prompt);
      if (!validation.safe) {
        yield {
          type: 'error',
          data: { message: validation.reason || 'Prompt invalide' },
          timestamp: Date.now()
        };
        return;
      }

      const plan = await router.createPlan(prompt);
      const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      
      this.activeRequests.set(requestId, {
        planId,
        abortController,
        startTime
      });

      monitoringService.startExecution(planId, {
        expertsUsed: [plan.primaryTask.agentName, ...plan.fallbackTasks.map(t => t.agentName)],
        cacheHit: false
      });

      yield {
        type: 'status',
        data: { status: `Plan créé: ${plan.strategy}` },
        timestamp: Date.now()
      };

      const expertsList = [
        plan.primaryTask.agentName,
        ...plan.fallbackTasks.map(t => t.agentName)
      ];
      const modelKey = this.generateModelKey(expertsList);

      const cachedResponse = await responseCache.get(prompt, modelKey);
      if (cachedResponse) {
        yield {
          type: 'complete',
          data: { response: cachedResponse.response, fromCache: true },
          timestamp: Date.now()
        };
        
        monitoringService.completeExecution(planId);
        this.activeRequests.delete(requestId);
        return;
      }

      let fullResponse = '';
      let tokenCount = 0;
      let firstTokenTime: number | null = null;

      for await (const chunk of taskExecutor.processStream(prompt)) {
        if (abortController.signal.aborted) {
          yield {
            type: 'cancelled',
            data: { message: 'Requête annulée' },
            timestamp: Date.now()
          };
          return;
        }

        if (chunk.type === 'primary' && chunk.content) {
          if (!firstTokenTime) {
            firstTokenTime = Date.now();
            const ttft = firstTokenTime - startTime;
            log.info(`[DialoguePlugin] TTFT: ${ttft}ms`);
          }

          fullResponse += chunk.content;
          tokenCount++;
          monitoringService.recordToken(planId);

          yield {
            type: 'token',
            data: chunk.content,
            timestamp: Date.now()
          };
        }

        if (chunk.type === 'fusion') {
          const sanitizationResult = outputGuard.sanitize(chunk.content || fullResponse);
          const sanitizedResponse = sanitizationResult.sanitized;
          
          responseCache.set(prompt, modelKey, sanitizedResponse, tokenCount);

          const totalTime = Date.now() - startTime;
          const tokensPerSecond = tokenCount > 0 ? (tokenCount / totalTime) * 1000 : 0;

          yield {
            type: 'complete',
            data: {
              response: sanitizedResponse,
              tokens: tokenCount,
              metrics: { 
                totalTime, 
                tokensPerSecond: parseFloat(tokensPerSecond.toFixed(1)),
                ttft: firstTokenTime ? firstTokenTime - startTime : totalTime
              }
            },
            timestamp: Date.now()
          };
        }
      }

      monitoringService.completeExecution(planId);
      this.activeRequests.delete(requestId);

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('[DialoguePlugin] Erreur streaming:', err);
      
      yield {
        type: 'error',
        data: { message: err.message },
        timestamp: Date.now()
      };

      this.activeRequests.delete(requestId);
    }
  }
}

// Export singleton instance
export const dialoguePlugin = new DialoguePlugin();

log.info('✅ DialoguePlugin exporté');