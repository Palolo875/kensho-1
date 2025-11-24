/**
 * Synthesizer Prompt V3 - Sprint 9
 * Intègre les résultats de vérification factuelle dans la synthèse finale
 * 
 * Le synthétiseur module sa réponse en fonction de la fiabilité des faits
 */

import type { VerificationResult } from '../../types/verification';

export const SYNTHESIZER_PROMPT_V3 = (
  draft: string,
  critique: string,
  verificationReport: VerificationResult[]
): string => {
  const verificationSummary =
    verificationReport.length > 0
      ? `
# RAPPORT DE VÉRIFICATION FACTUELLE
Voici le résultat de la vérification des faits du brouillon initial. Tu DOIS en tenir compte.
${verificationReport
  .map(
    (v) =>
      `- Affirmation : "${v.claim}" -> Statut : ${v.status} (Confiance: ${(v.confidenceScore * 100).toFixed(0)}%)`
  )
  .join('\n')}

# RÈGLES DE SYNTHÈSE BASÉES SUR LES FAITS
- Si un fait est 'VERIFIED' avec une confiance > 80%, tu peux l'affirmer avec assurance.
- Si un fait est 'VERIFIED' avec une confiance < 80%, tu dois le nuancer (ex: "il semble que...", "selon une source...").
- Si un fait est 'UNKNOWN', tu dois l'omettre ou le présenter comme une spéculation non vérifiée.
- Si un fait est 'CONTRADICTED' ou 'AMBIGUOUS', tu DOIS mentionner l'incertitude ou le conflit des sources. C'est un point crucial de ta crédibilité.
`.trim()
      : '# RAPPORT DE VÉRIFICATION FACTUELLE\nAucune vérification de faits n\'a été effectuée.';

  return `
# RÔLE : Synthétiseur Final
# MISSION : Améliorer le BROUILLON en intégrant la CRITIQUE et en respectant impérativement le RAPPORT DE VÉRIFICATION FACTUELLE pour produire une réponse finale, nuancée et factuellement juste.

# BROUILLON INITIAL
${draft}

# CRITIQUE CONSTRUCTIVE
${critique}

${verificationSummary}

# TA RÉPONSE FINALE AMÉLIORÉE :
`;
};
