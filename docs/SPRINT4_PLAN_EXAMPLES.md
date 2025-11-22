# Exemples de Plans JSON - Sprint 4

Ce fichier contient des exemples de plans JSON que le LLMPlanner peut générer.
Ces exemples servent de référence pour comprendre la structure et les possibilités.

## Structure de Base

Tous les plans suivent cette structure:

```json
{
  "thought": "Explication courte de la stratégie (1-2 phrases)",
  "steps": [
    {
      "agent": "NomDeLAgent",
      "action": "nomDeLaMethode",
      "args": {
        "parametre1": "valeur1",
        "parametre2": "{{interpolation}}"
      }
    }
  ]
}
```

---

## Exemple 1: Calcul Simple

**Requête:** "Combien font 15 * 23 + 100 ?"

```json
{
  "thought": "La requête contient une expression mathématique explicite. Je vais utiliser le CalculatorAgent pour l'évaluer, puis le MainLLMAgent pour formuler la réponse.",
  "steps": [
    {
      "agent": "CalculatorAgent",
      "action": "calculate",
      "args": {
        "expression": "15 * 23 + 100"
      }
    },
    {
      "agent": "MainLLMAgent",
      "action": "generateResponse",
      "args": {
        "prompt": "L'utilisateur a demandé de calculer 15 * 23 + 100. Le résultat est {{step1_result.result}}. Formule une réponse naturelle et concise."
      }
    }
  ]
}
```

**Résultat Attendu:**
```
Step 1: CalculatorAgent → { result: 445, expression: "15 * 23 + 100" }
Step 2: MainLLMAgent → "Le résultat de 15 × 23 + 100 est 445."
```

---

## Exemple 2: Question Conversationnelle

**Requête:** "Explique-moi ce qu'est la photosynthèse."

```json
{
  "thought": "Question générale qui ne nécessite ni calcul ni document. Je route directement vers le MainLLMAgent.",
  "steps": [
    {
      "agent": "MainLLMAgent",
      "action": "generateResponse",
      "args": {
        "prompt": "Explique-moi ce qu'est la photosynthèse."
      }
    }
  ]
}
```

**Résultat Attendu:**
```
Step 1: MainLLMAgent → "La photosynthèse est le processus par lequel..."
```

---

## Exemple 3: Lecture de Document

**Requête:** "Résume le document que je viens d'envoyer."  
**Context:** Fichier PDF attaché

```json
{
  "thought": "L'utilisateur veut un résumé du fichier attaché. Je vais utiliser le UniversalReaderAgent pour le lire, puis passer le résultat au MainLLMAgent pour la formulation finale.",
  "steps": [
    {
      "agent": "UniversalReaderAgent",
      "action": "read",
      "args": {
        "fileBuffer": "{{attached_file_buffer}}",
        "fileType": "{{attached_file_type}}"
      }
    },
    {
      "agent": "MainLLMAgent",
      "action": "generateResponse",
      "args": {
        "prompt": "En te basant sur le texte suivant, génère un résumé complet et bien structuré. Texte : {{step1_result.summary ?? step1_result.fullText}}"
      }
    }
  ]
}
```

**Résultat Attendu:**
```
Step 1: UniversalReaderAgent → {
  fullText: "Long texte...",
  summary: "Résumé court...",
  wasSummarized: true,
  metadata: {...}
}
Step 2: MainLLMAgent → "Voici un résumé du document : ..."
```

**Note:** L'utilisation de `{{step1_result.summary ?? step1_result.fullText}}` est cruciale.
Si le document était long (summary disponible), on utilise le summary. Sinon, le texte complet.

---

## Exemple 4: Multi-Étapes Complexe

**Requête:** "Lis le PDF attaché et calcule la somme des nombres mentionnés."  
**Context:** PDF contenant "Budget: Phase 1: 1500€, Phase 2: 2300€, Phase 3: 800€"

```json
{
  "thought": "Tâche en plusieurs parties : d'abord lire le document, puis extraire et identifier les nombres, ensuite créer une expression de calcul, puis faire le calcul final, et enfin formuler la réponse.",
  "steps": [
    {
      "agent": "UniversalReaderAgent",
      "action": "read",
      "args": {
        "fileBuffer": "{{attached_file_buffer}}",
        "fileType": "{{attached_file_type}}"
      }
    },
    {
      "agent": "MainLLMAgent",
      "action": "generateResponse",
      "args": {
        "prompt": "Voici un texte : {{step1_result.summary ?? step1_result.fullText}}. Identifie TOUS les nombres mentionnés et crée une expression mathématique qui les additionne. Retourne UNIQUEMENT l'expression (ex: 10 + 20 + 30), sans texte supplémentaire."
      }
    },
    {
      "agent": "CalculatorAgent",
      "action": "calculate",
      "args": {
        "expression": "{{step2_result}}"
      }
    },
    {
      "agent": "MainLLMAgent",
      "action": "generateResponse",
      "args": {
        "prompt": "L'utilisateur a demandé la somme des nombres dans le document. Le résultat est {{step3_result.result}}. Formule une réponse complète et naturelle."
      }
    }
  ]
}
```

**Résultat Attendu:**
```
Step 1: UniversalReaderAgent → { fullText: "Budget: ...", summary: "...", ... }
Step 2: MainLLMAgent → "1500 + 2300 + 800"
Step 3: CalculatorAgent → { result: 4600 }
Step 4: MainLLMAgent → "La somme totale du budget est de 4600 euros."
```

