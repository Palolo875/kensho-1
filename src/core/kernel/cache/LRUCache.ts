/**
 * LRUCache - Cache mémoire observable avec statistiques
 *
 * Implémente un cache LRU (Least Recently Used) avec des statistiques d'utilisation
 */

export class LRUCache<T> {
  private cache: Map<string, { value: T, timestamp: number }> = new Map();
  private readonly maxSize: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  public get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      this.hits++;
      // Mettre à jour le timestamp pour LRU
      entry.timestamp = Date.now();
      return entry.value;
    }
    this.misses++;
    return undefined;
  }

  public set(key: string, value: T): void {
    // Éviction LRU si nécessaire
    if (this.cache.size >= this.maxSize) {
      let oldestKey = '';
      let oldestTimestamp = Infinity;
      
      for (const [k, v] of this.cache.entries()) {
        if (v.timestamp < oldestTimestamp) {
          oldestTimestamp = v.timestamp;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
        console.log(`[LRUCache] Éviction du graphe: ${oldestKey}`);
      }
    }
    
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  public getStats(): { size: number, hits: number, misses: number, hitRate: number } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;
    
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: parseFloat(hitRate.toFixed(4))
    };
  }

  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}