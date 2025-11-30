# Sprint 4 - Tâches Jours 6-7: Mise à Niveau de l'OIE

## 🎯 Objectif

Mettre à jour l'Orchestrateur Intelligent d'Exécution (OIE) pour qu'il comprenne et traite les documents en utilisant un planificateur basé sur LLM et un exécuteur de tâches multi-agents.

## 📋 Philosophie

**"Ne pas donner plus d'informations que nécessaire"**

Le LLMPlanner doit être assez intelligent pour savoir quand utiliser un résumé concis et quand se plonger dans le texte complet, afin d'économiser des tokens et d'accélérer le raisonnement.

## 🏗️ Architecture

### 1. **Agents Créés**

#### CalculatorAgent (`src/agents/calculator/`)
- **Manifeste**: Décrit les capacités de calcul et la structure de retour
- **Implémentation**: Évalue des expressions mathématiques de manière sécurisée
- **Retour structuré**: 
  ```typescript
  {
    result: number,
    expression: string,
    error: string | null
  }
  ```

#### UniversalReaderAgent (`src/agents/universal-reader/`)
- **Manifeste**: Décrit les capacités de lecture de documents (PDF, images)
- **Implémentation**: Extrait le texte et génère des résumés pour les documents longs
- **Retour structuré**:
  ```typescript
  {
    fullText: string,
    summary: string,
    wasSummarized: boolean,
    metadata: object
  }
  ```

### 2. **Système de Planification**

#### Prompts (`src/agents/oie/prompts.ts`)
Prompt système sophistiqué qui enseigne au LLM:
- ✅ Les outils disponibles et leurs signatures
- ✅ La structure des objets retournés (section `returns` des manifestes)
- ✅ Le contexte de la requête (fichiers attachés)
- ✅ Des exemples de plans pour différents scénarios
- ✅ L'interpolation de résultats entre étapes
- ✅ L'optimisation des tokens (utiliser `summary` si disponible)

**Exemples de plans intégrés**:
1. Calcul simple
2. Lecture de document
3. Question conversationnelle
4. Multi-étapes complexe (lecture + extraction + calcul)

### 3. **Système d'Exécution**

#### TaskExecutor (`src/agents/oie/executor.ts`)

**Fonctionnalités**:
- ✅ Exécution séquentielle d'un plan multi-agents
- ✅ Interpolation du contexte initial (fichiers attachés)
- ✅ Interpolation des résultats entre étapes
- ✅ Support des fallbacks avec l'opérateur `??`
- ✅ Gestion spéciale des ArrayBuffer (non-stringifiable)
- ✅ Streaming des résultats intermédiaires

**Syntaxe d'interpolation supportée**:
```typescript
// Résultat complet
{{step1_result}}

// Propriété spécifique
{{step1_result.summary}}

// Fallback (utilise summary si disponible, sinon fullText)
{{step1_result.summary ?? step1_result.fullText}}

// Fichier attaché
{{attached_file_buffer}}
{{attached_file_type}}
{{attached_file_name}}
```

### 4. **OIE Mis à Jour**

#### Index (`src/agents/oie/index.ts`)

**Workflow**:
1. **Validation**: Vérifie que la requête est valide
2. **Planification**: Appelle le LLM pour générer un plan d'action
3. **Parsing**: Extrait le JSON du plan (gère les balises markdown)
4. **Exécution**: Utilise TaskExecutor pour exécuter chaque étape
5. **Streaming**: Émet les résultats en temps réel

**Configuration**:
```typescript
const USE_LLM_PLANNER = true; // Bascule entre LLM et planificateur naïf
```

## 🔧 Utilisation

### Exemple 1: Calcul
```javascript
await runtime.callAgentStream('OIEAgent', 'executeQuery', [{
  query: "Combien font 15 * 23 + 100 ?"
}]);
```

**Plan généré**:
```json
{
  "thought": "Utiliser CalculatorAgent puis MainLLMAgent pour formuler",
  "steps": [
    {
      "agent": "CalculatorAgent",
      "action": "calculate",
      "args": { "expression": "15 * 23 + 100" }
    },
    {
      "agent": "MainLLMAgent",
      "action": "generateResponse",
      "args": {
        "prompt": "Le résultat est {{step1_result.result}}. Formule une réponse."
      }
    }
  ]
}
```

### Exemple 2: Lecture de Document
```javascript
await runtime.callAgentStream('OIEAgent', 'executeQuery', [{
  query: "Résume le document",
  attachedFile: {
    buffer: fileBuffer,
    type: "application/pdf",
    name: "document.pdf",
    size: 12345
  }
}]);
```

**Plan généré**:
```json
{
  "thought": "Lire le PDF puis générer un résumé",
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
        "prompt": "Résume: {{step1_result.summary ?? step1_result.fullText}}"
      }
    }
  ]
}
```

## 🎨 Événements de Stream

Le système émet différents types d'événements:

```typescript
// Planification
{ type: 'planning', status: 'started' }
{ type: 'planning', status: 'completed', plan: "...", steps: 2 }

// Exécution des étapes
{ type: 'step_start', stepNumber: 1, agent: 'CalculatorAgent', action: 'calculate' }
{ type: 'agent_chunk', stepNumber: 1, agent: '...', chunk: "..." }
{ type: 'step_end', stepNumber: 1, success: true }

// Fin du plan
{ type: 'plan_complete', totalSteps: 2 }
```

## ✅ Avantages de cette Architecture

1. **Extensibilité**: Ajouter un nouvel agent = créer un manifeste + implémenter
2. **Intelligence**: Le LLM choisit la meilleure stratégie selon le contexte
3. **Performance**: Utilise les résumés quand possible pour économiser des tokens
4. **Robustesse**: Fallbacks à tous les niveaux (parsing, exécution, planification)
5. **Traçabilité**: Logs détaillés à chaque étape
6. **Streaming**: Interface réactive avec feedback en temps réel

## 🚀 Prochaines Étapes

- [ ] Implémenter le vrai parsing PDF (pdf.js)
- [ ] Implémenter l'OCR pour images (Tesseract.js)
- [ ] Ajouter plus d'agents (VisionAgent, CodeAgent, etc.)
- [ ] Améliorer la validation des plans générés
- [ ] Ajouter des métriques de performance
- [ ] Créer des tests E2E pour les scénarios multi-agents

## 📝 Notes Techniques

### Gestion des ArrayBuffer
Les `ArrayBuffer` ne peuvent pas être stringifiés en JSON. Le TaskExecutor les gère spécialement:
```typescript
if (value === '{{attached_file_buffer}}') {
  clonedArgs[key] = context.attachedFile.buffer; // Remplacement direct
}
```

### Parsing Robuste du Plan
Le LLM peut retourner le JSON avec des balises markdown:
```typescript
if (jsonText.startsWith('```')) {
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
}
```

### Chain-of-Thought dans le Prompt
Le prompt inclut une section "PROCESSUS DE RÉFLEXION" qui guide le LLM à raisonner étape par étape avant de générer le plan.
