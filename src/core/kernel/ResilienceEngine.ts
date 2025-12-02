/**
 * ResilienceEngine - Moteur de Résilience avec Circuit Breaker et Métriques
 * 
 * Implémente:
 * - Circuit Breaker 3-états (CLOSED, OPEN, HALF_OPEN)
 * - Classification fine des erreurs (retriables vs non-retriables)
 * - Backoff adaptatif avec jitter
 * - Timeout imperméable avec Promise.race
 * - Métriques et observabilité Prometheus-style
 */

import { createLogger } from '../../lib/logger';

const log = createLogger('ResilienceEngine');

/**
 * États du Circuit Breaker
 */
enum CircuitState {
  CLOSED = 'CLOSED',      // Normal, accepte les requêtes
  OPEN = 'OPEN',          // Bloqué, refuse les requêtes
  HALF_OPEN = 'HALF_OPEN' // Test, accepte une seule requête
}

/**
 * Configuration par modèle
 */
const MODEL_TIMEOUTS: Record<string, number> = {
  'gpt-4-turbo': 45000,
  'claude-3-opus': 120000,
  'llama-3': 30000,
  'gemma-2-2b': 15000,
  'gemma-3-270m': 10000,
};

const CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 5,      // Ouvrir après 5 échecs
  RESET_TIMEOUT_MS: 30000,   // 30 secondes avant retry
  HALF_OPEN_TIMEOUT_MS: 60000 // Timeout pendant HALF_OPEN
};

/**
 * Circuit Breaker - Protège contre les défaillances en cascade
 */
class CircuitBreaker {
  private state = new Map<string, CircuitState>();
  private failureCount = new Map<string, number>();
  private lastFailure = new Map<string, number>();
  private lastStateChange = new Map<string, number>();

  canAttempt(modelKey: string): boolean {
    const currentState = this.state.get(modelKey) ?? CircuitState.CLOSED;

    if (currentState === CircuitState.CLOSED) {
      return true;
    }

    if (currentState === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - (this.lastFailure.get(modelKey) ?? 0);
      
      if (timeSinceLastFailure > CIRCUIT_BREAKER_CONFIG.RESET_TIMEOUT_MS) {
        log.info(`[CircuitBreaker] Transition ${modelKey}: OPEN → HALF_OPEN`);
        this.state.set(modelKey, CircuitState.HALF_OPEN);
        this.lastStateChange.set(modelKey, Date.now());
        return true;
      }

      log.warn(`[CircuitBreaker] ${modelKey} est OPEN. Blocage requête.`);
      return false;
    }

    // HALF_OPEN: une seule tentative
    this.state.set(modelKey, CircuitState.CLOSED);
    this.failureCount.set(modelKey, 0);
    log.info(`[CircuitBreaker] Transition ${modelKey}: HALF_OPEN → CLOSED`);
    return true;
  }

  recordSuccess(modelKey: string): void {
    this.failureCount.set(modelKey, 0);
    
    if (this.state.get(modelKey) !== CircuitState.CLOSED) {
      log.info(`[CircuitBreaker] Récupération ${modelKey}: SUCCESS`);
      this.state.set(modelKey, CircuitState.CLOSED);
    }
  }

  recordFailure(modelKey: string): void {
    const count = (this.failureCount.get(modelKey) ?? 0) + 1;
    this.failureCount.set(modelKey, count);
    this.lastFailure.set(modelKey, Date.now());

    if (count >= CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD) {
      log.error(`[CircuitBreaker] Ouverture du circuit pour ${modelKey} (${count} échecs)`);
      this.state.set(modelKey, CircuitState.OPEN);
      this.lastStateChange.set(modelKey, Date.now());
    }
  }

  getState(modelKey: string): CircuitState {
    return this.state.get(modelKey) ?? CircuitState.CLOSED;
  }

  reset(modelKey: string): void {
    this.state.set(modelKey, CircuitState.CLOSED);
    this.failureCount.set(modelKey, 0);
    this.lastFailure.delete(modelKey);
    log.info(`[CircuitBreaker] Reset du circuit pour ${modelKey}`);
  }

  getStats(): Record<string, { state: CircuitState; failures: number }> {
    const stats: Record<string, { state: CircuitState; failures: number }> = {};
    
    for (const [model, state] of this.state) {
      stats[model] = {
        state,
        failures: this.failureCount.get(model) ?? 0
      };
    }
    
    return stats;
  }
}

