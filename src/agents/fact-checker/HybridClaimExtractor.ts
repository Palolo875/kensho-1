/**
 * Extracteur hybride de claims
 * Combine le LLM (flexible) + règles déterministes (fiable)
 * 
 * Logique:
 * 1. Essayer extraction par LLM
 * 2. Parser le JSON (ou Markdown si JSON échoue)
 * 3. Si aucun résultat, fallback aux règles
 */

import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { CLAIM_EXTRACTOR_PROMPT } from '../personas/claim-extractor-prompt';
import { RuleBasedClaimExtractor } from './RuleBasedClaimExtractor';

export class HybridClaimExtractor {
  private ruleBasedExtractor = new RuleBasedClaimExtractor();

  constructor(private runtime: AgentRuntime) {}

  /**
   * Extrait les claims du texte de manière hybride (LLM + règles)
   */
  public async extract(text: string): Promise<string[]> {
    if (!text || text.trim().length === 0) {
      this.runtime.log('warn', '[HybridClaimExtractor] Text is empty, returning empty claims');
      return [];
    }

    // Limiter la longueur du texte pour éviter les timeout
    const maxTextLength = 2000;
    const truncatedText =
      text.length > maxTextLength ? text.substring(0, maxTextLength) + '...' : text;

    // Étape 1 : Tentative d'extraction par LLM
    this.runtime.log('info', '[HybridClaimExtractor] Starting LLM extraction...');
    let llmResponse: string = '';

    try {
      const prompt = CLAIM_EXTRACTOR_PROMPT(truncatedText);

      // Appeler MainLLMAgent pour l'extraction
      llmResponse = await this.runtime.callAgent<string>(
        'MainLLMAgent',
        'generateSingleResponse',
        [prompt],
        30000 // Timeout 30s
      );

      this.runtime.log('info', `[HybridClaimExtractor] LLM response received (${llmResponse.length} chars)`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      this.runtime.log('warn', `[HybridClaimExtractor] LLM extraction failed: ${err.message}`);
      llmResponse = '';
    }

    // Étape 2 : Parsing robuste du JSON
    let claims: string[] = [];

    if (llmResponse) {
      try {
        // Tentative 1 : Extraire JSON même s'il est noyé dans du texte
        const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.claims)) {
            claims = parsed.claims;
            this.runtime.log('info', `[HybridClaimExtractor] JSON parsing succeeded (${claims.length} claims)`);
          }
        }
      } catch (jsonError) {
        this.runtime.log('warn', '[HybridClaimExtractor] JSON parsing failed, trying Markdown format...');

        // Tentative 2 : Parser comme une liste Markdown si JSON échoue
        try {
          claims = llmResponse
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.match(/^[-•*]\s/) || line.match(/^\d+\.\s/))
            .map((line) => line.replace(/^[-•*]\s|^\d+\.\s/, '').trim())
            .filter((line) => line.length > 0);

          if (claims.length > 0) {
            this.runtime.log('info', `[HybridClaimExtractor] Markdown parsing succeeded (${claims.length} claims)`);
          }
        } catch (mdError) {
          this.runtime.log('warn', '[HybridClaimExtractor] Markdown parsing also failed');
          claims = [];
        }
      }
    }

    // Étape 3 : Validation et nettoyage des claims extraits
    const validatedClaims = claims
      .map((c) => String(c).trim())
      .filter((c) => c.length > 10 && !c.endsWith('?') && !c.startsWith('```'));

    // Étape 4 : Fallback si le LLM a échoué ou retourné trop peu de résultats
    if (validatedClaims.length === 0) {
      this.runtime.log(
        'info',
        '[HybridClaimExtractor] LLM extraction failed or returned no claims. Falling back to rule-based extractor.'
      );
      const ruleBasedClaims = this.ruleBasedExtractor.extract(text);
      this.runtime.log('info', `[HybridClaimExtractor] Rule-based extraction returned ${ruleBasedClaims.length} claims`);
      return ruleBasedClaims;
    }

    this.runtime.log('info', `[HybridClaimExtractor] Final extraction: ${validatedClaims.length} claims`);
    return validatedClaims;
  }
}
