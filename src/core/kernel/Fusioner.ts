/**
 * Fusioner - Module de fusion des résultats
 * 
 * Pour l'instant, c'est un placeholder qui retourne simplement le résultat primaire.
 * Dans le futur Sprint, ce module sera amélioré pour :
 * - Combiner intelligemment les résultats de plusieurs experts
 * - Résoudre les conflits entre les réponses
 * - Synthétiser une réponse cohérente
 */

import { TaskResult } from '../router/RouterTypes';

interface FusionInput {
  primaryResult: TaskResult;
  expertResults: TaskResult[];
}

class Fusioner {
  /**
   * Fusionne les résultats de la tâche primaire et des experts
   * 
   * v1.0 (MVP): Retourne simplement le résultat primaire
   * v2.0 (TODO): Combinaison intelligente des résultats
   */
  public async fuse(input: FusionInput): Promise<string> {
    console.log(`[Fusioner] Fusion de 1 résultat primaire + ${input.expertResults.length} expert(s)`);
    
    // Pour l'instant, on retourne juste le résultat primaire
    const primaryContent = input.primaryResult.result || '';
    
    // Log des résultats experts pour debugging
    if (input.expertResults.length > 0) {
      const successfulExperts = input.expertResults.filter(r => r.status === 'success');
      console.log(`[Fusioner] Experts disponibles: ${successfulExperts.map(r => r.agentName).join(', ')}`);
      
      // TODO Sprint futur: Implémenter la fusion intelligente
      // - Détecter les compléments d'information
      // - Résoudre les contradictions
      // - Synthétiser une réponse enrichie
    }
    
    return primaryContent;
  }

  /**
   * Fusionne avec métadonnées enrichies (pour versions futures)
   */
  public async fuseWithMetadata(input: FusionInput): Promise<{
    content: string;
    sources: string[];
    confidence: number;
  }> {
    const content = await this.fuse(input);
    
    const sources = [
      input.primaryResult.agentName,
      ...input.expertResults
        .filter(r => r.status === 'success')
        .map(r => r.agentName)
    ];
    
    return {
      content,
      sources,
      confidence: 0.8 // Placeholder
    };
  }
}

// Instance singleton exportée
export const fusioner = new Fusioner();
