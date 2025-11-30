# 🚀 Guide de Démarrage Sprint 4

## Fichiers Créés

### Agents
- ✅ `src/agents/calculator/index.ts` - Agent de calcul mathématique
- ✅ `src/agents/calculator/manifest.ts` - Manifeste du CalculatorAgent
- ✅ `src/agents/universal-reader/index.ts` - Agent de lecture de documents
- ✅ `src/agents/universal-reader/manifest.ts` - Manifeste du UniversalReaderAgent

### Système OIE
- ✅ `src/agents/oie/index.ts` - **Mis à jour** avec TaskExecutor
- ✅ `src/agents/oie/executor.ts` - **Nouveau** TaskExecutor multi-agents
- ✅ `src/agents/oie/prompts.ts` - **Nouveau** Prompts sophistiqués pour LLM

### Documentation
- ✅ `src/agents/oie/README-SPRINT4.md` - Documentation détaillée
- ✅ `docs/SPRINT4_ARCHITECTURE.md` - Diagrammes d'architecture
- ✅ `SPRINT4_IMPLEMENTATION.md` - Récapitulatif de l'implémentation

### Tests
- ✅ `tests/browser/sprint4-oie-multi-agents.html` - Page de test interactive

### Utils
- ✅ `src/agents/index.ts` - Export centralisé des agents

## 🧪 Comment Tester

### Option 1: Tests Manuels avec Page HTML

1. **Démarrer le serveur de développement**
   ```bash
   npm run dev
   ```

2. **Ouvrir la page de test**
   ```
   http://localhost:5173/tests/browser/sprint4-oie-multi-agents.html
   ```

3. **Tester les scénarios**
   - Click "Test 1" pour tester le calcul mathématique
   - Click "Test 2" pour tester une conversation
   - Click "Test 3" pour tester la lecture de document simulé

### Option 2: Test Programmatique

```typescript
import { MessageBus } from './src/core/communication/MessageBus';

const bus = new MessageBus();

// Test 1: Calcul simple
const response1 = await bus.requestStream('OIEAgent', 'executeQuery', [{
  query: "Combien font 15 * 23 + 100 ?"
}]);

for await (const chunk of response1) {
  console.log('Chunk:', chunk);
}

// Test 2: Lecture de document
const fileBuffer = ...; // ArrayBuffer du fichier
const response2 = await bus.requestStream('OIEAgent', 'executeQuery', [{
  query: "Résume ce document",
  attachedFile: {
    buffer: fileBuffer,
    type: "application/pdf",
    name: "document.pdf",
    size: fileBuffer.byteLength
  }
}]);

for await (const chunk of response2) {
  console.log('Chunk:', chunk);
}
```

### Option 3: Vérifier les Capacités

```typescript
const capabilities = await bus.request('OIEAgent', 'getCapabilities', []);
console.log('Capabilities:', capabilities);

// Retourne:
// {
//   supportsMultiAgent: true,
//   supportsFileAttachments: true,
//   supportsLLMPlanning: true,
//   availableAgents: [
//     'MainLLMAgent',
//     'CalculatorAgent',
//     'UniversalReaderAgent'
//   ]
// }
```

## 🔧 Configuration

### Activer/Désactiver le Planificateur LLM

Dans `src/agents/oie/index.ts`:

```typescript
const USE_LLM_PLANNER = true; // true = LLM intelligent, false = fallback naïf
```

**Quand utiliser le fallback:**
- Pour les tests unitaires (plus rapide)
- Quand le LLM n'est pas disponible
- Pour le débogage

## 📊 Événements de Stream à Écouter

Le système émet différents types d'événements:

```typescript
// Planification
{ type: 'planning', status: 'started' }
{ type: 'planning', status: 'completed', plan: "...", steps: 2 }

// Exécution des étapes
{ type: 'step_start', stepNumber: 1, agent: 'CalculatorAgent', action: 'calculate' }
{ type: 'agent_chunk', stepNumber: 1, agent: 'CalculatorAgent', chunk: {...} }
{ type: 'step_end', stepNumber: 1, agent: 'CalculatorAgent', success: true }

// Fin du plan
{ type: 'plan_complete', totalSteps: 2 }
```

## 🐛 Débogage

### Activer les logs détaillés

Ouvrir la console du navigateur, tous les agents loguent leurs actions:

```
[OIEAgent] 🚀 Initialisation Sprint 4...
[OIEAgent] 📨 Requête reçue: { query: "..." }
[OIEAgent] 🤖 Appel du LLM pour planification...
[OIEAgent] 📋 Plan généré: { thought: "...", steps: [...] }
[TaskExecutor] 🚀 Début de l'exécution du plan
[TaskExecutor] 📍 Étape 1/2: CalculatorAgent.calculate
[CalculatorAgent] 📊 Calcul de: 15 * 23 + 100
[CalculatorAgent] ✅ Résultat: 445
[TaskExecutor] ✅ Étape 1 terminée
...
```

### Problèmes Courants

**1. "Agent not found"**
- Vérifier que l'agent est bien importé et initialisé
- Vérifier l'orthographe du nom de l'agent dans le plan

**2. "Plan invalide"**
- Le LLM a peut-être retourné du JSON mal formaté
- Vérifier les logs: `[OIEAgent] Plan reçu: ...`
- Le système devrait automatiquement faire un fallback

**3. Interpolation ne fonctionne pas**
- Vérifier la syntaxe: `{{stepX_result.property}}`
- Les numéros d'étapes commencent à 1
- Pour le fallback, utiliser: `{{a ?? b}}`

## 📝 Exemples de Requêtes

### Calculs
```
"Combien font 15 * 23 + 100 ?"
"Calcule (100 + 200) * 3"
"Quelle est la racine carrée de 144 ?" (nécessite amélioration du calculateur)
```

### Conversation
```
"Explique-moi la photosynthèse"
"Qui es-tu ?"
"Raconte-moi une blague"
```

### Documents (avec fichier attaché)
```
"Résume ce document"
"Quels sont les points clés de ce PDF ?"
"Extrais les nombres du document et calcule leur somme"
```

### Multi-étapes
```
"Lis le document et calcule la somme des montants"
"Analyse ce texte et donne-moi un résumé puis un score de complexité"
```

## 🎯 Prochaines Améliorations

1. **UniversalReaderAgent réel**
   - Intégrer pdf.js pour PDF natifs
   - Intégrer Tesseract.js pour OCR
   - Appeler un LLM pour résumés réels

2. **CalculatorAgent avancé**
   - Utiliser math.js pour expressions complexes
   - Support des fonctions (sin, cos, sqrt, etc.)
   - Gestion des variables

3. **Tests Automatisés**
   - Tests unitaires pour TaskExecutor
   - Tests E2E pour scénarios multi-agents
   - Tests de performance

4. **Nouveaux Agents**
   - VisionAgent (analyse d'images)
   - CodeAgent (génération de code)
   - WebSearchAgent (recherche web)

## ✅ Validation

Pour valider que tout fonctionne:

1. ✅ TypeScript compile sans erreurs: `npx tsc --noEmit`
2. ✅ Page de test charge sans erreurs
3. ✅ Les 3 tests passent
4. ✅ Les logs montrent le flux complet

## 🎉 Félicitations !

Vous avez maintenant un **Orchestrateur Intelligent d'Exécution** capable de:
- 🧠 Planifier intelligemment avec un LLM
- 🔧 Exécuter des plans multi-agents
- 📄 Traiter des fichiers attachés
- 💾 Optimiser l'utilisation des tokens
- 📡 Streamer les résultats en temps réel

Le cerveau de **Kensho** est opérationnel ! 🚀
