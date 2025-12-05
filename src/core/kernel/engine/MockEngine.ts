/**
 * MockEngine v2.0 - Simulation du Pipeline CPU/GPU avec Allocation Dynamique
 *
 * ARCHITECTURE:
 * - Génération asynchrone avec AsyncGenerator
 * - Simulation réaliste du pipelining CPU/GPU
 * - Gestion des ressources mémoire virtuelle
 * - Allocation/Free garantie même en cas d'erreur
 * - Support des modes de performance dynamiques
 */

import { memoryManager } from '../MemoryManager';
import { performanceTracker, PerformanceMode } from '../PerformanceTracker';

export type { PerformanceMode };

interface PerformanceProfile {
  speedMultiplier: number;  // 1.0 = baseline
  vramPerToken: number;     // MB
  maxConcurrency: number;   // Nombre de workers parallèles
  speculationLength: number; // Pour speculative decoding
  enableCache: boolean;
}

const PERFORMANCE_PROFILES: Record<PerformanceMode, PerformanceProfile> = {
  'ECO': {
    speedMultiplier: 0.5,  // 2x plus lent
    vramPerToken: 0.5,     // 2x moins de mémoire
    maxConcurrency: 1,
    speculationLength: 2,
    enableCache: true      // Cache agressif pour économiser
  },
  'BALANCED': {
    speedMultiplier: 1.0,
    vramPerToken: 1.0,
    maxConcurrency: 2,
    speculationLength: 4,
    enableCache: true
  },
  'PERFORMANCE': {
    speedMultiplier: 1.5,  // 33% plus rapide
    vramPerToken: 2.0,     // Plus de contexte
    maxConcurrency: 4,
    speculationLength: 6,
    enableCache: false     // Pas de cache, génération fraîche
  },
  'MAXIMUM': {
    speedMultiplier: 2.0,  // 2x plus rapide
    vramPerToken: 4.0,     // Charge tout en VRAM
    maxConcurrency: 8,
    speculationLength: 8,
    enableCache: false
  }
};

export class MockEngine {
  private currentMode: PerformanceMode = 'BALANCED';
  private modeChangeCallbacks: Array<(newMode: PerformanceMode) => void> = [];

  private getHardware(): string {
    // Simule un environnement mixte CPU/GPU
    return Math.random() > 0.5 ? 'CPU' : 'GPU';
  }

  public async *generate(
    prompt: string, 
    expert: string,
    mode: PerformanceMode = 'BALANCED'
  ): AsyncGenerator<string> {
    // Track mode change if needed
    if (mode !== this.currentMode) {
      performanceTracker.trackModeChange(this.currentMode, mode, 'User request');
      this.currentMode = mode;
    }
    
    const profile = PERFORMANCE_PROFILES[mode];
    
    console.log(`[MockEngine] Début de la génération pour ${expert} avec pipelining (mode: ${mode})...`);
    
    // Découpe le prompt en tokens (simulation simplifiée)
    const tokens = `Réponse simulée (pipelined, via ${this.getHardware()}, mode: ${mode}) de l'expert ${expert} pour le prompt : "${prompt}"`.split(' ');
    let nextTokenData: any = null; // Buffer du prochain token
    let tokenCount = 0;

    for (let i = 0; i < tokens.length; i++) {
      // ✅ Vérifie les conditions toutes les 10 tokens
      if (tokenCount % 10 === 0) {
        const newMode = this.checkAndAdjustMode();
        if (newMode !== this.currentMode) {
          console.log(`[MockEngine] Mode ajusté: ${this.currentMode} → ${newMode}`);
          performanceTracker.trackModeChange(this.currentMode, newMode, 'Dynamic adjustment');
          this.currentMode = newMode;
          const newProfile = PERFORMANCE_PROFILES[newMode];
          
          // Notifie les listeners
          this.modeChangeCallbacks.forEach(cb => cb(newMode));
        }
      }

      const tokenId = `${expert}-${Date.now()}-${i}`;
      const currentProfile = PERFORMANCE_PROFILES[this.currentMode];
      const vramPerToken = currentProfile.vramPerToken;
      
      // Alloue de la mémoire pour les activations du prochain token
      const allocated = memoryManager.allocateFromPool('activations', vramPerToken, tokenId);
      if (!allocated) {
        console.error("[MockEngine] PIPELINE STALL: Plus de mémoire d'activation !");
        // Implémente du backpressure avec timeout
        const startTime = Date.now();
        while (!memoryManager.allocateFromPool('activations', vramPerToken, tokenId)) {
          console.warn("[MockEngine] Backpressure: attente de libération mémoire...");
          await new Promise(r => setTimeout(r, 10)); // Attente active courte
          // Timeout après 500ms
          if (Date.now() - startTime > 500) throw new Error("Memory deadlock");
        }
      }

      try {
        // Prépare le prochain token (CPU)
        const prepareNext = i < tokens.length - 1 
          ? this.prepareTokenData(tokens[i + 1], `${tokenId}-next`, currentProfile) 
          : Promise.resolve();

        // Calcule le token actuel (GPU) en parallèle
        const currentToken = nextTokenData || await this.prepareTokenData(tokens[i], tokenId, currentProfile);
        const result = await this.computeToken(currentToken, currentProfile);

        // Les deux s'exécutent en parallèle !
        nextTokenData = await prepareNext;

        // Applique la vitesse selon le profil
        const baseSpeed = 20; // ms par token en mode BALANCED
        const speed = baseSpeed / currentProfile.speedMultiplier;
        await new Promise(r => setTimeout(r, speed));

        yield result + ' ';
        tokenCount++;
      } finally {
        // Garantit la libération même en cas d'erreur
        memoryManager.freeToPool('activations', vramPerToken, tokenId);
      }
    }
    console.log(`[MockEngine] Fin de la génération pour ${expert}.`);
  }

  private async prepareTokenData(token: string, tokenId: string, profile: PerformanceProfile): Promise<any> {
    // Simule allocation pour la préparation
    memoryManager.allocateFromPool('uniforms', profile.vramPerToken * 0.5, tokenId);
    try {
      // Temps de préparation selon le profil
      const prepTime = 5 / profile.speedMultiplier;
      await new Promise(r => setTimeout(r, prepTime)); // Simule CPU
      return { token, prepared: true, tokenId };
    } finally {
      memoryManager.freeToPool('uniforms', profile.vramPerToken * 0.5, tokenId);
    }
  }

  private async computeToken(data: any, profile: PerformanceProfile): Promise<string> {
    // Simule allocation pour le calcul
    memoryManager.allocateFromPool('kv-cache', profile.vramPerToken * 0.75, data.tokenId);
    try {
      // Temps de calcul selon le profil
      const computeTime = 15 / profile.speedMultiplier;
      await new Promise(r => setTimeout(r, computeTime)); // Simule GPU
      return data.token;
    } finally {
      memoryManager.freeToPool('kv-cache', profile.vramPerToken * 0.75, data.tokenId);
    }
  }

  private checkAndAdjustMode(): PerformanceMode {
    // Simulation d'ajustement dynamique basé sur l'état du device
    // Dans une implémentation réelle, cela utiliserait resourceManager.getStatus()
    return this.currentMode; // Pour la simulation, on garde le mode initial
  }

  public onModeChange(callback: (newMode: PerformanceMode) => void): void {
    this.modeChangeCallbacks.push(callback);
  }
}