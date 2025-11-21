# 🎯 Sprint 3 : Plan d'Implémentation Détaillé

**Date de début** : 2025-11-21  
**Objectif** : Transformer Kensho en assistant agentique complet avec LLM réel, tests robustes, et mémoire long-terme

---

## 📋 Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Phase 1 : Infrastructure & Tests](#phase-1--infrastructure--tests)
3. [Phase 2 : Real LLM Integration](#phase-2--real-llm-integration)
4. [Phase 3 : Long-Term Memory](#phase-3--long-term-memory)
5. [Phase 4 : Polish & Production](#phase-4--polish--production)

---

## 🎯 Vue d'Ensemble

### Priorités (dans l'ordre)

```
1. Tests React Components    (2 jours)   - Fondation pour éviter régressions
2. Error Handling UI          (1 jour)    - Améliore UX avant LLM réel
3. Real LLM Integration       (3 jours)   - Feature principale Sprint 3
4. IndexedDB Migration        (1 jour)    - Scalabilité conversations
5. Long-Term Memory (RAG)     (2 jours)   - Feature avancée
```

### Philosophie

- ✅ **Tests d'abord** : Avant de toucher au LLM, on sécurise ce qui existe
- ✅ **Incrémental** : Petits commits, validation continue
- ✅ **Rollback-friendly** : Chaque phase peut être annulée sans casser le reste
- ✅ **Documentation as code** : Chaque feature = ADR (Architecture Decision Record)

---

## 📦 Phase 1 : Infrastructure & Tests (Jours 1-2)

### Objectif
Sécuriser la base de code existante avec des tests React avant de faire des changements majeurs.

### Tâches

#### 1.1 - Setup Testing Infrastructure

**Fichiers à créer :**
```bash
tests/setup/
├── react-test-utils.tsx       # Helpers de test (mock store, etc.)
└── vitest-setup.ts             # Configuration globale Vitest
```

**Actions :**
```bash
# Installer les dépendances
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

**Fichier de config à modifier :**
- `vitest.config.ts` : Ajouter `environment: 'happy-dom'`

**Validation :**
```bash
npm run test:unit -- --run
# Doit afficher "No test files found" mais pas d'erreur
```

---

#### 1.2 - Tests pour ModelLoadingView

**Fichier à créer :**
```
src/components/__tests__/ModelLoadingView.test.tsx
```

**Scénarios à tester :**
1. ✅ Phase "idle" → Affiche "Initialisation..."
2. ✅ Phase "downloading" → Affiche barre de progression + stats
3. ✅ Phase "compiling" → Affiche "Compilation..."
4. ✅ Phase "ready" → Composant disparaît (return null)
5. ✅ Phase "error" → Affiche message d'erreur
6. ✅ Bouton pause/resume fonctionne
7. ✅ Minimisation fonctionne

**Template de test :**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelLoadingView } from '../ModelLoadingView';
import { useKenshoStore } from '@/stores/useKenshoStore';

// Mock du store
vi.mock('@/stores/useKenshoStore');

describe('ModelLoadingView', () => {
  it('affiche la phase de téléchargement', () => {
    vi.mocked(useKenshoStore).mockReturnValue({
      modelProgress: { 
        phase: 'downloading', 
        progress: 0.5, 
        text: 'Téléchargement...' 
      }
    });
    
    render(<ModelLoadingView />);
    expect(screen.getByText(/Téléchargement/)).toBeInTheDocument();
  });
  
  // ... autres tests
});
```

**Validation :**
```bash
npm run test:unit -- ModelLoadingView
# Tous les tests passent ✅
```

---

#### 1.3 - Tests pour ChatInput

**Fichier à créer :**
```
src/components/__tests__/ChatInput.test.tsx
```

**Scénarios :**
1. ✅ Input désactivé si `modelReady = false`
2. ✅ Input désactivé si `isKenshoWriting = true`
3. ✅ Soumission appelle `sendMessage()`
4. ✅ Input se vide après soumission
5. ✅ Suggestions affichées si `showSuggestions = true`
6. ✅ Bouton attachement présent
7. ✅ Bouton voix présent

**Validation :**
```bash
npm run test:unit -- ChatInput
```

---

#### 1.4 - Tests pour AIResponse

**Fichier à créer :**
```
src/components/__tests__/AIResponse.test.tsx
```

**Scénarios :**
1. ✅ Affiche le contenu du message
2. ✅ Affiche "thinking" si fourni
3. ✅ Section thinking peut être collapsed/expanded
4. ✅ Boutons d'action présents (like, copy, regenerate)

**Validation :**
```bash
npm run test:unit -- AIResponse
```

---

#### 1.5 - Tests pour MessageBubble

**Fichier à créer :**
```
src/components/__tests__/MessageBubble.test.tsx
```

**Scénarios :**
1. ✅ Affiche le texte du message
2. ✅ Menu dropdown présent
3. ✅ Options : Edit, Archive, Delete

---

#### 1.6 - Tests d'intégration Index.tsx

**Fichier à créer :**
```
src/pages/__tests__/Index.test.tsx
```

**Scénarios :**
1. ✅ Appelle `init()` au montage
2. ✅ Affiche ModelLoadingView si `!modelReady`
3. ✅ Affiche chat si `modelReady`
4. ✅ Auto-scroll fonctionne

---

### Livrable Phase 1

- ✅ 20+ tests React qui passent
- ✅ Coverage > 70% sur components/
- ✅ CI passe sans erreur
- ✅ Commit : `test: Add comprehensive React component tests`

---

## 🎨 Phase 2A : Error Handling UI (Jour 3)

### Objectif
Ajouter un système de notifications Toast pour les erreurs système.

### Tâches

#### 2A.1 - Ajouter Sonner Toast

**Déjà installé :** `sonner` est dans `package.json` ✅

**Fichier à créer :**
```
src/hooks/useToast.ts
```

**Contenu :**
```typescript
import { toast } from 'sonner';

export const useToast = () => ({
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast.info(message),
});
```

---

#### 2A.2 - Intégrer dans useKenshoStore

**Fichier à modifier :**
```
src/stores/useKenshoStore.ts
```

**Changements :**
```typescript
// Au lieu de mettre l'erreur dans le message Kensho
onError: (error) => {
  toast.error(`Erreur de communication: ${error.message}`);
  set({ isKenshoWriting: false });
}
```

---

#### 2A.3 - Gérer les erreurs Workers

**Dans `startConstellation` :**
```typescript
llmWorker.onerror = (error) => {
  toast.error('❌ Le worker LLM a crashé. Tentative de redémarrage...');
  // Logique de retry
};
```

---

### Livrable Phase 2A

- ✅ Toasts affichés pour erreurs système
- ✅ Messages Kensho ne contiennent plus d'erreurs techniques
- ✅ UX améliorée
- ✅ Commit : `feat(ui): Add toast notifications for system errors`

---

## 🧠 Phase 2B : Real LLM Integration (Jours 4-6)

### Objectif
Résoudre le build OOM et activer le vrai WebLLM.

### Stratégie : Dynamic Import

Au lieu de bundler `@mlc-ai/web-llm` dans le worker, on va le charger dynamiquement.

---

#### 2B.1 - Créer un nouveau LLM Agent avec Dynamic Import

**Fichier à créer :**
```
src/agents/llm/dynamic.ts
```

**Contenu :**
```typescript
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';

runAgent({
  name: 'MainLLMAgent',
  init: async (runtime: AgentRuntime) => {
    runtime.log('info', 'Chargement dynamique de WebLLM...');
    
    // Import dynamique (ne sera PAS bundlé)
    const webllm = await import('@mlc-ai/web-llm');
    const engine = await webllm.CreateMLCEngine('Phi-3-mini-4k-instruct-q4f16_1-MLC');
    
    runtime.log('info', 'WebLLM chargé avec succès');
    
    // Progression du modèle
    engine.setInitProgressCallback((report) => {
      self.postMessage({
        type: 'MODEL_PROGRESS',
        payload: {
          phase: report.progress < 1 ? 'downloading' : 'compiling',
          progress: report.progress,
          text: report.text
        }
      });
    });
    
    self.postMessage({ type: 'READY' });
    
    runtime.registerStreamMethod('generateResponse', async (payload, stream) => {
      const [prompt] = payload.args;
      
      const messages = [{ role: 'user', content: prompt }];
      
      // Streaming avec WebLLM
      const completion = await engine.chat.completions.create({
        messages,
        stream: true,
      });
      
      for await (const chunk of completion) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) stream.chunk({ text });
      }
      
      stream.end();
    });
  }
});
```

---

#### 2B.2 - Configuration Build Optimisée

**Fichier à créer :**
```
vite.llm-dynamic.config.ts
```

**Contenu :**
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/agents/llm/dynamic.ts',
      name: 'LLMAgent',
      fileName: 'llm.agent',
      formats: ['es']
    },
    rollupOptions: {
      external: ['@mlc-ai/web-llm'], // NE PAS bundler WebLLM
      output: {
        globals: {
          '@mlc-ai/web-llm': 'webllm'
        }
      }
    }
  }
});
```

---

#### 2B.3 - CDN Fallback pour WebLLM

**Option alternative si dynamic import échoue :**

Charger WebLLM depuis un CDN dans le worker :

```typescript
// Dans dynamic.ts
importScripts('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@latest/dist/index.js');
```

---

#### 2B.4 - Fallback vers Mock si échec

**Fichier à modifier :**
```
src/stores/useKenshoStore.ts - fonction startConstellation
```

**Logique :**
```typescript
const startLLMWorker = () => {
  try {
    // Essayer d'abord le vrai LLM
    const llmWorker = new Worker('/dist/agents/llm.agent.js', { type: 'module' });
    
    llmWorker.onerror = () => {
      console.error('Échec LLM réel, fallback vers Mock');
      toast.info('⚙️ Utilisation du mode simulation (Mock LLM)');
      
      // Charger le Mock
      const mockWorker = new Worker('/dist/test-agents/llm.agent.js', { type: 'module' });
      // ... setup
    };
    
  } catch {
    // Fallback immédiat vers Mock
  }
};
```

---

#### 2B.5 - Tests avec Modèles Légers

**Modèles à tester (par ordre de taille) :**

1. **TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC** (~700MB) - Déjà dans le code
2. **Phi-3-mini-4k-instruct-q4f16_1-MLC** (~2GB) - Recommandé
3. **Qwen2.5-0.5B-Instruct-q4f16_1-MLC** (~350MB) - Le plus léger

**Stratégie :**
- Commencer par Qwen 0.5B pour valider le flow
- Monter en gamme si ça passe

---

### Validation Phase 2B

**Checklist :**
```bash
# 1. Build sans OOM
npm run build:llm-dynamic
# ✅ Génère dist/agents/llm.agent.js sans crasher

