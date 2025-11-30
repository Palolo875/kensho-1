import { LRUCache } from 'lru-cache';
import { createLogger } from '../../lib/logger';

const log = createLogger('ResponseCache');

log.info('Initialisation du ResponseCache v2.0 (SHA-256 Hashing)...');

type CachedResponse = {
  response: string;
  modelUsed: string;
  timestamp: number;
  tokens?: number;
  promptHash?: string;
};

/**
 * SHA-256 hash using Web Crypto API
 * Fallback to simple hash for environments without Web Crypto
 */
async function hashPrompt(prompt: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(prompt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16); // Use first 16 chars for shorter keys
  } catch {
    // Fallback: simple hash if Web Crypto not available
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

class ResponseCache {
  private cache: LRUCache<string, CachedResponse>;
  private hits = 0;
  private misses = 0;
  private hashCache: Map<string, string> = new Map();

  constructor() {
    this.cache = new LRUCache<string, CachedResponse>({
      max: 100,
      ttl: 1000 * 60 * 30,
      updateAgeOnGet: true,
    });
  }

  /**
   * Generate cache key using SHA-256 hash
   */
  private async getCacheKey(prompt: string, modelKey: string): Promise<string> {
    const promptKey = `${modelKey.trim()}:${prompt.trim()}`;
    
    // Check hash cache first
    if (this.hashCache.has(promptKey)) {
      return `cache-${this.hashCache.get(promptKey)}`;
    }

    const hash = await hashPrompt(prompt);
    this.hashCache.set(promptKey, hash);
    return `cache-${modelKey.trim()}::${hash}`;
  }

  public async get(prompt: string, modelKey: string): Promise<CachedResponse | null> {
    const key = await this.getCacheKey(prompt, modelKey);
    const cached = this.cache.get(key);

    if (cached) {
      this.hits++;
      const hitRate = ((this.hits / (this.hits + this.misses)) * 100).toFixed(1);
      log.info(`HIT! (Taux de succès: ${hitRate}%)`);
      return cached;
    }

    this.misses++;
    log.debug('MISS.');
    return null;
  }

  public async set(prompt: string, modelKey: string, response: string, tokens?: number): Promise<void> {
    const key = await this.getCacheKey(prompt, modelKey);
    const hash = await hashPrompt(prompt);
    
    this.cache.set(key, {
      response,
      modelUsed: modelKey,
      timestamp: Date.now(),
      tokens,
      promptHash: hash,
    });
    log.info(`Réponse pour ${modelKey} sauvegardée (hash: ${hash.substring(0, 8)}...)`);
  }

  /**
   * Check if a prompt/model combination is cached
   */
  public async has(prompt: string, modelKey: string): Promise<boolean> {
    const key = await this.getCacheKey(prompt, modelKey);
    return this.cache.has(key);
  }

  /**
   * Delete a specific cache entry
   */
  public async delete(prompt: string, modelKey: string): Promise<boolean> {
    const key = await this.getCacheKey(prompt, modelKey);
    return this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries for a specific model
   */
  public invalidateModel(modelKey: string): number {
    let count = 0;
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      const value = this.cache.get(key);
      if (value && value.modelUsed === modelKey) {
        this.cache.delete(key);
        count++;
      }
    }
    log.info(`Invalidation du cache pour ${modelKey}: ${count} entrées supprimées`);
    return count;
  }

  /**
   * Invalidate all cache entries older than a specific timestamp
   * Useful for sensitive data cleanup
   */
  public invalidateOlderThan(timestamp: number): number {
    let count = 0;
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      const value = this.cache.get(key);
      if (value && value.timestamp < timestamp) {
        this.cache.delete(key);
        count++;
      }
    }
    log.info(`Suppression des entrées antérieures à ${new Date(timestamp).toISOString()}: ${count} entrées`);
    return count;
  }

  /**
   * Clear all cache entries
   */
  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.hashCache.clear();
    log.info('Cache complètement vidé.');
  }

  /**
   * Get all cache keys (debug/monitoring)
   */
  public getAllKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all entries for a specific model
   */
  public getEntriesByModel(modelKey: string): CachedResponse[] {
    const results: CachedResponse[] = [];
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      const value = this.cache.get(key);
      if (value && value.modelUsed === modelKey) {
        results.push(value);
      }
    }
    return results;
  }

  /**
   * Get comprehensive cache statistics
   */
  public getStats() {
    const total = this.hits + this.misses;
    const keys = Array.from(this.cache.keys());
    const modelDistribution: Record<string, number> = {};
    let totalTokens = 0;

    for (const key of keys) {
      const value = this.cache.get(key);
      if (value) {
        const model = value.modelUsed;
        modelDistribution[model] = (modelDistribution[model] || 0) + 1;
        totalTokens += value.tokens || 0;
      }
    }

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(1) : '0.0',
      size: this.cache.size,
      maxSize: 100,
      totalTokens,
      modelDistribution,
      hashCacheSize: this.hashCache.size,
    };
  }

  /**
   * Log detailed cache statistics
   */
  public logStats(): void {
    const stats = this.getStats();
    log.info(
      `📊 Cache Stats: ${stats.size}/${stats.maxSize} entrées, ` +
      `${stats.hits} hits, ${stats.misses} misses (${stats.hitRate}% hit rate), ` +
      `${stats.totalTokens} tokens total`
    );
    
    if (Object.keys(stats.modelDistribution).length > 0) {
      const modelStats = Object.entries(stats.modelDistribution)
        .map(([model, count]) => `${model}: ${count}`)
        .join(', ');
      log.info(`📦 Par modèle: ${modelStats}`);
    }
  }

  /**
   * Get the number of items in cache
   */
  public get size(): number {
    return this.cache.size;
  }

  /**
   * Get current hit rate percentage
   */
  public get hitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? (this.hits / total) * 100 : 0;
  }
}

export const responseCache = new ResponseCache();
