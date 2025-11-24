/**
 * FactCheckerAgent - Sprint 9
 * 
 * Responsabilité: Vérifier les faits dans les textes
 * Phase 1: Extraction robuste de claims via méthode hybride ✅
 * Phase 2: Vérification des claims contre sources ✅
 * 
 * Approche:
 * - Extraction LLM + fallback règles déterministes
 * - Recherche sémantique + vérification LLM
 * - Résultats nuancés (VERIFIED, CONTRADICTED, AMBIGUOUS, UNKNOWN)
 */

import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { HybridClaimExtractor } from './HybridClaimExtractor';
import type { VerificationResult } from '../../types/verification';
import { CLAIM_VERIFIER_PROMPT } from '../personas/claim-verifier-prompt';

runAgent({
  name: 'FactCheckerAgent',

  init: (runtime: AgentRuntime) => {
    runtime.log('info', '[FactCheckerAgent] Initialisation - Extraction hybride de claims activée');

    const hybridExtractor = new HybridClaimExtractor(runtime);

    /**
     * Vérifie les faits dans un texte
     * Phase 1: Extraction robuste de claims ✅
     * Phase 2: Vérification sémantique + LLM ✅
     */
    runtime.registerMethod('verify', async (payload: { text: string }): Promise<VerificationResult[]> => {
      const { text } = payload;

      runtime.log('info', `[FactCheckerAgent] Vérification de texte (${text.length} chars)`);

      if (!text || text.trim().length === 0) {
        runtime.log('warn', '[FactCheckerAgent] Empty text provided');
        return [];
      }

      try {
        // Phase 1 : Extraction des claims
        const claims = await hybridExtractor.extract(text);

        if (claims.length === 0) {
          runtime.log('info', '[FactCheckerAgent] Aucun claim extrait');
          return [];
        }

        runtime.log('info', `[FactCheckerAgent] ${claims.length} claims extraits, début vérification...`);

        // Phase 2 : Vérifier chaque claim contre les sources
        const verificationResults: VerificationResult[] = [];

        for (const claim of claims) {
          try {
            // 1. Génère embedding du claim
            const embeddingAgent = await runtime.callAgent(
              'EmbeddingAgent',
              'embed',
              [{ text: claim }],
              10000
            ) as any;

            if (!embeddingAgent || !embeddingAgent.embedding) {
              runtime.log('warn', `[FactCheckerAgent] No embedding for claim: ${claim}`);
              verificationResults.push({
                claim,
                status: 'UNKNOWN',
                confidenceScore: 0,
                evidence: null
              });
              continue;
            }

            // 2. Recherche sémantique pour trouver les candidats
            const searchResults = await runtime.callAgent(
              'GraphWorker',
              'findEvidence',
              [{ embedding: embeddingAgent.embedding }],
              15000
            ) as any[];

            if (!searchResults || searchResults.length === 0) {
              runtime.log('info', `[FactCheckerAgent] No evidence found for: ${claim}`);
              verificationResults.push({
                claim,
                status: 'UNKNOWN',
                confidenceScore: 0,
                evidence: null
              });
              continue;
            }

            // 3. Extrait le contenu des candidats
            const candidateMemories = searchResults
              .map((r: any) => r.node?.metadata?.content || r.node?.content || '')
              .filter((c: string) => c.length > 0);

            if (candidateMemories.length === 0) {
              verificationResults.push({
                claim,
                status: 'UNKNOWN',
                confidenceScore: 0,
                evidence: null
              });
              continue;
            }

            // 4. Vérification LLM (juge factuel)
            const verifierPrompt = CLAIM_VERIFIER_PROMPT(claim, candidateMemories);
            const verdict = await runtime.callAgent(
              'MainLLMAgent',
              'generateSingleResponse',
              [verifierPrompt],
              10000
            ) as string;

            const verdictTrimmed = (verdict || '').trim().toUpperCase();

            let status: VerificationResult['status'] = 'UNKNOWN';
            if (verdictTrimmed.includes('VERIFIED')) {
              status = 'VERIFIED';
            } else if (verdictTrimmed.includes('CONTRADICTED')) {
              status = 'CONTRADICTED';
            } else if (verdictTrimmed.includes('AMBIGUOUS')) {
              status = 'AMBIGUOUS';
            }

            // 5. Construire le résultat
            const bestCandidate = searchResults[0] as any;
            const result: VerificationResult = {
              claim,
              status,
              confidenceScore: Math.max(0, Math.min(1, 1 - (bestCandidate?.distance || 0.5))),
              evidence:
                status !== 'UNKNOWN'
                  ? {
                      sourceNodeId: bestCandidate.id,
                      content: bestCandidate.node?.metadata?.content || bestCandidate.node?.content || ''
                    }
                  : null,
              contradictoryEvidence:
                (status === 'AMBIGUOUS' || status === 'CONTRADICTED') && searchResults.length > 1
                  ? searchResults.slice(1).map((r: any) => ({
                      sourceNodeId: r.id,
                      content: r.node?.metadata?.content || r.node?.content || ''
                    }))
                  : []
            };

            verificationResults.push(result);
            runtime.log('info', `[FactCheckerAgent] Verified "${claim}" → ${status}`);
          } catch (claimError) {
            const err = claimError instanceof Error ? claimError : new Error('Unknown error');
            runtime.log('warn', `[FactCheckerAgent] Error verifying claim "${claim}": ${err.message}`);
            verificationResults.push({
              claim,
              status: 'UNKNOWN',
              confidenceScore: 0,
              evidence: null
            });
          }
        }

        runtime.log('info', `[FactCheckerAgent] Verification complete: ${verificationResults.length} results`);
        return verificationResults;
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