# 2. Test mémoire
# Ouvrir Chrome DevTools > Memory
# Lancer l'app, vérifier que mémoire < 500MB pendant chargement modèle

# 3. Test fonctionnel
# Envoyer un message, vérifier streaming fonctionne

# 4. Test fallback
# Simuler échec (renommer le fichier worker), vérifier que Mock prend le relais
```

---

### Livrable Phase 2B

- ✅ LLM réel fonctionne en production
- ✅ Build ne fait plus OOM
- ✅ Fallback gracieux vers Mock si échec
- ✅ Commit : `feat(llm): Dynamic import for WebLLM with graceful fallback`

---

## 💾 Phase 3 : IndexedDB Migration (Jour 7)

### Objectif
Migrer de `localStorage` (limité à ~5MB) vers IndexedDB (~50MB-1GB).

---

### 3.1 - Créer le Storage Adapter

**Fichier à créer :**
```
src/core/storage/ConversationStore.ts
```

**Contenu :**
```typescript
import { openDB, IDBPDatabase } from 'idb';
import { Message } from '@/stores/useKenshoStore';

const DB_NAME = 'kensho-db';
const STORE_NAME = 'conversations';
const DB_VERSION = 1;

class ConversationStore {
  private db: IDBPDatabase | null = null;

  async init() {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
        }
      },
    });
  }

  async saveMessages(messages: Message[]) {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(STORE_NAME, 'readwrite');
    
    // Sauvegarder chaque message
    for (const msg of messages) {
      await tx.store.put(msg);
    }
    
    await tx.done;
  }

  async loadMessages(): Promise<Message[]> {
    if (!this.db) await this.init();
    return this.db!.getAll(STORE_NAME);
  }

  async clearAll() {
    if (!this.db) await this.init();
    await this.db!.clear(STORE_NAME);
  }
}

