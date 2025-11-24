/**
 * Extracteur de claims basé sur des règles
 * Utilisé comme fallback si le LLM échoue
 * 
 * Philosophie: Rapide, déterministe, sans coût de tokens
 */

export class RuleBasedClaimExtractor {
  /**
   * Extrait les claims du texte en utilisant des regex patterns
   */
  public extract(text: string): string[] {
    const claims = new Set<string>();

    // Règle 1 : Phrases avec des verbes d'état ou des verbes factuels
    // Cible les phrases comme "X est Y", "X a été Z", "X contient W"
    const stateVerbPattern =
      /([^.!?]+?\s+(est|était|sont|fût|a été|a|avait|ont|contient|mesure|pèse|date de|fondée|créée|découverte|mort)\s+[^.!?]+)/gi;
    for (const match of text.matchAll(stateVerbPattern)) {
      const claim = this.cleanClaim(match[0]);
      if (claim.length > 0) {
        claims.add(claim);
      }
    }

    // Règle 2 : Phrases contenant des chiffres (années, pourcentages, quantités)
    const numberPattern = /([^.!?]*\d+[^.!?]*)/gi;
    for (const match of text.matchAll(numberPattern)) {
      const claim = this.cleanClaim(match[0]);
      if (claim.length > 0) {
        claims.add(claim);
      }
    }

    // Règle 3 : Phrases avec des noms propres (commencent par majuscule)
    const properNounPattern =
      /([A-Z][a-zàâäçéèêëîïôöùûüœæ\s]+(?:(?:est|a|ont|sont|était|contient|mesure|fondée|créée|découverte)\s+[^.!?]+))/g;
    for (const match of text.matchAll(properNounPattern)) {
      const claim = this.cleanClaim(match[0]);
      if (claim.length > 0) {
        claims.add(claim);
      }
    }

    // Filtrage final pour la qualité
    const filtered = Array.from(claims)
      .filter((c) => {
        const wordCount = c.split(/\s+/).length;
        return wordCount >= 4 && wordCount <= 25 && !c.endsWith('?');
      })
      .slice(0, 20); // Limiter à 20 claims max

    return filtered;
  }

  /**
   * Nettoie un claim en supprimant les espaces inutiles et les ponctuation en fin
   */
  private cleanClaim(claim: string): string {
    return claim
      .trim()
      .replace(/[,;:]+$/, '')
      .trim();
  }
}
