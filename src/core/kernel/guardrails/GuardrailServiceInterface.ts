// src/core/kernel/guardrails/GuardrailServiceInterface.ts
// Common interface for all guardrail services

/**
 * Base interface for all guardrail services
 */
export interface GuardrailService {
  /**
   * Service name for identification
   */
  readonly serviceName: string;
  
  /**
   * Service version
   */
  readonly version: string;
  
  /**
   * Initialize the service
   */
  initialize(): Promise<void>;
  
  /**
   * Shutdown the service gracefully
   */
  shutdown(): Promise<void>;
  
  /**
   * Get service statistics/metrics
   */
  getStats(): Record<string, any>;
  
  /**
   * Reset service statistics
   */
  resetStats(): void;
}