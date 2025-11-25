# Kensho Router v2.0 - Orchestrateur Intelligent

## Vue d'ensemble

Le Router v2.0 est un système d'orchestration intelligent qui route les requêtes utilisateur vers les experts IA appropriés, en tenant compte des ressources système disponibles et de la complexité de la requête.

## Corrections Critiques Intégrées

Le Router v2.0 intègre les leçons apprises et corrections critiques suivantes :

### 1. ✅ ModelCatalog Vérifié (Anti-Hallucination)
**Problème résolu** : Ne jamais référencer un modèle qui n'existe pas dans WebLLM/MLC.

**Solution** :
- Tous les modèles du `ROUTER_MODEL_CATALOG` sont vérifiés et marqués avec `verified: true`
- Fonction `validateModelExists()` pour éviter les plans irréalisables
- Date de vérification trackée pour chaque modèle

**Modèles disponibles** :
- `gemma-3-270m` - Dialogue généraliste (270M, q4f16_1)
- `qwen2.5-coder-1.5b` - Expert code (1.5B, q4f16_1)
- `qwen2.5-math-1.5b` - Expert mathématiques (1.5B, q4f16_1)

### 2. ✅ Classification Hybride (Rapidité + Intelligence)
**Problème résolu** : Classification simpliste par mots-clés fragile, embedding models non disponibles dans WebLLM.

**Solution** :
- **Niveau 1** : Classification par mots-clés (rapide, déterministe)
- **Niveau 2** : Fallback vers Gemma-3-270M LLM si ambiguïté
- Confidence tracking pour décider du niveau à utiliser

### 3. ✅ Classifier "Fail-Aware" (Pas de Silence)
**Problème résolu** : Classification qui échoue en silence avec fallback caché.

**Solution** :
- `ClassificationError` levée si la réponse LLM est invalide
- Logging explicite de la méthode utilisée (keywords/llm/fallback)
- Fallback final vers DIALOGUE avec confidence faible (0.3)

### 4. ✅ Capacity Score Multi-Critères (Décision Holistique)
**Problème résolu** : Décision SERIAL vs PARALLEL binaire ignorant plusieurs facteurs.

**Solution** :
- Score de 0 à 10 basé sur 4 métriques :
  - CPU (hardwareConcurrency)
  - Mémoire (usageRatio)
  - Batterie (level, isCharging, powerSaveMode)
  - Réseau (isOnline, effectiveType)
- Décision de stratégie tenant compte de la priorité de la tâche

### 5. ✅ Sélection d'Experts Consciente
**Problème résolu** : Router créant des plans irréalisables avec des modèles non chargés.

**Solution** :
- Vérification `validateModelExists()` avant création du plan
- `RouterError` avec raison explicite si modèle manquant
- Fallback tasks seulement si capacité suffisante

## Architecture

```
User Query
    ↓
IntentClassifier (Keywords → LLM Fallback)
    ↓
CapacityEvaluator (CPU + Memory + Battery + Network → Score/10)
    ↓
Router.selectExperts (Intent → Model Selection)
    ↓
ExecutionPlan (Primary + Fallback + Strategy + Timeout)
    ↓
TaskExecutor (SERIAL | PARALLEL)
```

## API

### Router Principal

```typescript
import { Router } from '@/core/router';

const router = new Router();

// Créer un plan d'exécution
const plan = await router.createPlan("Comment debugger ce code JavaScript ?");
console.log(plan);
// {
//   primaryTask: {
//     agentName: 'CodeExpert',
//     modelKey: 'qwen2.5-coder-1.5b',
//     priority: 'HIGH',
//     timeout: 30000,
//     temperature: 0.2
//   },
//   fallbackTasks: [{
//     agentName: 'GeneralDialogue',
//     modelKey: 'gemma-3-270m',
//     priority: 'LOW',
//     timeout: 20000,
//     temperature: 0.7
//   }],
//   strategy: 'PARALLEL',
//   capacityScore: 8.5,
//   estimatedDuration: 18000
// }

// Valider le plan
const isValid = await router.validatePlan(plan);
```

### IntentClassifier

```typescript
import { IntentClassifier } from '@/core/router';

const classifier = new IntentClassifier();

// Classification hybride
const result = await classifier.classify("Explique-moi les closures en JavaScript");
console.log(result);
// {
//   intent: 'CODE',
//   confidence: 0.8,
//   method: 'keywords'
// }

// Fallback LLM pour requêtes ambiguës
const ambiguousResult = await classifier.classify("Qu'en penses-tu ?");
console.log(ambiguousResult);
// {
//   intent: 'DIALOGUE',
//   confidence: 0.85,
//   method: 'llm'
// }
```

### CapacityEvaluator

