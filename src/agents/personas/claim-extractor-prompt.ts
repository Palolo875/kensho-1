/**
 * Prompt pour extraction hybride de claims
 * Utilisé par le HybridClaimExtractor pour guider le LLM
 */

export const CLAIM_EXTRACTOR_PROMPT = (text: string): string => `
# RÔLE : Extracteur d'Affirmations Factuelles

# MISSION :
Tu dois lire le TEXTE ci-dessous et extraire toutes les affirmations factuelles qui peuvent être vérifiées. Une affirmation factuelle contient une information objective (un nom, un lieu, un chiffre, une date, un fait technique). Ignore les opinions, les questions, et les phrases subjectives.

# FORMAT DE SORTIE OBLIGATOIRE :
Réponds UNIQUEMENT avec un objet JSON contenant une clé "claims". La valeur doit être un tableau de chaînes de caractères. Chaque chaîne doit être une affirmation complète. Ne fournis AUCUN texte ou explication en dehors de l'objet JSON.

# EXEMPLE :
- TEXTE : "Je pense que Rust est un bon langage. Il a été créé par Mozilla en 2010 et sa version 1.0 est sortie en 2015."
- SORTIE JSON :
{
  "claims": [
    "Rust a été créé par Mozilla en 2010.",
    "La version 1.0 de Rust est sortie en 2015."
  ]
}

# TEXTE À ANALYSER :
"""
${text}
"""

# TA RÉPONSE JSON (et uniquement ça) :
`;
