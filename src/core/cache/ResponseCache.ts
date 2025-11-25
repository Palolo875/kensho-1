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
  expiresAt?: number; // ✅ Pour TTL dans Map fallback
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
  private readonly DEFAULT_TTL = 1000 * 60 * 30; // 30 minutes
  private readonly MAX_MAP_SIZE = 100;
  private sweepIntervalId: any = null;

  constructor() {
    if (LRUCache) {
      this.cache = new LRUCache({
        max: 100,                    // 100 réponses max
        maxSize: 50 * 1024 * 1024,   // 50MB max
        sizeCalculation: (value: any) => JSON.stringify(value).length,
        ttl: this.DEFAULT_TTL,
        updateAgeOnGet: true,         // LRU: met à jour à chaque get
        allowStale: false
      });
      console.log('[ResponseCache] 💾 Cache LRU initialisé (max: 100 items, 50MB, TTL: 30min)');
    } else {
      // Fallback sur Map simple avec TTL eviction
      this.cache = new Map<string, CachedResponse>();
      this.startPeriodicSweep(); // ✅ Nettoyage périodique
      console.log('[ResponseCache] 💾 Cache Map simple initialisé avec TTL eviction (fallback)');
    }
  }

  /**
   * Démarre un nettoyage périodique pour Map fallback (éviction TTL + taille max)
   */
  private startPeriodicSweep(): void {
    // Nettoyage toutes les 5 minutes
    this.sweepIntervalId = setInterval(() => {
      this.sweepExpiredEntries();
    }, 1000 * 60 * 5);

    console.log('[ResponseCache] 🧹 Periodic sweep démarré (nettoyage toutes les 5min)');
  }

  /**
   * Nettoie les entrées expirées et applique la limite de taille (Map fallback)
   */
  private sweepExpiredEntries(): void {
    if (LRUCache) return; // Seulement pour Map fallback

    const now = Date.now();
    let cleaned = 0;

    // 1. Nettoyer les entrées expirées
    const mapCache = this.cache as Map<string, CachedResponse>;
    for (const [key, value] of mapCache.entries()) {
      if (value.expiresAt && value.expiresAt < now) {
        mapCache.delete(key);
        cleaned++;
      }
    }

    // 2. Si toujours trop d'entrées, supprimer les plus anciennes (LRU)
    if (mapCache.size > this.MAX_MAP_SIZE) {
      const entries = Array.from(mapCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp); // Plus ancien en premier
      
      const toDelete = entries.slice(0, mapCache.size - this.MAX_MAP_SIZE);
      for (const [key] of toDelete) {
        mapCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[ResponseCache] 🧹 Nettoyé ${cleaned} entrées (size: ${this.cache.size}/${this.MAX_MAP_SIZE})`);
    }
  }

  /**
   * Cherche une réponse en cache
   */
  public async get(prompt: string, modelKey: string): Promise<CachedResponse | null> {
    const key = await sha256Hex(`${modelKey}:${prompt}`);
    const cached = this.cache.get(key);

    if (cached) {
      // ✅ Vérifier expiration pour Map fallback
      if (!LRUCache && cached.expiresAt && cached.expiresAt < Date.now()) {
        this.cache.delete(key);
        this.misses++;
        console.log(`[Cache] ⏰ EXPIRED`);
        return null;
      }

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
    
    const effectiveTTL = ttl || this.DEFAULT_TTL;
    const cached: CachedResponse = {
      response,
      tokens,
      timestamp: Date.now(),
      modelUsed: modelKey,
      expiresAt: !LRUCache ? Date.now() + effectiveTTL : undefined // ✅ TTL pour Map
    };

    // ✅ LRU cache avec options, Map simple avec expiresAt
    if (LRUCache && ttl) {
      this.cache.set(key, cached, { ttl });
    } else {
      this.cache.set(key, cached);
    }

    const maxSize = this.cache.max || this.MAX_MAP_SIZE; // ✅ Fallback pour Map
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
