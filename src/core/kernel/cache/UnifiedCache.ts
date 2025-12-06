/**
 * UnifiedCache - Gestionnaire de cache unifié avec politique LRU
 */

import { logger } from '../monitoring/LoggerService';

/**
 * Interface pour les entrées du cache LRU
 */
interface LRUCacheEntry<T> {
  key: string;
  value: T;
  size: number;
  lastAccessed: number;
}

/**
 * Options de configuration du cache
 */
export interface CacheConfig {
  maxSizeBytes: number;
  maxEntries?: number;
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSizeBytes: 50 * 1024 * 1024, // 50MB par défaut
  maxEntries: 1000,
};

export class UnifiedCache<T> {
  private cache: Map<string, LRUCacheEntry<T>> = new Map();
  private config: CacheConfig;
  private currentSize: number = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Récupère une valeur du cache
   */
  public get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      logger.debug('UnifiedCache', `Cache miss for key: ${key}`);
      return null;
    }

    // Mettre à jour le timestamp d'accès
    entry.lastAccessed = Date.now();
    logger.debug('UnifiedCache', `Cache hit for key: ${key}`);
    return entry.value;
  }

  /**
   * Stocke une valeur dans le cache
   */
  public set(key: string, value: T, size: number = 0): void {
    // Supprimer l'ancienne entrée si elle existe
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.currentSize -= oldEntry.size;
      this.cache.delete(key);
    }

    // Éviction si nécessaire
    while ((this.currentSize + size > this.config.maxSizeBytes || 
            this.cache.size >= (this.config.maxEntries || 1000)) && 
           this.cache.size > 0) {
      this.evictLRU();
    }

    // Ne pas mettre en cache si la taille dépasse le max
    if (size > this.config.maxSizeBytes) {
      logger.debug('UnifiedCache', `Item too large for cache: ${size} bytes`);
      return;
    }

    this.cache.set(key, {
      key,
      value,
      size,
      lastAccessed: Date.now(),
    });
    this.currentSize += size;
    
    logger.debug('UnifiedCache', `Item cached: ${key} (${size} bytes)`);
  }

  /**
   * Supprime une entrée du cache
   */
  public delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(key);
      logger.debug('UnifiedCache', `Item deleted from cache: ${key}`);
      return true;
    }
    return false;
  }

  /**
   * Vérifie si une clé existe dans le cache
   */
  public has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Vide le cache
   */
  public clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    logger.info('UnifiedCache', 'Cache cleared');
  }

  /**
   * Éviction LRU (Least Recently Used)
   */
  private evictLRU(): void {
    let oldest: LRUCacheEntry<T> | null = null;
    let oldestKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.lastAccessed < oldest.lastAccessed) {
        oldest = entry;
        oldestKey = key;
      }
    }

    if (oldestKey && oldest) {
      this.currentSize -= oldest.size;
      this.cache.delete(oldestKey);
      logger.debug('UnifiedCache', `LRU eviction: ${oldestKey}`);
    }
  }

  /**
   * Obtient les statistiques du cache
   */
  public getStats(): { entries: number; size: number; maxSize: number; usagePercent: number } {
    return {
      entries: this.cache.size,
      size: this.currentSize,
      maxSize: this.config.maxSizeBytes,
      usagePercent: (this.currentSize / this.config.maxSizeBytes) * 100,
    };
  }

  /**
   * Configure la taille maximale du cache
   */
  public setMaxSize(maxSizeBytes: number): void {
    this.config.maxSizeBytes = maxSizeBytes;
    // Éviction si nécessaire après changement de taille
    while (this.currentSize > this.config.maxSizeBytes && this.cache.size > 0) {
      this.evictLRU();
    }
  }
}