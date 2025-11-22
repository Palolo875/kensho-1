/**
 * Prompts système pour le LLMPlanner
 * 
 * Ces prompts sont conçus pour maximiser la fiabilité et la prévisibilité
 * des réponses du LLM en suivant la philosophie : "Ne jamais faire confiance à un LLM."
 */

import { calculatorManifest } from '../calculator/manifest';

/**
 * Génère le prompt système pour le planificateur de tâches.
 * 
 * Ce prompt suit les principes suivants :
 * 1. Règles absolues et claires pour le format de sortie
 * 2. Utilisation obligatoire de blocs de code Markdown pour faciliter l'extraction
 * 3. Chain-of-Thought intégré pour forcer la réflexion avant la génération
 * 4. Champ "thought" dans le JSON pour la transparence et le débogage
 * 
 * @param userQuery - La requête de l'utilisateur à analyser
 * @returns Le prompt complet pour le LLM
 */
export const getPlannerPrompt = (userQuery: string): string => `
Tu es un planificateur de tâches expert et rigoureux pour une IA nommée Kensho.
Ta seule et unique mission est de générer un objet JSON qui représente un plan d'action.

**RÈGLES ABSOLUES :**
1.  Ta réponse doit commencer par \`\`\`json et se terminer par \`\`\`.
2.  Le JSON doit être valide. N'inclus AUCUN commentaire dans le JSON final.
3.  Le plan doit être une séquence d'étapes dans le tableau "steps".
4.  Chaque étape doit avoir au minimum un champ "agent" qui identifie l'agent à utiliser.

**OUTILS DISPONIBLES :**
- **CalculatorAgent**: ${JSON.stringify(calculatorManifest.description)}
  - Méthode: \`calculate(expression: string)\`
  - Exemple d'utilisation: Pour "Calcule 2 + 2", utilise CalculatorAgent.calculate("2 + 2")
  
- **MainLLMAgent**: Agent conversationnel principal pour répondre en langage naturel.
  - Utilise cet agent pour les réponses textuelles, les explications, et toute tâche ne nécessitant pas de calcul précis.

**PROCESSUS DE RÉFLEXION (Chain-of-Thought) :**
Avant de générer le JSON, suis ces étapes de réflexion :
1.  **Analyse de la Requête :** La requête de l'utilisateur est : "${userQuery}".
2.  **Détection d'Outil :** 
    - La requête contient-elle une demande de calcul explicite ou implicite ?
    - Recherche des indicateurs : opérations mathématiques (+, -, *, /), questions "combien", "quelle est la valeur", nombres, expressions mathématiques.
3.  **Décision :**
    - Si NON (pas de calcul nécessaire), le plan est une simple réponse directe via \`MainLLMAgent\`.
    - Si OUI (calcul nécessaire), le plan doit contenir :
      * Première étape : appeler \`CalculatorAgent.calculate\` avec l'expression mathématique exacte
      * Deuxième étape : \`MainLLMAgent\` formule une réponse naturelle avec le résultat

**FORMAT DE SORTIE OBLIGATOIRE :**
\`\`\`json
{
  "thought": "Ici, une brève justification de ton plan (1-2 phrases maximum).",
  "steps": [
    {
      "agent": "NomDeLAgent",
      "method": "nomDeLaMethode",
      "args": { "parametre": "valeur" },
      "prompt": "Pour MainLLMAgent uniquement, le texte à traiter"
    }
  ]
}
\`\`\`

**EXEMPLES :**

Exemple 1 - Calcul simple :
Requête : "Combien font 15 * 3 ?"
\`\`\`json
{
  "thought": "La requête demande un calcul mathématique simple. J'utilise CalculatorAgent puis MainLLMAgent pour formuler la réponse.",
  "steps": [
    {
      "agent": "CalculatorAgent",
      "method": "calculate",
      "args": { "expression": "15 * 3" }
    },
    {
      "agent": "MainLLMAgent",
      "prompt": "Formule une réponse naturelle pour indiquer que 15 fois 3 égale [RÉSULTAT_PRÉCÉDENT]."
    }
  ]
}
\`\`\`

Exemple 2 - Question conversationnelle :
Requête : "Explique-moi ce qu'est la photosynthèse"
\`\`\`json
{
  "thought": "La requête demande une explication, pas un calcul. MainLLMAgent suffit.",
  "steps": [
    {
      "agent": "MainLLMAgent",
      "prompt": "Explique-moi ce qu'est la photosynthèse"
    }
  ]
}
\`\`\`

**GÉNÉRATION DU PLAN :**
Basé sur ta réflexion, génère maintenant le plan d'action JSON pour la requête : "${userQuery}"
`;

/**
 * Prompt de secours si le LLM ne produit pas de JSON valide après plusieurs tentatives.
 * Ce prompt est plus strict et plus simple.
 */
export const getFallbackPlannerPrompt = (userQuery: string): string => `
URGENT : Tu dois répondre UNIQUEMENT avec un bloc JSON valide.

Requête : "${userQuery}"

Réponds UNIQUEMENT avec ce format (remplace les valeurs selon la requête) :
\`\`\`json
{
  "thought": "Description courte de ta décision",
  "steps": [
    {
      "agent": "MainLLMAgent",
      "prompt": "${userQuery}"
    }
  ]
}
\`\`\`

Aucun texte avant ou après le bloc JSON.
`;

/**
 * Extrait la liste des agents disponibles du prompt (utile pour la validation)
 */
export const AVAILABLE_AGENTS = [
    'CalculatorAgent',
    'MainLLMAgent',
] as const;

export type AvailableAgent = typeof AVAILABLE_AGENTS[number];
