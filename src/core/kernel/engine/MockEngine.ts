/**
 * MockEngine v1.0 - Simulation du Pipeline CPU/GPU
 *
 * ARCHITECTURE:
 * - Génération asynchrone avec AsyncGenerator
 * - Simulation réaliste du pipelining CPU/GPU
 * - Gestion des ressources mémoire virtuelle
 * - Allocation/Free garantie même en cas d'erreur
 */

import { memoryManager } from '../MemoryManager';

export class MockEngine {
  private getHardware(): string {
    // Simule un environnement mixte CPU/GPU
    return Math.random() > 0.5 ? 'CPU' : 'GPU';
  }

  public async *generate(prompt: string, expert: string): AsyncGenerator<string> {
    console.log(`[MockEngine] Début de la génération pour ${expert} avec pipelining...`);
    
    // Découpe le prompt en tokens (simulation simplifiée)
    const tokens = `Réponse simulée (pipelined, via ${this.getHardware()}) de l'expert ${expert} pour le prompt : "${prompt}"`.split(' ');
    let nextTokenData: any = null; // Buffer du prochain token

    for (let i = 0; i < tokens.length; i++) {
      const tokenId = `${expert}-${Date.now()}-${i}`;
      
      // Alloue de la mémoire pour les activations du prochain token
      const allocated = memoryManager.allocateFromPool('activations', 2, tokenId); // Simule 2MB par token
      if (!allocated) {
        console.error("[MockEngine] PIPELINE STALL: Plus de mémoire d'activation !");
        // Implémente du backpressure avec timeout
        const startTime = Date.now();
        while (!memoryManager.allocateFromPool('activations', 2, tokenId)) {
          console.warn("[MockEngine] Backpressure: attente de libération mémoire...");
          await new Promise(r => setTimeout(r, 10)); // Attente active courte
          // Timeout après 500ms
          if (Date.now() - startTime > 500) throw new Error("Memory deadlock");
        }
      }

      try {
        // Prépare le prochain token (CPU)
        const prepareNext = i < tokens.length - 1 
          ? this.prepareTokenData(tokens[i + 1], `${tokenId}-next`) 
          : Promise.resolve();

        // Calcule le token actuel (GPU) en parallèle
        const currentToken = nextTokenData || await this.prepareTokenData(tokens[i], tokenId);
        const result = await this.computeToken(currentToken);

        // Les deux s'exécutent en parallèle !
        nextTokenData = await prepareNext;

        yield result + ' ';
      } finally {
        // Garantit la libération même en cas d'erreur
        memoryManager.freeToPool('activations', 2, tokenId);
      }
    }
    console.log(`[MockEngine] Fin de la génération pour ${expert}.`);
  }

  private async prepareTokenData(token: string, tokenId: string): Promise<any> {
    // Simule allocation pour la préparation
    memoryManager.allocateFromPool('uniforms', 1, tokenId);
    try {
      await new Promise(r => setTimeout(r, 5)); // Simule CPU
      return { token, prepared: true, tokenId };
    } finally {
      memoryManager.freeToPool('uniforms', 1, tokenId);
    }
  }

  private async computeToken(data: any): Promise<string> {
    // Simule allocation pour le calcul
    memoryManager.allocateFromPool('kv-cache', 3, data.tokenId);
    try {
      await new Promise(r => setTimeout(r, 15)); // Simule GPU
      return data.token;
    } finally {
      memoryManager.freeToPool('kv-cache', 3, data.tokenId);
    }
  }
}