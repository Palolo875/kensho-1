/**
 * Prompt pour vérification de claims par LLM "juge"
 * Conçu pour être minimaliste et forcer une réponse standardisée
 */

export const CLAIM_VERIFIER_PROMPT = (claim: string, memories: string[]): string => `
# RÔLE : Juge Factuel

# MISSION :
Évalue si l'AFFIRMATION est directement supportée, contredite, ou non mentionnée par les SOUVENIRS fournis.

# AFFIRMATION À VÉRIFIER :
"${claim}"

# SOUVENIRS DE CONNAISSANCE :
${memories.map((m, i) => `SOUVENIR ${i + 1}: "${m}"`).join('\n')}

# INSTRUCTIONS STRICTES :
1. Lis l'AFFIRMATION et chaque SOUVENIR.
2. Compare l'AFFIRMATION aux SOUVENIRS.
3. Réponds avec UN SEUL mot parmi les suivants :
   - VERIFIED : Si au moins un souvenir confirme explicitement l'affirmation.
   - CONTRADICTED : Si au moins un souvenir contredit explicitement l'affirmation.
   - AMBIGUOUS : Si les souvenirs se contredisent entre eux à propos de l'affirmation.
   - UNKNOWN : Si aucun souvenir ne contient d'information pertinente.

# TON VERDICT (un seul mot) :
`;