export const conversationStore = new ConversationStore();
```

**Dépendance à installer :**
```bash
npm install idb
```

---

### 3.2 - Modifier useKenshoStore

**Fichier à modifier :**
```
src/stores/useKenshoStore.ts
```

**Changements :**
```typescript
import { conversationStore } from '../core/storage/ConversationStore';

// Remplacer loadMessagesFromLocalStorage
const loadMessagesFromStorage = async (): Promise<Message[]> => {
  try {
    return await conversationStore.loadMessages();
  } catch (error) {
    console.error('[KenshoStore] Erreur IndexedDB, fallback localStorage');
    // Fallback vers localStorage
    const stored = localStorage.getItem('kensho_conversation_history');
    return stored ? JSON.parse(stored) : [];
  }
};

// Remplacer saveMessagesToLocalStorage
const saveMessagesToStorage = async (messages: Message[]) => {
  try {
    await conversationStore.saveMessages(messages);
  } catch (error) {
    console.error('[KenshoStore] Erreur IndexedDB');
  }
};
```

---

### 3.3 - Migration des Données Existantes

**Fichier à créer :**
```
src/utils/migrateToIndexedDB.ts
```

**Script de migration :**
```typescript
export async function migrateLocalStorageToIndexedDB() {
  const oldData = localStorage.getItem('kensho_conversation_history');
  if (!oldData) return;
  
  const messages = JSON.parse(oldData);
  await conversationStore.saveMessages(messages);
  
  // Garder localStorage comme backup pendant 1 version
  console.log('✅ Migration vers IndexedDB terminée');
}
```

**Appeler dans `useKenshoStore.init()` :**
```typescript
init: async () => {
  await migrateLocalStorageToIndexedDB();
  // ... reste
}
```

---

### Validation Phase 3

```bash
# 1. Ouvrir DevTools > Application > IndexedDB
# Vérifier que "kensho-db" existe avec les messages

