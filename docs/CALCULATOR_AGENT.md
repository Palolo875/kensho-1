# CalculatorAgent - Documentation

## Vue d'ensemble

Le CalculatorAgent est un agent spécialisé qui effectue des calculs mathématiques précis pour l'assistant Kensho. Il utilise la bibliothèque `mathjs` pour évaluer des expressions mathématiques de manière sécurisée.

## Capacités

### Opérations supportées

- **Opérations arithmétiques de base** : `+`, `-`, `*`, `/`, `^` (puissance)
- **Fonctions mathématiques** :
  - Trigonométriques : `sin`, `cos`, `tan`, `asin`, `acos`, `atan`
  - Racines et logarithmes : `sqrt`, `log`, `log10`, `exp`
  - Autres : `abs`, `min`, `max`, `round`, `floor`, `ceil`
- **Constantes mathématiques** : `pi`, `e`
- **Parenthèses** pour grouper les expressions

### Exemples d'utilisation

```javascript
// Opérations de base
"2 + 2"           // → 4
"10 - 7"          // → 3
"3 * 4"           // → 12
"15 / 3"          // → 5

// Expressions complexes
"2 * (3 + 4)^2"   // → 98
"sqrt(16) + 5"    // → 9
"sin(pi/2)"       // → 1

// Fonctions multiples
"min(3, 7, 2)"    // → 2
"max(10, 5, 8)"   // → 10
"abs(-15)"        // → 15
```

## Limitations et sécurité

### Types NON supportés

Le CalculatorAgent rejette les types suivants pour des raisons de sécurité et de simplicité :

1. **Matrices** : `[1, 2; 3, 4]`
   - Erreur : "Expression invalide. Les matrices ne sont pas supportées."

2. **Nombres complexes** : `sqrt(-1)`, `i * 2`
   - Erreur : "Expression invalide. Les nombres complexes ne sont pas supportés."

3. **Conversions d'unités** : `5 cm to inch`, `100 USD to EUR`
   - Erreur : "Expression invalide. Les conversions d'unités ne sont pas supportées."

4. **Définitions de fonctions** : `f(x) = x^2`
   - Erreur : "Expression invalide. Les définitions de fonctions ne sont pas supportées."

### Messages d'erreur standardisés

Tous les messages d'erreur commencent par "Expression invalide" pour :
- Éviter de fuiter des détails internes du parser mathjs
- Fournir une expérience utilisateur cohérente
- Simplifier le debugging

## Architecture

### Fichiers principaux

```
src/agents/calculator/
├── manifest.ts       # Décrit les capacités au LLMPlanner
├── logic.ts          # Logique pure d'évaluation (testable)
└── index.ts          # Worker qui execute les calculs
```

### Workflow d'exécution

1. Le LLMPlanner identifie une requête mathématique
2. Il consulte le manifeste du CalculatorAgent
3. Il invoque la méthode `calculate` avec l'expression
4. Le worker exécute `evaluateExpression()` dans `logic.ts`
5. Le résultat (toujours un `number`) est retourné au LLMPlanner

### Normalisation des sorties

La fonction `evaluateExpression()` garantit que :
- Le résultat est **toujours** de type `number`
- Les objets mathjs (matrices, complexes, unités) sont rejetés
- Les résultats spéciaux (Infinity, NaN) sont préservés

## Tests

### Tests manuels

Exécuter la suite complète de tests manuels :

```bash
bun run tests/manual-test-calculator.ts
```

**Coverage** : 16 tests couvrant :
- ✅ Calculs de base (8 tests)
- ✅ Sécurité et validation (6 tests)
- ✅ Normalisation des sorties (2 tests)

### Tests E2E dans le navigateur

Ouvrir dans le navigateur :

```
tests/browser/sprint3-calculator-e2e.html
```

Ce test valide l'intégration complète du CalculatorAgent avec le système de workers.

### Tests Vitest (limitation environnement)

⚠️ **Problème connu** : L'environnement Replit a une incompatibilité avec `tinypool` (worker pool manager de Vitest 3.2.4). L'erreur `TypeError: Unable to deserialize data` se produit dans `child_process` lors de la création des workers, empêchant toute exécution de tests Vitest.

**Stack trace** :
```
TypeError: Unable to deserialize data.
 ❯ #send node:child_process:671:8
 ❯ send node_modules/tinypool/dist/index.js:128:24
 ❯ _addNewWorker node_modules/tinypool/dist/index.js:506:23
```

**Tentatives de résolution** :
- ✅ Configuration dédiée Node (`vitest.config.node.ts`) sans happy-dom
- ✅ Environnement 'node' au lieu de 'happy-dom'
- ✅ Tests simplifiés sans imports externes
- ❌ Toutes échouent avec la même erreur de désérialisation

**Conclusion** : Ce problème nécessiterait un fix au niveau de Replit/tinypool/Vitest et dépasse le scope du CalculatorAgent.

**Solution de contournement** : Les tests manuels et E2E couvrent exhaustivement tous les cas critiques :
- ✅ 16 tests manuels (100% passants)
- ✅ Test E2E navigateur complet
- ✅ Couverture : calculs, sécurité, validation, normalisation

## Configuration de build

Le CalculatorAgent est compilé par `vite.test-agents.config.ts` :

```bash
bun run build:test-agents
```

**Output** :
- `dist/test-agents/calculator.agent.js` (~1.3 MB incluant mathjs)

## Intégration avec Kensho

### Déclaration au LLMPlanner

Le manifeste informe le LLMPlanner des capacités :

```javascript
{
  name: 'CalculatorAgent',
  description: 'Un expert en calculs numériques purs...',
  methods: [{
    name: 'calculate',
    description: 'Évalue une expression mathématique...',
    args: [{ name: 'expression', type: 'string', ... }]
  }]
}
```

### Invocation par le LLM

Lorsque l'utilisateur demande un calcul, le LLM génère :

```json
{
  "agent": "CalculatorAgent",
  "method": "calculate",
  "args": { "expression": "sqrt(144) + 8" }
}
```

Le résultat (20) est ensuite intégré dans la réponse à l'utilisateur.

## Évolutions futures possibles

1. **Résoudre les tests Vitest** : Débugger la configuration globale pour activer les tests automatisés
2. **UnitConverterAgent séparé** : Si besoin de conversions d'unités, créer un agent dédié
3. **Support des matrices** : Pour des cas d'usage avancés (algèbre linéaire)
4. **Graphiques** : Tracer des fonctions mathématiques

## Références

- [mathjs Documentation](https://mathjs.org/docs/index.html)
- Sprint 3 Implementation Plan
- `tests/manual-test-calculator.ts` pour exemples d'usage