/**
 * Classification fine des erreurs
 */
class ErrorClassifier {
  static isRetriable(error: Error): boolean {
    const msg = error.message.toLowerCase();
    
    const retriablePatterns = [
      // HTTP codes
      '429', '503', '504', 'timeout', 'network',
      // LLM-specific
      'rate limit', 'overload', 'gpu out of memory', 'temporarily unavailable',
      'cuda out of memory', 'vram',
      // Client-side
      'fetch failed', 'connection reset', 'econnrefused'
    ];

    const isRetriable = retriablePatterns.some(pattern => msg.includes(pattern));
    
    if (!isRetriable) {
      log.debug(`[ErrorClassifier] Non-retriable: ${error.message}`);
    }

    return isRetriable;
  }

  static isNonRetriable(error: Error): boolean {
    const msg = error.message.toLowerCase();
    
    const nonRetriablePatterns = [
      'invalid api key',
      'model not found',
      'input too long',
      'invalid prompt',
      'authentication failed',
      'unauthorized'
    ];

    return nonRetriablePatterns.some(pattern => msg.includes(pattern));
  }
}

/**
 * Métriques de résilience - Prometheus-style
 */
class ResilienceMetrics {
  private counters = {
    tasks_total: 0,
    tasks_success: 0,
    tasks_error: 0,
    tasks_timeout: 0,
    retries_total: 0,
    timeouts_total: 0,
    circuit_breaker_open: 0
  };

  private latencies: number[] = [];
  private retryDistribution: Record<number, number> = {};

  recordSuccess(duration: number, retriesUsed: number): void {
    this.counters.tasks_total++;
    this.counters.tasks_success++;
    this.latencies.push(duration);
    this.retryDistribution[retriesUsed] = (this.retryDistribution[retriesUsed] ?? 0) + 1;

    this.checkAlerts();
  }

  recordError(error: Error, retriesUsed: number): void {
    this.counters.tasks_total++;
    this.counters.tasks_error++;
    this.retryDistribution[retriesUsed] = (this.retryDistribution[retriesUsed] ?? 0) + 1;

    if (error.message.includes('TASK_TIMEOUT')) {
      this.counters.tasks_timeout++;
      this.counters.timeouts_total++;
    }

    this.checkAlerts();
  }

  recordRetry(): void {
    this.counters.retries_total++;
  }

  recordCircuitBreakerOpen(): void {
    this.counters.circuit_breaker_open++;
  }

  private checkAlerts(): void {
    if (this.counters.tasks_total % 100 === 0) {
      const stats = this.getStats();
      const successRate = parseFloat(stats.success_rate);

      if (successRate < 95) {
        log.error(`[ResilienceMetrics] ALERTE: Taux de succès dégradé (${stats.success_rate})`);
      }
    }
  }

  getStats() {
    const successRate = this.counters.tasks_total > 0
      ? ((this.counters.tasks_success / this.counters.tasks_total) * 100).toFixed(1)
      : 'N/A';

    return {
      tasks_total: this.counters.tasks_total,
      tasks_success: this.counters.tasks_success,
      tasks_error: this.counters.tasks_error,
      tasks_timeout: this.counters.tasks_timeout,
      success_rate: `${successRate}%`,
      retry_rate: this.counters.tasks_total > 0 
        ? ((this.counters.retries_total / this.counters.tasks_total) * 100).toFixed(1)
        : '0',
      p50_latency_ms: this.percentile(this.latencies, 50).toFixed(2),
      p95_latency_ms: this.percentile(this.latencies, 95).toFixed(2),
      p99_latency_ms: this.percentile(this.latencies, 99).toFixed(2),
      avg_retries: (this.counters.retries_total / Math.max(1, this.counters.tasks_total)).toFixed(2),
      circuit_breaker_opens: this.counters.circuit_breaker_open
    };
  }

  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    
    return sorted[Math.max(0, index)];
  }
}

/**
 * Backoff Adaptatif avec Jitter
 */
