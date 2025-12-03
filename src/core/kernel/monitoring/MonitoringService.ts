/**
 * MonitoringService v2.0 - Production-Ready Performance Monitoring
 * 
 * ARCHITECTURE:
 * - Map<planId, ExecutionMetrics> pour isolation (fix race condition CRITIQUE)
 * - Timeout 60s par exécution (fix zombie executions)
 * - Métriques étendues (modelLoadTime, expertsUsed, cacheHit, memoryUsage, errors)
 * - Historique et agrégation
 * - Détection d'anomalies
 * - Export pour dashboard temps réel
 */

import { eventBus } from '../../streaming/EventBus';
import { createLogger } from '@/lib/logger';

const log = createLogger('MonitoringService');

export interface ExecutionMetrics {
  planId: string;
  startTime: number;
  firstTokenTime?: number;
  tokenCount: number;
  status: 'running' | 'completed' | 'error' | 'timeout';
  modelLoadTime?: number;
  expertsUsed: string[];
  cacheHit: boolean;
  memoryUsage?: {
    beforeMB: number;
    afterMB: number;
    peakMB: number;
  };
  errors: Array<{
    timestamp: number;
    message: string;
    expert?: string;
  }>;
  ttft?: number;
  totalTime?: number;
  tokensPerSecond?: number;
}

export interface AggregatedMetrics {
  avgTtft: number;
  avgTotalTime: number;
  avgTokensPerSecond: number;
  errorRate: number;
  timeoutRate: number;
  cacheHitRate: number;
  expertUsage: Record<string, number>;
  totalExecutions: number;
}

interface AnomalyThresholds {
  ttftMs: number;
  errorRate: number;
  memoryMB: number;
  tokensPerSecMin: number;
}

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  ttftMs: 2000,
  errorRate: 0.1,
  memoryMB: 4096,
  tokensPerSecMin: 5
};

const EXECUTION_TIMEOUT_MS = 60000;
const MAX_HISTORY_SIZE = 100;

class MonitoringService {
  private activeExecutions = new Map<string, ExecutionMetrics>();
  private timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private history: ExecutionMetrics[] = [];
  private thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS;
  private cleanupCallbacks: Array<() => void> = [];

  constructor() {
    log.info('📊 MonitoringService v2.0 initialisé (Production-Ready)');
    this.listenToEvents();
  }

  private listenToEvents(): void {
    const cleanup0 = eventBus.on('START_EXECUTION', (payload) => {
      this.startExecution(payload.planId, {
        expertsUsed: payload.expertsUsed,
        cacheHit: payload.cacheHit
      });
    });
    this.cleanupCallbacks.push(cleanup0);

    const cleanup1 = eventBus.on('STATUS', (payload) => {
      if (payload.status?.includes('EXECUTION_STARTED') || payload.details?.includes('planId')) {
        const planIdMatch = payload.details?.match(/planId:(\S+)/);
        if (planIdMatch && !this.activeExecutions.has(planIdMatch[1])) {
          this.startExecution(planIdMatch[1]);
        }
      }
    });
    this.cleanupCallbacks.push(cleanup1);

    const cleanup2 = eventBus.on('TOKEN', (_payload) => {
      for (const [planId, metrics] of this.activeExecutions.entries()) {
        if (metrics.status === 'running') {
          this.recordToken(planId);
          break;
        }
      }
    });
    this.cleanupCallbacks.push(cleanup2);

    const cleanup3 = eventBus.on('COMPLETE', (_payload) => {
      const activeExecution = this.getMostRecentActiveExecution();
      if (activeExecution) {
        this.completeExecution(activeExecution.planId);
      }
    });
    this.cleanupCallbacks.push(cleanup3);

    const cleanup4 = eventBus.on('ERROR', (payload) => {
      const activeExecution = this.getMostRecentActiveExecution();
      if (activeExecution) {
        this.recordError(activeExecution.planId, payload.message);
      }
    });
    this.cleanupCallbacks.push(cleanup4);

    const cleanup5 = eventBus.on('METRICS', (payload) => {
      const activeExecution = this.getMostRecentActiveExecution();
      if (activeExecution && payload.ttft !== undefined) {
        const metrics = this.activeExecutions.get(activeExecution.planId);
        if (metrics) {
          metrics.ttft = payload.ttft;
          if (payload.tokensPerSec !== undefined) {
            metrics.tokensPerSecond = payload.tokensPerSec;
          }
        }
      }
    });
    this.cleanupCallbacks.push(cleanup5);

    log.info('📊 Événements enregistrés');
  }