# 2. Envoyer 500 messages (script de test)
# Vérifier que tout fonctionne (localStorage aurait crashé)
```

---

### Livrable Phase 3

- ✅ Conversations stockées dans IndexedDB
- ✅ Capacité : 50MB+ (vs 5MB localStorage)
- ✅ Migration automatique depuis localStorage
- ✅ Commit : `feat(storage): Migrate to IndexedDB for scalable conversation storage`

---

## 🧠 Phase 4 : Long-Term Memory (RAG Lite) (Jours 8-9)

### Objectif
Donner à Kensho une mémoire contextuelle via RAG simple.

---

### 4.1 - Embeddings avec Transformers.js

**Installer :**
```bash
npm install @xenova/transformers
```

**Fichier à créer :**
```
src/core/memory/EmbeddingEngine.ts
```

**Contenu :**
```typescript
import { pipeline } from '@xenova/transformers';

class EmbeddingEngine {
  private embedder: any = null;

  async init() {
    this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  async embed(text: string): Promise<number[]> {
    const output = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }
}

export const embeddingEngine = new EmbeddingEngine();
```

---

### 4.2 - Vector Store Simple

**Fichier à créer :**
```
src/core/memory/VectorStore.ts
```

**Contenu :**
```typescript
interface MemoryEntry {
  id: string;
  text: string;
  embedding: number[];
  timestamp: number;
}

class VectorStore {
  private memories: MemoryEntry[] = [];

  async add(text: string) {
    const embedding = await embeddingEngine.embed(text);
    this.memories.push({
      id: `mem-${Date.now()}`,
      text,
      embedding,
      timestamp: Date.now()
    });
  }

  async search(query: string, topK = 3): Promise<string[]> {
    const queryEmbedding = await embeddingEngine.embed(query);
    
    // Cosine similarity
    const similarities = this.memories.map(mem => ({
      text: mem.text,
      score: this.cosineSimilarity(queryEmbedding, mem.embedding)
    }));
    
    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => s.text);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dot / (magA * magB);
  }
}

