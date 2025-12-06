/**
 * MetricsCollector - Collecteur centralisé de métriques et statistiques
 */

import { logger } from './LoggerService';

/**
 * Interface pour les métriques de performance
 */
export interface PerformanceMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalRetries: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  throughputPerSecond: number;
}

/**
 * Interface pour les métriques de cache
 */
export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  entries: number;
  size: number;
  maxSize: number;
}

/**
 * Interface pour les métriques de stockage
 */
export interface StorageMetrics {
  totalReads: number;
  totalWrites: number;
  totalDeletes: number;
  bytesRead: number;
  bytesWritten: number;
  averageReadTime: number;
  averageWriteTime: number;
}

/**
 * Interface pour l'historique des opérations
 */
interface OperationRecord {
  type: string;
  duration: number;
  timestamp: number;
  success: boolean;
  size?: number;
}

export class MetricsCollector {
  private performanceMetrics: PerformanceMetrics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    totalRetries: 0,
    averageLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    errorRate: 0,
    throughputPerSecond: 0,
  };

  private cacheMetrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    entries: 0,
    size: 0,
    maxSize: 0,
  };

  private storageMetrics: StorageMetrics = {
    totalReads: 0,
    totalWrites: 0,
    totalDeletes: 0,
    bytesRead: 0,
    bytesWritten: 0,
    averageReadTime: 0,
    averageWriteTime: 0,
  };

  private operationHistory: OperationRecord[] = [];
  private readonly MAX_HISTORY_SIZE = 1000;
  private latencies: number[] = [];

  /**
   * Enregistre une opération
   */
  public recordOperation(
    type: string,
    duration: number,
    success: boolean,
    size?: number
  ): void {
    const record: OperationRecord = {
      type,
      duration,
      timestamp: Date.now(),
      success,
      size,
    };

    this.operationHistory.push(record);

    // Limiter la taille de l'historique
    if (this.operationHistory.length > this.MAX_HISTORY_SIZE) {
      this.operationHistory = this.operationHistory.slice(-this.MAX_HISTORY_SIZE);
    }

    // Mettre à jour les métriques
    this.performanceMetrics.totalOperations++;
    if (success) {
      this.performanceMetrics.successfulOperations++;
    } else {
      this.performanceMetrics.failedOperations++;
    }

    // Ajouter la latence
    this.latencies.push(duration);
    if (this.latencies.length > 10000) {
      this.latencies = this.latencies.slice(-10000);
    }

    // Recalculer les métriques
    this.recalculateMetrics();
  }

  /**
   * Enregistre un retry
   */
  public recordRetry(): void {
    this.performanceMetrics.totalRetries++;
  }

  /**
   * Enregistre un hit de cache
   */
  public recordCacheHit(): void {
    this.cacheMetrics.hits++;
    this.recalculateCacheMetrics();
  }

  /**
   * Enregistre un miss de cache
   */
  public recordCacheMiss(): void {
    this.cacheMetrics.misses++;
    this.recalculateCacheMetrics();
  }

  /**
   * Met à jour les métriques de cache
   */
  public updateCacheMetrics(entries: number, size: number, maxSize: number): void {
    this.cacheMetrics.entries = entries;
    this.cacheMetrics.size = size;
    this.cacheMetrics.maxSize = maxSize;
    this.recalculateCacheMetrics();
  }

  /**
   * Enregistre une opération de lecture
   */
  public recordRead(size: number, duration: number): void {
    this.storageMetrics.totalReads++;
    this.storageMetrics.bytesRead += size;
    
    // Mettre à jour le temps moyen de lecture
    const totalReadTime = this.storageMetrics.averageReadTime * (this.storageMetrics.totalReads - 1) + duration;
    this.storageMetrics.averageReadTime = totalReadTime / this.storageMetrics.totalReads;
  }

  /**
   * Enregistre une opération d'écriture
   */
  public recordWrite(size: number, duration: number): void {
    this.storageMetrics.totalWrites++;
    this.storageMetrics.bytesWritten += size;
    
    // Mettre à jour le temps moyen d'écriture
    const totalWriteTime = this.storageMetrics.averageWriteTime * (this.storageMetrics.totalWrites - 1) + duration;
    this.storageMetrics.averageWriteTime = totalWriteTime / this.storageMetrics.totalWrites;
  }

  /**
   * Enregistre une suppression
   */
  public recordDelete(): void {
    this.storageMetrics.totalDeletes++;
  }

  /**
   * Recalcule les métriques de performance
   */
  private recalculateMetrics(): void {
    if (this.latencies.length > 0) {
      // Calculer la latence moyenne
      const totalLatency = this.latencies.reduce((sum, latency) => sum + latency, 0);
      this.performanceMetrics.averageLatencyMs = totalLatency / this.latencies.length;

      // Calculer les percentiles
      const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
      this.performanceMetrics.p50LatencyMs = this.calculatePercentile(sortedLatencies, 50);
      this.performanceMetrics.p95LatencyMs = this.calculatePercentile(sortedLatencies, 95);
      this.performanceMetrics.p99LatencyMs = this.calculatePercentile(sortedLatencies, 99);

      // Calculer le taux d'erreur
      this.performanceMetrics.errorRate = this.performanceMetrics.totalOperations > 0 ?
        this.performanceMetrics.failedOperations / this.performanceMetrics.totalOperations : 0;
    }
  }

  /**
   * Recalcule les métriques de cache
   */
  private recalculateCacheMetrics(): void {
    const total = this.cacheMetrics.hits + this.cacheMetrics.misses;
    this.cacheMetrics.hitRate = total > 0 ? this.cacheMetrics.hits / total : 0;
  }

  /**
   * Calcule un percentile
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Obtient les métriques de performance
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Obtient les métriques de cache
   */
  public getCacheMetrics(): CacheMetrics {
    return { ...this.cacheMetrics };
  }

  /**
   * Obtient les métriques de stockage
   */
  public getStorageMetrics(): StorageMetrics {
    return { ...this.storageMetrics };
  }

  /**
   * Obtient l'historique des opérations
   */
  public getOperationHistory(): OperationRecord[] {
    return [...this.operationHistory];
  }

  /**
   * Réinitialise toutes les métriques
   */
  public reset(): void {
    this.performanceMetrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      totalRetries: 0,
      averageLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      errorRate: 0,
      throughputPerSecond: 0,
    };

    this.cacheMetrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      entries: 0,
      size: 0,
      maxSize: 0,
    };

    this.storageMetrics = {
      totalReads: 0,
      totalWrites: 0,
      totalDeletes: 0,
      bytesRead: 0,
      bytesWritten: 0,
      averageReadTime: 0,
      averageWriteTime: 0,
    };

    this.operationHistory = [];
    this.latencies = [];

    logger.info('MetricsCollector', 'Toutes les métriques ont été réinitialisées');
  }
}