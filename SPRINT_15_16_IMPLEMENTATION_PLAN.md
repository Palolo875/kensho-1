# 🚀 Sprint 15-16 - Implementation Plan
## Refactoring Complet & Résolution des Problèmes Critiques

**Date de création:** 3 décembre 2025  
**Status:** 🔴 EN COURS  
**Objectif:** Résoudre TOUS les problèmes identifiés dans l'analyse approfondie

---

## 📋 CHECKLIST GLOBALE

### ✅ Phase 1: TypeScript Strict (COMPLET)
- [x] ✅ `strict: true` déjà activé dans tsconfig.json
- [ ] 🔄 Vérifier et corriger toutes les erreurs TypeScript
- [ ] 🔄 Éliminer tous les types `any` restants
- [ ] 🔄 Ajouter `noUncheckedIndexedAccess: true`

### 🔄 Phase 2: Security Audit
- [ ] 🔴 Implémenter CSP Headers réels
- [ ] 🔴 Activer CSPManager dans l'application
- [ ] 🔴 Renforcer InputFilter avec plus de patterns
- [ ] 🔴 Audit complet des guardrails
- [ ] 🔴 Validation serveur (relay.js)

### 🔄 Phase 3: Architecture Refactoring
- [ ] 🔴 Splitter `useKenshoStore` en stores spécialisés
  - [ ] `useMessageStore`
  - [ ] `useModelStore`
  - [ ] `useProjectStore`
  - [ ] `useWorkerStore`
  - [ ] `useFileStore`
- [ ] 🔴 Remplacer les singletons globaux par DI
- [ ] 🔴 Lazy Loading des agents

### 🔄 Phase 4: Documentation
- [ ] 🔴 Créer QUICK_START_5MIN.md
- [ ] 🔴 Mettre à jour DEVELOPER_GUIDE.md
- [ ] 🔴 Ajouter diagrammes d'architecture
- [ ] 🔴 Créer tutoriel vidéo (optionnel)

---

## 🎯 TÂCHES DÉTAILLÉES

### **TASK 1: TypeScript Strict Compliance** ⏱️ 2-3h

#### 1.1 Activer noUncheckedIndexedAccess
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true  // ← AJOUTER
  }
}
```

#### 1.2 Corriger toutes les erreurs TypeScript
```bash
npm run type-check > typescript-errors.log
# Analyser et corriger une par une
```

#### 1.3 Éliminer les `any` types
**Fichiers prioritaires:**
- `src/stores/useKenshoStore.ts`
- `src/core/kernel/TaskExecutor.ts`
- `src/agents/oie/executor.ts`

**Remplacement pattern:**
```typescript
// ❌ AVANT
function process(data: any): any { ... }

// ✅ APRÈS
interface ProcessInput { /* ... */ }
interface ProcessOutput { /* ... */ }
function process(data: ProcessInput): ProcessOutput { ... }
```

---

### **TASK 2: Security Hardening** ⏱️ 3-4h

#### 2.1 Implémenter CSP Headers

**Fichier:** `src/security/CSPManager.ts`
```typescript
export class CSPManager {
  // Actuellement juste un manager, PAS appliqué
  
  // AJOUTER:
  public static applyToDocument(): void {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = this.generateCSP();
    document.head.appendChild(meta);
  }
  
  public static applyToServer(res: Response): void {
    res.setHeader('Content-Security-Policy', this.generateCSP());
  }
}
```

**Appliquer dans:** `src/main.tsx`
```typescript
import { CSPManager } from './security/CSPManager';

// Au démarrage
CSPManager.applyToDocument();
```

#### 2.2 Renforcer InputFilter

**Fichier:** `src/core/kernel/guardrails/InputFilter.ts`

Ajouter patterns:
- XSS attempts: `<script>`, `javascript:`, `onerror=`
- SQL injection: `'; DROP TABLE`, `UNION SELECT`
- Path traversal: `../`, `..\\`
- Command injection: `$(`, backticks

#### 2.3 Validation Serveur

**Fichier:** `server/relay.secure.js`

Ajouter Zod validation:
```javascript
import { z } from 'zod';

const MessageSchema = z.object({
  type: z.enum(['request', 'response', 'stream']),
  payload: z.any(),
  messageId: z.string().uuid()
});

ws.on('message', (raw) => {
  const result = MessageSchema.safeParse(JSON.parse(raw));
  if (!result.success) {
    ws.close(1003, 'Invalid message format');
    return;
  }
  // ...
});
```

---

### **TASK 3: Store Refactoring** ⏱️ 4-5h

#### 3.1 Créer les Stores Spécialisés

**Structure:**
```
src/stores/
├── useMessageStore.ts     (messages, isKenshoWriting)
├── useModelStore.ts       (modelProgress, downloads)
├── useProjectStore.ts     (projects, tasks)
├── useWorkerStore.ts      (workerErrors, workersReady)
├── useFileStore.ts        (attachedFile, uploadProgress)
└── index.ts               (exports)
```