export const vectorStore = new VectorStore();
```

---

### 4.3 - Intégrer RAG dans le Flux

**Fichier à modifier :**
```
src/stores/useKenshoStore.ts - sendMessage()
```

**Changement :**
```typescript
sendMessage: async (text) => {
  // 1. Rechercher dans la mémoire
  const relevantMemories = await vectorStore.search(text);
  
  // 2. Construire le contexte
  const context = relevantMemories.length > 0 
    ? `Contexte pertinent:\n${relevantMemories.join('\n')}\n\n`
    : '';
  
  // 3. Envoyer avec contexte
  const enrichedQuery = context + text;
  
  // 4. Après réponse, stocker dans mémoire
  vectorStore.add(`User: ${text}\nKensho: ${responseText}`);
}
```

---

### Validation Phase 4

**Test manuel :**
```
1. "Je m'appelle Alice"
2. (20 messages plus tard) "Comment je m'appelle ?"
3. Kensho doit répondre "Alice"
```

---

### Livrable Phase 4

- ✅ RAG fonctionnel avec embeddings
- ✅ Top-3 retrieval
- ✅ Mémoire persistante
- ✅ Commit : `feat(memory): Add RAG-based long-term memory with embeddings`

---

## 🎨 Phase 5 : Polish & Production (Jour 10)

### 5.1 - Refactor & Code Review

- ✅ Revoir tous les TODOs
- ✅ Nettoyer les console.log
- ✅ Vérifier les types TypeScript
- ✅ Formater avec Prettier

---

### 5.2 - Documentation

**Fichiers à mettre à jour :**
- `README.md` : Ajouter section RAG + Real LLM
- `SPRINT3_COMPLETION.md` : Rapport final
- `docs/GETTING_STARTED.md` : Instructions mise à jour

---

### 5.3 - Performance Check

**Benchmarks à lancer :**
```bash
npm run benchmark:throughput
npm run benchmark:latency
```

---

### 5.4 - Final Commit & Release

```bash
git add .
git commit -m "feat: Complete Sprint 3 - Real LLM, Tests, RAG, IndexedDB"
git tag v0.3.0
git push origin sprint-3 --tags
```

---

## 📊 Résumé du Plan

| Phase | Durée | Priorité | Risque |
|-------|-------|----------|--------|
| 1. Tests React | 2j | 🔴 Haute | Faible |
| 2A. Error UI | 1j | 🟡 Moyenne | Faible |
| 2B. Real LLM | 3j | 🔴 Haute | **Élevé** (OOM) |
| 3. IndexedDB | 1j | 🟢 Basse | Faible |
| 4. RAG | 2j | 🟡 Moyenne | Moyen |
| 5. Polish | 1j | 🟢 Basse | Faible |

**Total : ~10 jours**

---

## 🚨 Points de Vigilance

### Build OOM (Phase 2B)

**Si le dynamic import ne résout pas le OOM :**

**Plan B :** Utiliser un CDN externe
```typescript
// Charger WebLLM depuis esm.sh ou jsDelivr
import('https://esm.sh/@mlc-ai/web-llm@0.2.79')
```

**Plan C :** Utiliser une API backend
```typescript
// Déporter l'inférence vers un serveur Node.js/Python
fetch('/api/generate', { method: 'POST', body: prompt })
```

**Plan D :** Garder le Mock pour Sprint 3, refaire tentative en Sprint 4 avec plus de RAM

---

### Tests Flaky

**Si les tests React sont instables :**
- Utiliser `waitFor` de Testing Library
- Mocker tous les timers avec `vi.useFakeTimers()`
- Nettoyer après chaque test : `afterEach(() => { cleanup(); })`

---

### RAG Performance

**Si les embeddings sont trop lents :**
- Utiliser un modèle plus léger (DistilBERT au lieu de MiniLM)
- Cache les embeddings déjà calculés
- Limiter à 100 derniers messages

---

## ✅ Checklist Finale

Avant de considérer Sprint 3 terminé :

- [ ] Tous les tests passent (`npm run test`)
- [ ] Type-check OK (`npm run type-check`)
- [ ] Lint OK (`npm run lint`)
- [ ] Build production OK (`npm run build`)
- [ ] Démo fonctionnelle (enregistrer vidéo)
- [ ] Documentation à jour
- [ ] `SPRINT3_COMPLETION.md` rédigé
- [ ] Tag Git `v0.3.0` créé
- [ ] PR mergée dans `main`

---

**Bonne chance ! 🚀**
