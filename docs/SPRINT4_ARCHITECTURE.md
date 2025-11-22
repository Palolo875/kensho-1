# Architecture Sprint 4 - Flux de Traitement

```
┌─────────────────────────────────────────────────────────────────┐
│                        UTILISATEUR                                │
│                   (Requête + Fichier optionnel)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         OIEAgent                                  │
│                (Orchestrateur Intelligent)                        │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ├─────► Validation du payload
                             │
                             ├─────► ÉTAPE 1: PLANIFICATION
                             │       ┌───────────────────────────┐
                             │       │    LLMPlanner (LLM)       │
                             │       │                           │
                             │       │  • Analyse la requête     │
                             │       │  • Détecte le contexte    │
                             │       │  • Génère un plan JSON    │
                             │       └───────────────────────────┘
                             │              │
                             │              ▼
                             │       ┌───────────────────────────┐
                             │       │ Prompt Sophistiqué        │
                             │       │                           │
                             │       │ • Manifestes des agents   │
                             │       │ • Exemples de plans       │
                             │       │ • Stratégies d'optimisation│
                             │       └───────────────────────────┘
                             │              │
                             │              ▼
                             │       Plan JSON:
                             │       {
                             │         "thought": "...",
                             │         "steps": [...]
                             │       }
                             │
                             ├─────► ÉTAPE 2: EXÉCUTION
                             │       ┌───────────────────────────┐
                             │       │    TaskExecutor           │
                             │       └───────────────────────────┘
                             │              │
                             │              ▼
                             │       Pour chaque step:
                             │         1. Interpoler contexte initial
                             │         2. Interpoler résultats précédents
                             │         3. Appeler l'agent
                             │         4. Stocker le résultat
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │         Agents Disponibles                  │
        ├────────────────────────────────────────────┤
        │                                             │
        │  ┌──────────────────────────────────────┐  │
        │  │  MainLLMAgent                        │  │
        │  │  • Génération de texte               │  │
        │  │  • Streaming                         │  │
        │  └──────────────────────────────────────┘  │
        │                                             │
        │  ┌──────────────────────────────────────┐  │
        │  │  CalculatorAgent                     │  │
        │  │  • Évalue expressions mathématiques  │  │
        │  │  • Returns: { result, expression }   │  │
        │  └──────────────────────────────────────┘  │
        │                                             │
        │  ┌──────────────────────────────────────┐  │
        │  │  UniversalReaderAgent                │  │
        │  │  • Extrait texte de PDF/images       │  │
        │  │  • Génère résumés automatiques       │  │
        │  │  • Returns: { fullText, summary,     │  │
        │  │              wasSummarized, metadata }│  │
        │  └──────────────────────────────────────┘  │
        │                                             │
        └────────────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │  Streaming Events  │
                    ├────────────────────┤
                    │ • planning         │
                    │ • step_start       │
                    │ • agent_chunk      │
                    │ • step_end         │
                    │ • plan_complete    │
                    └────────────────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │   UTILISATEUR      │
                    │ (Résultat final)   │
                    └────────────────────┘
```

## Exemple de Flux Concret

### Requête: "Lis le document et calcule la somme"

```
1. PLANIFICATION
   └─► LLM génère:
       {
         "thought": "Lire le PDF, extraire nombres, calculer somme",
         "steps": [
           { agent: "UniversalReaderAgent", action: "read", ... },
           { agent: "MainLLMAgent", action: "generateResponse", ... },
           { agent: "CalculatorAgent", action: "calculate", ... },
           { agent: "MainLLMAgent", action: "generateResponse", ... }
         ]
       }

2. EXÉCUTION
   Step 1: UniversalReaderAgent.read({{attached_file_buffer}})
           → Returns: { fullText: "...", summary: "...", ... }
           → Stocké comme step1_result

   Step 2: MainLLMAgent.generateResponse(
             "Trouve nombres dans: {{step1_result.summary}}"
           )
           → Returns: "100 + 200 + 300"
           → Stocké comme step2_result

   Step 3: CalculatorAgent.calculate("{{step2_result}}")
           → Returns: { result: 600 }
           → Stocké comme step3_result

   Step 4: MainLLMAgent.generateResponse(
             "La somme est {{step3_result.result}}"
           )
           → Stream vers utilisateur
           → Résultat: "La somme totale est 600 euros."

3. RÉSULTAT FINAL
   └─► Utilisateur reçoit la réponse complète
```

## Points Clés

1. **Interpolation Intelligente**
   - `{{step1_result.summary ?? step1_result.fullText}}` utilise summary en priorité
   - `{{attached_file_buffer}}` injecte le fichier attaché
   - Support des propriétés imbriquées

2. **Optimisation des Tokens**
   - Le LLM choisit automatiquement summary ou fullText
   - Pas de données redondantes
   - Plans minimaux mais efficaces

3. **Robustesse**
   - Fallback à chaque niveau
   - Validation du plan généré
   - Gestion d'erreurs granulaire

4. **Extensibilité**
   - Ajouter un agent = créer manifeste + implémentation
   - Le LLM apprend automatiquement à l'utiliser
   - Pas de code de routing manuel
