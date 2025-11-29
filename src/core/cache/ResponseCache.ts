import { LRUCache } from 'lru-cache';
import { createLogger } from '../../lib/logger';

const log = createLogger('ResponseCache');

log.info('Initialisation du ResponseCache v1.0 (Elite)...');

type CachedResponse = {
  response: string;
  modelUsed: string;
  timestamp: number;
  tokens?: number;
};

/**
 * Simple hash function for generating cache keys
 * Uses a combination of djb2 and sdbm algorithms for better distribution
 */
function hashString(str: string): string {
  let hash1 = 5381;
  let hash2 = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char; // djb2
    hash2 = char + (hash2 << 6) + (hash2 << 16) - hash2; // sdbm
  }

  // Combine both hashes and convert to hex string
  const combined = Math.abs(hash1 ^ hash2);
  return combined.toString(16).padStart(8, '0');
}

class ResponseCache {
  private cache: LRUCache<string, CachedResponse>;
  private hits = 0;
  private misses = 0;

  constructor() {
    this.cache = new LRUCache<string, CachedResponse>({
      max: 100,
      ttl: 1000 * 60 * 30,
      updateAgeOnGet: true,
    });
  }

  private getCacheKey(prompt: string, modelKey: string): string {
    const data = `${modelKey.trim()}:${prompt.trim()}`;
    return `cache-${hashString(data)}`;
  }

  public get(prompt: string, modelKey: string): CachedResponse | null {
    const key = this.getCacheKey(prompt, modelKey);
    const cached = this.cache.get(key);

    if (cached) {
      this.hits++;
      log.info(`HIT! (Taux de succès: ${((this.hits / (this.hits + this.misses)) * 100).toFixed(1)}%)`);
      return cached;
    }

    this.misses++;
    log.debug('MISS.');
    return null;
  }

  public set(prompt: string, modelKey: string, response: string, tokens?: number): void {
    const key = this.getCacheKey(prompt, modelKey);
    this.cache.set(key, {
      response,
      modelUsed: modelKey,
      timestamp: Date.now(),
      tokens,
    });
    log.info(`Réponse pour ${modelKey} sauvegardée.`);
  }

  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    log.info('Cache vidé.');
  }

  public getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(1) : '0.0',
      size: this.cache.size,
    };
  }

  /**
   * Check if a prompt/model combination is cached
   */
  public has(prompt: string, modelKey: string): boolean {
    const key = this.getCacheKey(prompt, modelKey);
    return this.cache.has(key);
  }

  /**
   * Delete a specific cache entry
   */
  public delete(prompt: string, modelKey: string): boolean {
    const key = this.getCacheKey(prompt, modelKey);
    return this.cache.delete(key);
  }

  /**
   * Get the number of items in cache
   */
  public get size(): number {
    return this.cache.size;
  }
}

export const responseCache = new ResponseCache();