class AdaptiveBackoff {
  static calculateDelay(attempt: number, modelKey: string): number {
    const baseDelay = MODEL_TIMEOUTS[modelKey] ?? 200;
    const exponent = Math.pow(2, attempt - 1);
    const maxDelay = 30000; // Cap 30s

    // Jitter ±30% pour éviter les pics synchronisés
    const jitter = (Math.random() - 0.5) * 0.6;
    const delay = Math.min(maxDelay, baseDelay * exponent * (1 + jitter));

    log.debug(`[AdaptiveBackoff] ${modelKey} attempt=${attempt} delay=${delay.toFixed(0)}ms`);

    return delay;
  }

  static calculateTimeout(modelKey: string): number {
    return MODEL_TIMEOUTS[modelKey] ?? 3000;
  }
}

/**
 * Engine de Résilience complet
 */
export class ResilienceEngine {
  private circuitBreaker: CircuitBreaker;
  private metrics: ResilienceMetrics;
  private errorClassifier = ErrorClassifier;
  private adaptiveBackoff = AdaptiveBackoff;

  constructor() {
    this.circuitBreaker = new CircuitBreaker();
    this.metrics = new ResilienceMetrics();
    log.info('🛡️ ResilienceEngine v1.0 initialisé (Circuit Breaker + Metrics + Backoff Adaptatif)');
  }

  /**
   * Exécute une fonction avec resilience complète
   */
  async execute<T>(
    modelKey: string,
    fn: (signal: AbortSignal) => Promise<T>,
    maxRetries: number = 2
  ): Promise<T> {
    // Vérifier le circuit breaker
    if (!this.circuitBreaker.canAttempt(modelKey)) {
      this.metrics.recordCircuitBreakerOpen();
      throw new Error(`Circuit breaker OPEN pour ${modelKey}`);
    }

    let lastError: Error | null = null;
    let retriesUsed = 0;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const abortController = new AbortController();
      let timeoutId: NodeJS.Timeout | null = null;

      try {
        // Timeout imperméable avec Promise.race
        const timeout = this.adaptiveBackoff.calculateTimeout(modelKey);
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('TASK_TIMEOUT'));
          }, timeout);
        });

        const result = await Promise.race([
          fn(abortController.signal),
          timeoutPromise
        ]);

        // Succès
        if (timeoutId) clearTimeout(timeoutId);
        this.circuitBreaker.recordSuccess(modelKey);
        this.metrics.recordSuccess(Date.now() - startTime, retriesUsed);

        log.info(`[ResilienceEngine] ✅ ${modelKey} succès (tentative ${attempt + 1}, ${retriesUsed} retries)`);
        return result;

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        // Cleanup timeout
        if (timeoutId) clearTimeout(timeoutId);
        abortController.abort();

        // Enregistrer l'erreur
        this.circuitBreaker.recordFailure(modelKey);
        this.metrics.recordError(err, retriesUsed);

        lastError = err;

        // Vérifier si retriable
        if (!this.errorClassifier.isRetriable(err) || attempt >= maxRetries) {
          if (this.errorClassifier.isNonRetriable(err)) {
            log.error(`[ResilienceEngine] ❌ Erreur non-retriable pour ${modelKey}: ${err.message}`);
          } else if (attempt >= maxRetries) {
            log.error(`[ResilienceEngine] ❌ Échec final pour ${modelKey} après ${attempt + 1} tentatives`);
          }
          throw err;
        }

        // Préparer la prochaine tentative avec backoff
        retriesUsed++;
        this.metrics.recordRetry();

        const delay = this.adaptiveBackoff.calculateDelay(attempt + 1, modelKey);
        log.warn(`[ResilienceEngine] ⚠️ ${modelKey} tentative ${attempt + 1} échouée: ${err.message}. Retry dans ${delay.toFixed(0)}ms`);

        await new Promise(r => setTimeout(r, delay));

      } finally {
        // Cleanup final
        abortController.abort();
      }
    }

    // Ne devrait pas atteindre ici
    throw lastError || new Error('Erreur inconnue');
  }

  /**
   * Retourne les statistiques de résilience
   */
  getMetrics() {
    return this.metrics.getStats();
  }

  /**
   * Retourne l'état des circuit breakers
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset un circuit breaker
   */
  resetCircuitBreaker(modelKey: string): void {
    this.circuitBreaker.reset(modelKey);
  }
}

// Export singleton
export const resilienceEngine = new ResilienceEngine();