  public startExecution(planId: string, options: Partial<{
    expertsUsed: string[];
    cacheHit: boolean;
  }> = {}): void {
    const memoryBefore = this.getMemoryUsage();
    
    const metrics: ExecutionMetrics = {
      planId,
      startTime: Date.now(),
      tokenCount: 0,
      status: 'running',
      expertsUsed: options.expertsUsed || [],
      cacheHit: options.cacheHit || false,
      errors: [],
      memoryUsage: memoryBefore ? {
        beforeMB: memoryBefore,
        afterMB: memoryBefore,
        peakMB: memoryBefore
      } : undefined
    };

    this.activeExecutions.set(planId, metrics);
    
    const timer = setTimeout(() => {
      this.handleTimeout(planId);
    }, EXECUTION_TIMEOUT_MS);
    this.timeoutTimers.set(planId, timer);

    log.info(`[Monitor] 📈 Exécution démarrée: ${planId}`);
    
    eventBus.emit('STATUS', { 
      status: 'EXECUTION_STARTED', 
      details: `planId:${planId}` 
    });
  }

  public recordToken(planId: string): void {
    const metrics = this.activeExecutions.get(planId);
    if (!metrics || metrics.status !== 'running') return;

    if (metrics.firstTokenTime === undefined) {
      metrics.firstTokenTime = Date.now();
      metrics.ttft = metrics.firstTokenTime - metrics.startTime;
      log.info(`[Monitor] ⚡ TTFT pour ${planId}: ${metrics.ttft}ms`);
    }

    metrics.tokenCount++;

    const currentMemory = this.getMemoryUsage();
    if (currentMemory && metrics.memoryUsage) {
      metrics.memoryUsage.peakMB = Math.max(
        metrics.memoryUsage.peakMB,
        currentMemory
      );
    }
  }

  public recordModelLoad(planId: string, loadTimeMs: number): void {
    const metrics = this.activeExecutions.get(planId);
    if (metrics) {
      metrics.modelLoadTime = loadTimeMs;
    }
  }

  public recordExpert(planId: string, expertName: string): void {
    const metrics = this.activeExecutions.get(planId);
    if (metrics && !metrics.expertsUsed.includes(expertName)) {
      metrics.expertsUsed.push(expertName);
    }
  }

  public recordError(planId: string, message: string, expertName?: string): void {
    const metrics = this.activeExecutions.get(planId);
    if (metrics) {
      metrics.errors.push({
        timestamp: Date.now(),
        message,
        expert: expertName
      });
      log.warn(`[Monitor] 📉 Erreur pour ${planId}: ${message}`);
    }
  }

  public completeExecution(planId: string): void {
    const metrics = this.activeExecutions.get(planId);
    if (!metrics) {
      log.warn(`[Monitor] Exécution ${planId} non trouvée pour complétion`);
      return;
    }

    const timer = this.timeoutTimers.get(planId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(planId);
    }

    const totalTime = Date.now() - metrics.startTime;
    const tokensPerSecond = metrics.tokenCount > 0 
      ? (metrics.tokenCount / totalTime) * 1000 
      : 0;

    metrics.status = 'completed';
    metrics.totalTime = totalTime;
    metrics.tokensPerSecond = parseFloat(tokensPerSecond.toFixed(2));

    if (metrics.memoryUsage) {
      const currentMemory = this.getMemoryUsage();
      if (currentMemory) {
        metrics.memoryUsage.afterMB = currentMemory;
      }
    }

    const finalMetrics = {
      planId: metrics.planId,
      ttft: metrics.ttft || totalTime,
      totalTime,
      tokenCount: metrics.tokenCount,
      tokensPerSecond: metrics.tokensPerSecond,
      expertsUsed: metrics.expertsUsed,
      cacheHit: metrics.cacheHit,
      errorCount: metrics.errors.length
    };

    log.info('[Monitor] 📊 Métriques Finales:', finalMetrics);

    eventBus.emit('METRICS', {
      ttft: metrics.ttft,
      tokensPerSec: metrics.tokensPerSecond,
      totalTokens: metrics.tokenCount
    });

    this.addToHistory(metrics);
    this.checkForAnomalies(metrics);
    this.activeExecutions.delete(planId);
  }

  private handleTimeout(planId: string): void {
    const metrics = this.activeExecutions.get(planId);
    if (!metrics || metrics.status !== 'running') return;

    log.error(`[Monitor] ⏱️ Timeout pour exécution: ${planId}`);

    metrics.status = 'timeout';
    metrics.totalTime = EXECUTION_TIMEOUT_MS;
    metrics.errors.push({
      timestamp: Date.now(),
      message: 'Execution timeout after 60s'
    });

    eventBus.emit('ERROR', {
      message: `Execution ${planId} timed out after 60s`,
      retriable: true
    });

    this.addToHistory(metrics);
    this.activeExecutions.delete(planId);
    this.timeoutTimers.delete(planId);
  }

