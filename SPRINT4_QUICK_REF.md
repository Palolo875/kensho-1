# 📌 Sprint 4 - Référence Rapide

## 🚀 Démarrage en 30 Secondes

```bash
# 1. Démarrer le serveur
npm run dev

# 2. Ouvrir dans le navigateur
http://localhost:5173/tests/browser/sprint4-oie-multi-agents.html

# 3. Cliquer sur les boutons de test !
```

---

## 🎯 Ce qui a été Fait

### Nouveaux Agents
- **CalculatorAgent** → Calculs mathématiques
- **UniversalReaderAgent** → Lecture PDF/images + résumés

### Nouveau Système
- **LLMPlanner** → Génère des plans intelligents
- **TaskExecutor** → Exécute les plans multi-agents
- **Support Fichiers** → Attachez des documents aux requêtes

---

## 💻 API Rapide

### Utiliser l'OIE

```typescript
import { MessageBus } from './src/core/communication/MessageBus';

const bus = new MessageBus();

// Calcul
await bus.requestStream('OIEAgent', 'executeQuery', [{
  query: "Combien font 15 * 23 + 100 ?"
}]);

// Document
await bus.requestStream('OIEAgent', 'executeQuery', [{
  query: "Résume ce document",
  attachedFile: { buffer, type, name, size }
}]);
```

### Créer un Nouvel Agent

```typescript
// 1. Créer src/agents/mon-agent/manifest.ts
export const monAgentManifest = {
  name: 'MonAgent',
  description: 'Description courte',
  methods: [{
    name: 'action',
    args: [...],
    returns: { type: 'object', properties: {...} }
  }]
};

// 2. Créer src/agents/mon-agent/index.ts
runAgent({
  name: 'MonAgent',
  init: (runtime) => {
    runtime.registerMethod('action', (param) => {
      return { result: '...' };
    });
  }
});

// 3. Ajouter dans oie/prompts.ts
import { monAgentManifest } from '../mon-agent/manifest';
// ... puis l'inclure dans le prompt
```

---

## 📊 Plans JSON

### Structure
```json
{
  "thought": "Ma stratégie",
  "steps": [
    {
      "agent": "NomAgent",
      "action": "methode",
      "args": { "param": "{{interpolation}}" }
    }
  ]
}
```

### Interpolations
```javascript
{{step1_result}}                    // Résultat complet
{{step1_result.property}}           // Propriété
{{step1_result.a ?? step1_result.b}} // Fallback
{{attached_file_buffer}}            // Fichier
```

---

## 🔧 Configuration

### Activer/Désactiver LLM
```typescript
// src/agents/oie/index.ts
const USE_LLM_PLANNER = true;  // true = LLM, false = naïf
```

---

## 📚 Documentation

| Fichier | Contenu |
|---------|---------|
| **README-SPRINT4.md** | Vue d'ensemble |
| **docs/SPRINT4_QUICKSTART.md** | Guide complet |
| **docs/SPRINT4_PLAN_EXAMPLES.md** | Exemples JSON |
| **docs/SPRINT4_ARCHITECTURE.md** | Diagrammes |

---

## 🐛 Debug

### Logs dans la Console
```
[OIEAgent] 📨 Requête reçue
[OIEAgent] 🤖 Appel du LLM pour planification
[OIEAgent] 📋 Plan généré
[TaskExecutor] 📍 Étape 1/2
[CalculatorAgent] ✅ Résultat: 445
```

### Problèmes Courants

**"Agent not found"**
→ Vérifier le nom dans le plan JSON

**"Plan invalide"**  
→ Le LLM a retourné du JSON mal formaté
→ Fallback automatique activé

**Interpolation échoue**
→ Vérifier: `{{stepX_result}}` (X commence à 1)

---

## ✅ Checklist

- [ ] Lire README-SPRINT4.md
- [ ] Tester la page HTML
- [ ] Voir un exemple de plan
- [ ] Comprendre l'interpolation
- [ ] Explorer le code

---

## 📁 Structure

```
src/agents/
├── calculator/          # Agent calcul
│   ├── index.ts
│   └── manifest.ts
├── universal-reader/    # Agent lecture
│   ├── index.ts
│   └── manifest.ts
└── oie/                 # Orchestrateur
    ├── index.ts         # Modifié
    ├── executor.ts      # Nouveau
    ├── prompts.ts       # Nouveau
    └── README-SPRINT4.md
```

---

## 🎯 Agents Disponibles

| Agent | Action | Args | Returns |
|-------|--------|------|---------|
| **MainLLMAgent** | generateResponse | prompt | string (stream) |
| **CalculatorAgent** | calculate | expression | { result, expression } |
| **UniversalReaderAgent** | read | fileBuffer, fileType | { fullText, summary, ... } |

---

## 🌟 Exemples Rapides

### Plan Simple
```json
{
  "thought": "Calcul simple",
  "steps": [{
    "agent": "CalculatorAgent",
    "action": "calculate",
    "args": { "expression": "15 * 23 + 100" }
  }]
}
```

### Plan Multi-Étapes
```json
{
  "thought": "Lire puis calculer",
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
      "agent": "CalculatorAgent",
      "action": "calculate",
      "args": { "expression": "{{step1_result.extractedValue}}" }
    }
  ]
}
```

---

## 💡 Tips

1. **Optimiser tokens** → Utiliser `summary ?? fullText`
2. **Plans courts** → Moins d'étapes = mieux
3. **Logs détaillés** → Console = votre ami
4. **Tester souvent** → Page HTML interactive
5. **Lire exemples** → SPRINT4_PLAN_EXAMPLES.md

---

## 📞 Besoin d'Aide ?

1. **Comprendre l'architecture** → SPRINT4_ARCHITECTURE.md
2. **Voir des exemples** → SPRINT4_PLAN_EXAMPLES.md  
3. **API détaillée** → oie/README-SPRINT4.md
4. **Tout explorer** → SPRINT4_FILES_INDEX.md

---

**Version:** 4.0.0  
**Status:** ✅ Production Ready  
**Date:** 2025-11-22

🚀 **Let's go!**
