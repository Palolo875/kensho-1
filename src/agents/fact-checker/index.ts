/**
 * FactCheckerAgent - Sprint 9
 * 
 * Responsabilité: Vérifier les faits dans les textes
 * Phase 1 (actuelle): Extraction robuste de claims via méthode hybride
 * Phase 2 (future): Vérification des claims contre des sources
 * 
 * Approche:
 * - Extraction LLM + fallback règles déterministes
 * - Aucune dépendance externe pour la phase 1
 * - Extensible pour ajouter la vérification plus tard
 */

import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { HybridClaimExtractor } from './HybridClaimExtractor';

export interface VerificationResult {
  claim: string;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'CONTRADICTED' | 'UNVERIFIABLE';
  evidence?: string;
  confidence?: number;
}

runAgent({
  name: 'FactCheckerAgent',

  init: (runtime: AgentRuntime) => {
    runtime.log('info', '[FactCheckerAgent] Initialisation - Extraction hybride de claims activée');

    const hybridExtractor = new HybridClaimExtractor(runtime);

    /**
     * Vérifie les faits dans un texte
     * Phase 1: Extraction robuste de claims
     * Phase 2 (futur): Vérification contre sources
     */
    runtime.registerMethod('verify', async (payload: { text: string }): Promise<VerificationResult[]> => {
      const { text } = payload;

      runtime.log('info', `[FactCheckerAgent] Vérification de texte (${text.length} chars)`);

      if (!text || text.trim().length === 0) {
        runtime.log('warn', '[FactCheckerAgent] Empty text provided');
        return [];
      }

      try {
        // Phase 1 : Extraction des claims (implémenté)
        const claims = await hybridExtractor.extract(text);

        if (claims.length === 0) {
          runtime.log('info', '[FactCheckerAgent] Aucun claim extrait');
          return [];
        }

        runtime.log('info', `[FactCheckerAgent] ${claims.length} claims extraits, en attente de vérification`);

        // Phase 2 (futur) : Vérifier chaque claim
        // const verificationResults = await Promise.all(
        //   claims.map(claim => this.verifyClaimAgainstSources(claim))
        // );
        // return verificationResults;

        // Placeholder pour fin Phase 1 :
        return claims.map(
          (claim): VerificationResult => ({
            claim,
            status: 'PENDING_VERIFICATION',
            evidence: undefined,
            confidence: undefined
          })
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Erreur inconnue');
        runtime.log('error', `[FactCheckerAgent] Erreur lors de la vérification: ${err.message}`);
        throw err;
      }
    });

    /**
     * Extracteur simple pour obtenir juste les claims (utile pour debug)
     */
    runtime.registerMethod('extractClaims', async (payload: { text: string }): Promise<string[]> => {
      const { text } = payload;

      runtime.log('info', `[FactCheckerAgent] Extraction de claims uniquement`);

      if (!text || text.trim().length === 0) {
        return [];
      }

      try {
        const claims = await hybridExtractor.extract(text);
        runtime.log('info', `[FactCheckerAgent] ${claims.length} claims extraits`);
        return claims;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Erreur inconnue');
        runtime.log('error', `[FactCheckerAgent] Erreur extraction: ${err.message}`);
        throw err;
      }
    });
  }
});