```typescript
import { CapacityEvaluator } from '@/core/router';

const evaluator = new CapacityEvaluator();

// Évaluer la capacité système
const metrics = await evaluator.evaluate();
console.log(metrics);
// {
//   cpuScore: 7,
//   memoryScore: 8,
//   batteryScore: 10,
//   networkScore: 10,
//   overallScore: 8.8
// }

// Déterminer la stratégie d'exécution
const strategy = evaluator.determineStrategy(8.8, 'HIGH');
console.log(strategy); // 'PARALLEL'
```

### ModelCatalog

```typescript
import { 
  ROUTER_MODEL_CATALOG, 
  getModelBySpecialization, 
  validateModelExists 
} from '@/core/router';

// Obtenir un modèle par spécialisation
const codeModel = getModelBySpecialization('code');
console.log(codeModel);
// {
//   model_id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
//   size: "1.5B",
//   specialization: "code",
//   ...
// }

// Valider qu'un modèle existe
const exists = validateModelExists('gemma-3-270m');
console.log(exists); // true

const notExists = validateModelExists('phantom-model');
console.log(notExists); // false
```

## Catégories d'Intent

| Intent | Description | Expert Primaire | Fallback |
|--------|-------------|-----------------|----------|
| `CODE` | Questions de programmation, bugs, algorithmes | Qwen2.5-Coder-1.5B | Gemma-3-270M |
| `MATH` | Mathématiques, calculs, équations | Qwen2.5-Math-1.5B | CalculatorAgent |
| `FACTCHECK` | Vérification de faits et informations | FactCheckerAgent (Gemma) | - |
| `DIALOGUE` | Conversations générales | Gemma-3-270M | - |
| `UNKNOWN` | Non classifiable | Gemma-3-270M | - |

## Stratégies d'Exécution

### SERIAL
- Exécute primary task d'abord, puis fallbacks
- Utilisé quand capacité < 7 OU priority = HIGH et capacité < 7
- Durée estimée = somme des timeouts

### PARALLEL
- Exécute primary et fallbacks en parallèle
- Utilisé quand capacité >= 7 ET priority = HIGH
- Ou capacité >= 8 pour priority = LOW
- Durée estimée = max des timeouts

## Scoring de Capacité

### CPU Score
- 8+ cores: 10
- 4-7 cores: 7
- 2-3 cores: 5
- 1 core: 3

### Memory Score
- <30% usage: 10
- 30-50%: 8
- 50-70%: 6
- 70-85%: 4
- >85%: 2

### Battery Score
- Charging: 10
- PowerSave mode: 3
- >50%: 10
- 30-50%: 7
- 15-30%: 4
- <15%: 2

### Network Score
- 4G/5G: 10
- 3G: 7
- 2G: 4
- Slow-2G: 2
- Offline: 5 (peut utiliser cache)

## Gestion d'Erreurs

```typescript
try {
  const plan = await router.createPlan(query);
} catch (error) {
  if (error instanceof ClassificationError) {
    console.error('Échec classification:', error.message);
    console.error('Réponse LLM brute:', error.rawResponse);
  } else if (error instanceof RouterError) {
    console.error('Échec routage:', error.message);
    console.error('Raison:', error.reason);
  }
}
```

## Tests et Validation

### Validation du Catalog
Pour vérifier que tous les modèles existent dans WebLLM/MLC :

```typescript
import { getAllVerifiedModels } from '@/core/router';

const models = getAllVerifiedModels();
for (const model of models) {
  console.log(`✓ ${model.model_id} - ${model.specialization} (vérifié: ${model.verifiedDate})`);
}
```

### Test de Classification
```typescript
const testCases = [
  { query: "Debug ce code Python", expected: 'CODE' },
  { query: "Calcule la dérivée de x²", expected: 'MATH' },
  { query: "Est-ce que Paris est en France?", expected: 'FACTCHECK' },
  { query: "Bonjour!", expected: 'DIALOGUE' }
];

for (const { query, expected } of testCases) {
  const result = await classifier.classify(query);
  console.assert(result.intent === expected, `Expected ${expected}, got ${result.intent}`);
}
```

## Bonnes Pratiques

### ✅ DO
- Toujours valider le plan avant exécution
- Logger la méthode de classification utilisée
- Respecter les timeouts par tâche
- Utiliser le capacity score pour décider de la stratégie

### ❌ DON'T
- Ne jamais ajouter un modèle sans vérification WebLLM/MLC
- Ne pas ignorer les `ClassificationError`
- Ne pas forcer PARALLEL si capacité < 7
- Ne pas créer de plans avec modèles non vérifiés

## Roadmap

### Sprint 13 (Futur)
- [ ] TaskExecutor pour exécuter les plans
- [ ] Monitoring de performance des experts
- [ ] Apprentissage des patterns de classification
- [ ] Cache des plans fréquents
- [ ] Support des modèles d'embedding vérifiés
