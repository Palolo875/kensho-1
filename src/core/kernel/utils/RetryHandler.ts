/**
 * RetryHandler - Gestionnaire unifié des retries avec backoff exponentiel
 */

import { logger } from '../monitoring/LoggerService';

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface RetryResult<T> {
  result: T;
  retries: number;
  usedFallback: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'OUT_OF_MEMORY', 'GPU_ERROR'],
};

export class RetryHandler {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Configure les paramètres de retry
   */
  public setConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Calcule le délai de retry avec backoff exponentiel
   */
  public calculateRetryDelay(attempt: number): number {
    const delay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt),
      this.config.maxDelayMs
    );
    // Ajouter un jitter de ±20%
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  }

  /**
   * Vérifie si une erreur est retryable
   */
  public isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toUpperCase();
    return this.config.retryableErrors.some((e) => errorMessage.includes(e));
  }

  /**
   * Exécute une opération avec retry et backoff
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    enableFallback: boolean = true
  ): Promise<RetryResult<T>> {
    let lastError: Error | null = null;
    let retries = 0;
    let usedFallback = false;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await operation();
        return { result, retries, usedFallback };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retries = attempt;

        if (attempt < this.config.maxRetries && this.isRetryableError(lastError)) {
          const delay = this.calculateRetryDelay(attempt);
          logger.warn('RetryHandler', `${operationName} échoué (tentative ${attempt + 1}/${this.config.maxRetries + 1}), ` +
            `retry dans ${delay}ms: ${lastError.message}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (
          enableFallback &&
          lastError.message.includes('GPU')
        ) {
          // Fallback GPU → CPU
          logger.warn('RetryHandler', 'Erreur GPU détectée, fallback vers CPU...');
          usedFallback = true;
          throw lastError; // Laisser le gestionnaire d'appel gérer le fallback
        }
      }
    }

    throw lastError || new Error(`${operationName} échoué après ${retries + 1} tentatives`);
  }
}