---

## Exemple 5: Document avec Question Spécifique

**Requête:** "Quelles sont les dates importantes dans ce document ?"  
**Context:** PDF d'un planning

```json
{
  "thought": "L'utilisateur veut extraire des informations spécifiques (dates) d'un document. Je lis d'abord le document, puis j'analyse pour identifier les dates.",
  "steps": [
    {
      "agent": "UniversalReaderAgent",
      "action": "read",
      "args": {
        "fileBuffer": "{{attached_file_buffer}}",
        "fileType": "{{attached_file_type}}"
      }
    },
    {
      "agent": "MainLLMAgent",
      "action": "generateResponse",
      "args": {
        "prompt": "Analyse le texte suivant et liste toutes les dates importantes mentionnées. Présente-les de manière structurée. Texte: {{step1_result.summary ?? step1_result.fullText}}"
      }
    }
  ]
}
```

---

## Exemple 6: Calcul dans une Conversation

**Requête:** "Si j'achète 3 articles à 25€ et 2 à 15€, combien je paie ?"

```json
{
  "thought": "La requête implique un calcul mais formulé de manière conversationnelle. Je vais d'abord créer l'expression mathématique, la calculer, puis formuler la réponse.",
  "steps": [
    {
      "agent": "CalculatorAgent",
      "action": "calculate",
      "args": {
        "expression": "3 * 25 + 2 * 15"
      }
    },
    {
      "agent": "MainLLMAgent",
      "action": "generateResponse",
      "args": {
        "prompt": "L'utilisateur achète 3 articles à 25€ et 2 à 15€. Le total est {{step1_result.result}}€. Formule une réponse conversationnelle."
      }
    }
  ]
}
```

---

## Exemple 7: Comparaison de Documents (Futur)

**Requête:** "Compare ces deux documents"  
**Context:** Deux PDFs attachés

```json
{
  "thought": "Lire les deux documents puis demander au LLM de les comparer.",
  "steps": [
    {
      "agent": "UniversalReaderAgent",
      "action": "read",
      "args": {
        "fileBuffer": "{{attached_file1_buffer}}",
        "fileType": "{{attached_file1_type}}"
      }
    },
    {
      "agent": "UniversalReaderAgent",
      "action": "read",
      "args": {
        "fileBuffer": "{{attached_file2_buffer}}",
        "fileType": "{{attached_file2_type}}"
      }
    },
    {
      "agent": "MainLLMAgent",
      "action": "generateResponse",
      "args": {
        "prompt": "Compare ces deux documents. Document 1: {{step1_result.summary}}. Document 2: {{step2_result.summary}}. Identifie les similitudes et différences."
      }
    }
  ]
}
```

**Note:** Nécessite support multi-fichiers (pas encore implémenté).

---

## Patterns d'Interpolation Avancés

### 1. Fallback avec ??

```json
{
  "args": {
    "prompt": "Texte: {{step1_result.summary ?? step1_result.fullText}}"
  }
}
```
➜ Utilise summary si disponible, sinon fullText

### 2. Propriétés Imbriquées

```json
{
  "args": {
    "value": "{{step1_result.metadata.extractedAt}}"
  }
}
```
➜ Accède à une propriété imbriquée

### 3. Résultat Complet

```json
{
  "args": {
    "data": "{{step1_result}}"
  }
}
```
➜ Passe l'objet complet

### 4. Contexte Initial

```json
{
  "args": {
    "fileBuffer": "{{attached_file_buffer}}",
    "fileType": "{{attached_file_type}}",
    "fileName": "{{attached_file_name}}"
  }
}
```
➜ Utilise les données du fichier attaché

---

## Anti-Patterns à Éviter

### ❌ Mauvais: Texte complet systématique

```json
{
  "args": {
    "prompt": "Résume: {{step1_result.fullText}}"
  }
}
```
➜ Gaspille des tokens si un résumé existe

### ✅ Bon: Utiliser le fallback

```json
{
  "args": {
    "prompt": "Résume: {{step1_result.summary ?? step1_result.fullText}}"
  }
}
```

---

### ❌ Mauvais: Numérotation incorrecte

```json
{
  "steps": [
    { ... },
    {
      "args": {
        "data": "{{step0_result}}"  // ❌ Les steps commencent à 1
      }
    }
  ]
}
```

### ✅ Bon: Numérotation correcte

```json
{
  "steps": [
    { ... },
    {
      "args": {
        "data": "{{step1_result}}"  // ✅ Référence step 1
      }
    }
  ]
}
```

---

## Conseils pour Générer de Bons Plans

1. **Minimiser les étapes** : Utiliser le moins d'étapes possible
2. **Optimiser les tokens** : Préférer summary à fullText
3. **Être explicite** : Ajouter un thought clair
4. **Valider la syntaxe** : Respecter le format JSON
5. **Tester l'interpolation** : Vérifier que les références sont correctes

---

## Validation d'un Plan

Un plan est valide si:
- ✅ C'est du JSON valide
- ✅ Il contient `thought` et `steps`
- ✅ `steps` est un array non-vide
- ✅ Chaque step a `agent`, `action`, et `args`
- ✅ Les agents existent ('MainLLMAgent', 'CalculatorAgent', 'UniversalReaderAgent')
- ✅ Les interpolations référencent des steps existants
- ✅ Les fichiers attachés sont correctement référencés

---

**Version:** 4.0.0  
**Dernière mise à jour:** 2025-11-22