**Template:**
```typescript
// src/stores/useMessageStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Message {
  id: string;
  text: string;
  author: 'user' | 'kensho';
  timestamp: number;
}

interface MessageStore {
  messages: Message[];
  isKenshoWriting: boolean;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
}

export const useMessageStore = create<MessageStore>()(
  persist(
    (set) => ({
      messages: [],
      isKenshoWriting: false,
      addMessage: (message) => set((state) => ({ 
        messages: [...state.messages, message] 
      })),
      clearMessages: () => set({ messages: [] }),
    }),
    { name: 'kensho-messages' }
  )
);
```

#### 3.2 Migration du Code

**Pattern de remplacement:**
```typescript
// ❌ AVANT (useKenshoStore.ts - 1000+ lignes)
const { messages, modelProgress, attachedFile } = useKenshoStore();

// ✅ APRÈS (stores séparés)
const { messages } = useMessageStore();
const { modelProgress } = useModelStore();
const { attachedFile } = useFileStore();
```

---

### **TASK 4: Lazy Loading Agents** ⏱️ 2h

#### 4.1 Dynamic Imports

**Avant:**
```typescript
// src/kensho.ts
import { OIEAgent } from './agents/oie';
import { CalculatorAgent } from './agents/calculator';
```

**Après:**
```typescript
// src/core/kernel/AgentLoader.ts
export class AgentLoader {
  private loadedAgents = new Map<string, any>();
  
  async loadAgent(name: string): Promise<any> {
    if (this.loadedAgents.has(name)) {
      return this.loadedAgents.get(name);
    }
    
    let module;
    switch (name) {
      case 'oie':
        module = await import('../agents/oie');
        break;
      case 'calculator':
        module = await import('../agents/calculator');
        break;
      // ...
    }
    
    this.loadedAgents.set(name, module);
    return module;
  }
}
```

#### 4.2 Preload Critical Agents

```typescript
// src/main.tsx
const agentLoader = new AgentLoader();

// Preload OIE (always needed)
agentLoader.loadAgent('oie');

// Lazy load others on-demand
```

---

### **TASK 5: Quick Start Guide** ⏱️ 1-2h

**Fichier:** `QUICK_START_5MIN.md`

**Structure:**
```markdown
# 🚀 Kensho - Quick Start (5 minutes)

## Prerequisites
- Node.js 20+
- 8GB RAM minimum
- WebGPU-capable browser (Chrome 113+)

## Step 1: Clone & Install (2 min)
\`\`\`bash
git clone https://github.com/Palolo875/kensho-1.git
cd kensho-1
npm install
\`\`\`

## Step 2: Start Dev Server (30 sec)
\`\`\`bash
npm run dev
\`\`\`

## Step 3: First Conversation (2 min)
1. Open http://localhost:8080
2. Wait for model download (first time only)
3. Type: "Calculate 42 * 137"
4. See multi-agent orchestration in action!

## Next Steps
- Read [USER_MANUAL.md](./USER_MANUAL.md)
- Explore [ARCHITECTURE.md](./ARCHITECTURE.md)
- Join our community
```

---

## 📊 MÉTRIQUES DE SUCCÈS

### Avant Refactoring
- ❌ TypeScript errors: ~X (à mesurer)
- ❌ `any` types: ~Y occurrences
- ❌ CSP: Non appliqué
- ❌ Store: Monolithique (1000+ lignes)
- ❌ Bundle size: ~Z MB

### Après Refactoring (Objectifs)
- ✅ TypeScript errors: 0
- ✅ `any` types: < 5 (seulement cas justifiés)
- ✅ CSP: Appliqué avec strict policy
- ✅ Stores: 5 stores < 200 lignes chacun
- ✅ Bundle size: -20% (lazy loading)
- ✅ Quick Start: Existe et testé

---

## 🗓️ PLANNING

### Jour 1 (Aujourd'hui)
- [x] Créer ce plan d'implémentation
- [ ] TASK 1: TypeScript Strict (2-3h)
- [ ] TASK 2.1: CSP Headers (1h)

### Jour 2
- [ ] TASK 2.2-2.3: Security (2h)
- [ ] TASK 3.1: Créer stores (2h)

### Jour 3
- [ ] TASK 3.2: Migration (2h)
- [ ] TASK 4: Lazy Loading (2h)

### Jour 4
- [ ] TASK 5: Quick Start (1h)
- [ ] Testing complet
- [ ] Documentation update

---

## 🚨 RISQUES & MITIGATIONS

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Breaking changes dans stores | ⚠️ Haut | Tests unitaires + migration progressive |
| TypeScript errors en cascade | ⚠️ Moyen | Fix par fichier, commit fréquents |
| CSP bloque resources légitimes | ⚠️ Moyen | Tester sur tous les environnements |
| Lazy loading ralentit UX | ⚠️ Faible | Preload agents critiques |

---

## 📝 NOTES D'IMPLÉMENTATION

- Créer une branche `sprint-15-16-refactoring`
- Commits atomiques pour chaque tâche
- Tests après chaque changement majeur
- Documentation inline avec JSDoc
- Peer review avant merge

---

**Dernière mise à jour:** 3 décembre 2025, 21:20
**Status:** 🔴 Phase 1 en cours
