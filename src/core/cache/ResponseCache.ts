import { LRUCache } from 'lru-cache';
import { v5 as uuidv5 } from 'uuid';
import { createLogger } from '../../lib/logger';

const log = createLogger('ResponseCache');

log.info('Initialisation du ResponseCache v1.0 (Elite)...');

const CACHE_NAMESPACE = 'f5b4b7a0-9b3c-4b1e-8b0a-0e1e2e3e4f5a';

type CachedResponse = {
  response: string;
  modelUsed: string;
  timestamp: number;
  tokens?: number;
};

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
    return uuidv5(data, CACHE_NAMESPACE);
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
}

export const responseCache = new ResponseCache();