  private addToHistory(metrics: ExecutionMetrics): void {
    this.history.push({ ...metrics });
    
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history = this.history.slice(-MAX_HISTORY_SIZE);
    }
  }

  private checkForAnomalies(metrics: ExecutionMetrics): void {
    const anomalies: string[] = [];

    if (metrics.ttft && metrics.ttft > this.thresholds.ttftMs) {
      anomalies.push(`TTFT élevé: ${metrics.ttft}ms > ${this.thresholds.ttftMs}ms`);
    }

    if (metrics.tokensPerSecond && metrics.tokensPerSecond < this.thresholds.tokensPerSecMin) {
      anomalies.push(`Débit faible: ${metrics.tokensPerSecond} tok/s < ${this.thresholds.tokensPerSecMin} tok/s`);
    }

    if (metrics.memoryUsage && metrics.memoryUsage.peakMB > this.thresholds.memoryMB) {
      anomalies.push(`Mémoire élevée: ${metrics.memoryUsage.peakMB}MB > ${this.thresholds.memoryMB}MB`);
    }

    const aggregated = this.getAggregatedStats();
    if (aggregated.errorRate > this.thresholds.errorRate) {
      anomalies.push(`Taux d'erreur élevé: ${(aggregated.errorRate * 100).toFixed(1)}% > ${this.thresholds.errorRate * 100}%`);
    }

    if (anomalies.length > 0) {
      log.warn('[Monitor] 🚨 ANOMALIES DÉTECTÉES:', anomalies);
      eventBus.emit('STATUS', {
        status: 'MONITORING_ALERT',
        details: anomalies.join('; ')
      });
    }
  }

  public getAggregatedStats(): AggregatedMetrics {
    if (this.history.length === 0) {
      return {
        avgTtft: 0,
        avgTotalTime: 0,
        avgTokensPerSecond: 0,
        errorRate: 0,
        timeoutRate: 0,
        cacheHitRate: 0,
        expertUsage: {},
        totalExecutions: 0
      };
    }

    const completed = this.history.filter(m => m.status === 'completed');
    const errors = this.history.filter(m => m.status === 'error');
    const timeouts = this.history.filter(m => m.status === 'timeout');
    const cacheHits = this.history.filter(m => m.cacheHit);

    const avgTtft = completed.length > 0
      ? completed.reduce((sum, m) => sum + (m.ttft || 0), 0) / completed.length
      : 0;

    const avgTotalTime = completed.length > 0
      ? completed.reduce((sum, m) => sum + (m.totalTime || 0), 0) / completed.length
      : 0;

    const avgTokensPerSecond = completed.length > 0
      ? completed.reduce((sum, m) => sum + (m.tokensPerSecond || 0), 0) / completed.length
      : 0;

    const expertUsage: Record<string, number> = {};
    for (const metrics of this.history) {
      for (const expert of metrics.expertsUsed) {
        expertUsage[expert] = (expertUsage[expert] || 0) + 1;
      }
    }

    return {
      avgTtft: Math.round(avgTtft),
      avgTotalTime: Math.round(avgTotalTime),
      avgTokensPerSecond: parseFloat(avgTokensPerSecond.toFixed(2)),
      errorRate: this.history.length > 0 ? errors.length / this.history.length : 0,
      timeoutRate: this.history.length > 0 ? timeouts.length / this.history.length : 0,
      cacheHitRate: this.history.length > 0 ? cacheHits.length / this.history.length : 0,
      expertUsage,
      totalExecutions: this.history.length
    };
  }

  public getCurrentMetrics(planId: string): ExecutionMetrics | undefined {
    return this.activeExecutions.get(planId);
  }

  public getActiveExecutions(): Map<string, ExecutionMetrics> {
    return new Map(this.activeExecutions);
  }

  public getHistory(limit: number = MAX_HISTORY_SIZE): ExecutionMetrics[] {
    return this.history.slice(-limit);
  }

  public exportMetrics(): {
    current: Map<string, ExecutionMetrics>;
    history: ExecutionMetrics[];
    aggregated: AggregatedMetrics;
  } {
    return {
      current: this.getActiveExecutions(),
      history: this.getHistory(),
      aggregated: this.getAggregatedStats()
    };
  }

  public exportToJSON(): string {
    const data = this.exportMetrics();
    return JSON.stringify({
      current: Object.fromEntries(data.current),
      history: data.history,
      aggregated: data.aggregated,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  public setThresholds(thresholds: Partial<AnomalyThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    log.info('[Monitor] Seuils mis à jour:', this.thresholds);
  }

  private getMemoryUsage(): number | undefined {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return Math.round(memory.usedJSHeapSize / (1024 * 1024));
    }
    return undefined;
  }

  private getMostRecentActiveExecution(): ExecutionMetrics | undefined {
    let mostRecent: ExecutionMetrics | undefined;
    let latestStart = 0;

    for (const metrics of this.activeExecutions.values()) {
      if (metrics.status === 'running' && metrics.startTime > latestStart) {
        latestStart = metrics.startTime;
        mostRecent = metrics;
      }
    }

    return mostRecent;
  }

  public reset(): void {
    for (const timer of this.timeoutTimers.values()) {
      clearTimeout(timer);
    }
    this.activeExecutions.clear();
    this.timeoutTimers.clear();
    this.history = [];
    log.info('[Monitor] 🧹 Réinitialisé');
  }

  public destroy(): void {
    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks = [];
    this.reset();
    log.info('[Monitor] 💀 Détruit');
  }
}

export const monitoringService = new MonitoringService();

log.info('✅ MonitoringService exporté et actif');
