// Utilisation conditionnelle de LRUCache
let LRUCache: any;
try {
  const module = require('lru-cache');
  LRUCache = module.LRUCache || module.default || module;
} catch (e) {
  console.warn('[ResponseCache] lru-cache non disponible, utilisation Map simple');
}

type CachedResponse = {
  response: string;
  tokens: number;
  timestamp: number;
  modelUsed: string;
};

/**
 * Hash isomorphe SHA-256 (Browser SubtleCrypto + Node crypto)
 */
async function sha256Hex(input: string): Promise<string> {
  // Browser avec SubtleCrypto
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  // Node avec crypto module (if available)
  if (typeof require !== 'undefined') {
    try {
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(input).digest('hex');
    } catch (e) {
      // Fallback si crypto n'est pas disponible
    }
  }
  
  // Fallback simple (non cryptographique, mais fonctionnel)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * ResponseCache avec LRU eviction et TTL configurable
 */
class ResponseCache {
  private cache: any; // LRUCache ou Map fallback
  private hits = 0;
  private misses = 0;

  constructor() {
    if (LRUCache) {
      this.cache = new LRUCache({
        max: 100,                    // 100 réponses max
        maxSize: 50 * 1024 * 1024,   // 50MB max
        sizeCalculation: (value: any) => JSON.stringify(value).length,
        ttl: 1000 * 60 * 30,          // 30min par défaut
        updateAgeOnGet: true,         // LRU: met à jour à chaque get
        allowStale: false
      });
      console.log('[ResponseCache] 💾 Cache LRU initialisé (max: 100 items, 50MB, TTL: 30min)');
    } else {
      // Fallback sur Map simple
      this.cache = new Map<string, CachedResponse>();
      console.log('[ResponseCache] 💾 Cache Map simple initialisé (fallback)');
    }
  }

  /**
   * Cherche une réponse en cache
   */
  public async get(prompt: string, modelKey: string): Promise<CachedResponse | null> {
    const key = await sha256Hex(`${modelKey}:${prompt}`);
    const cached = this.cache.get(key);

    if (cached) {
      this.hits++;
      const hitRate = ((this.hits / (this.hits + this.misses)) * 100).toFixed(1);
      console.log(`[Cache] ✅ HIT ${hitRate}% (age: ${Math.floor((Date.now() - cached.timestamp) / 1000)}s)`);
      return cached;
    }

    this.misses++;
    console.log(`[Cache] ❌ MISS`);
    return null;
  }

  /**
   * Stocke une réponse en cache
   */
  public async set(
    prompt: string,
    modelKey: string,
    response: string,
    tokens: number,
    ttl?: number
  ): Promise<void> {
    const key = await sha256Hex(`${modelKey}:${prompt}`);
    
    const cached: CachedResponse = {
      response,
      tokens,
      timestamp: Date.now(),
      modelUsed: modelKey
    };

    // ✅ LRU cache avec options, Map simple sans options
    if (LRUCache && ttl) {
      this.cache.set(key, cached, { ttl });
    } else {
      this.cache.set(key, cached);
    }

    const maxSize = this.cache.max || 100; // ✅ Fallback pour Map
    console.log(`[Cache] 💾 Saved ${tokens} tokens (size: ${this.cache.size}/${maxSize})`);
  }

  /**
   * Statistiques du cache
   */
  public getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.max || 100, // ✅ Fallback pour Map (pas de .max)
      hitRate: this.hits / (this.hits + this.misses) || 0,
      hits: this.hits,
      misses: this.misses
    };
  }

  /**
   * Vide le cache (utile pour tests)
   */
  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    console.log('[Cache] 🗑️ Cache vidé');
  }
}

export const responseCache = new ResponseCache();
