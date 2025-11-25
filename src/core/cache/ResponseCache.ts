// src/core/cache/ResponseCache.ts

import { LRUCache } from 'lru-cache';
import { v5 as uuidv5 } from 'uuid';

console.log("💾✨ Initialisation du ResponseCache v1.0 (Elite)...");

// Namespace unique pour notre hashing, pour éviter les collisions
const CACHE_NAMESPACE = 'f5b4b7a0-9b3c-4b1e-8b0a-0e1e2e3e4f5a';

type CachedResponse = {
  response: string;
  modelUsed: string;
  timestamp: number;
  tokens?: number; // Nombre de tokens générés
};

/**
 * Cache intelligent des réponses LLM avec une politique d'éviction LRU.
 */
class ResponseCache {
  private cache: LRUCache<string, CachedResponse>;
  private hits = 0;
  private misses = 0;

  constructor() {
    this.cache = new LRUCache<string, CachedResponse>({
      max: 100, // Garde les 100 réponses les plus récentes
      ttl: 1000 * 60 * 30, // TTL de 30 minutes par défaut
      updateAgeOnGet: true, // Remet le TTL à zéro à chaque accès
    });
  }

  /**
   * Crée une clé de cache unique et déterministe pour un prompt et un modèle.
   */
  private getCacheKey(prompt: string, modelKey: string): string {
    const data = `${modelKey.trim()}:${prompt.trim()}`;
    return uuidv5(data, CACHE_NAMESPACE);
  }

  /**
   * Récupère une réponse depuis le cache.
   * @returns La réponse cachée ou `null` si non trouvée.
   */
  public get(prompt: string, modelKey: string): CachedResponse | null {
    const key = this.getCacheKey(prompt, modelKey);
    const cached = this.cache.get(key);

    if (cached) {
      this.hits++;
      console.log(`[Cache] ✅ HIT! (Taux de succès: ${((this.hits / (this.hits + this.misses)) * 100).toFixed(1)}%)`);
      return cached;
    }

    this.misses++;
    console.log(`[Cache] ❌ MISS.`);
    return null;
  }

  /**
   * Ajoute une nouvelle réponse au cache.
   * @param prompt - Prompt utilisateur
   * @param modelKey - Modèle utilisé
   * @param response - Réponse générée
   * @param tokens - Nombre de tokens générés (optionnel)
   */
  public set(prompt: string, modelKey: string, response: string, tokens?: number): void {
    const key = this.getCacheKey(prompt, modelKey);
    this.cache.set(key, {
      response,
      modelUsed: modelKey,
      timestamp: Date.now(),
      tokens,
    });
    console.log(`[Cache] 💾 Réponse pour ${modelKey} sauvegardée.`);
  }

  /**
   * Vide complètement le cache.
   */
  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    console.log("[Cache] Cache vidé.");
  }

  /**
   * Obtient les statistiques du cache
   */
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
