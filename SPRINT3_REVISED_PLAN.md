# 🎯 Sprint 3 - Plan Révisé (Pragmatique)

**Date**: 2025-11-21 19:46  
**Statut**: Adaptation stratégique suite aux contraintes mémoire

---

## 🚨 Situation

### Problème Identifié
- **OOM (Out of Memory)** lors des tests React avec Vitest
- Même avec Vitest 3.2.4 + 4GB RAM Node.js
- Bloquer persistant lié à l'environnement de test DOM (happy-dom)

### Décision Stratégique

**Skip temporairement les tests React** et se concentrer sur les **features à haute valeur** :

1. ✅ Real LLM Integration (Priorité #1)
2. ✅ Error Handling UI avec Toasts (Quick Win)
3. ✅ IndexedDB Migration (Scalabilité)
4. ✅ RAG Lite (Feature avancée)
5. ⏸️ Tests React (reporté à Sprint 4 avec Jest ou environnement mieux configuré)

**Pourquoi ?**
- Tests React = "nice to have" pour validation
- Real LLM = **bloquant** pour valeur utilisateur
- On peut valider manuellement l'UI pendant le développement
- Tests unitaires de la logique métier (MessageBus, Store, etc.) existent déjà et passent

---

## 📋 Plan Révisé - Sprint 3 (8 jours)

### Phase 1 : Error Handling UI (Jour 1 - 0.5j)

**Objectif**: Améliorer UX avec toast notifications

#### Tâches
1. ✅ Configurer Sonner (déjà installé)
2. ✅ Créer `useToast` hook
3. ✅ Intégrer dans `useKenshoStore.ts`
4. ✅ Remplacer messages d'erreur textuels par toasts
5. ✅ Tester manuellement dans le navigateur

**Validation**:
- Envoyer un message → erreur réseau simulée → Toast rouge s'affiche
- Worker crash simulé → Toast avec message clair

---

### Phase 2 : Real LLM Integration (Jours 2-4 - 3j)

**Objectif**: Activer WebLLM avec dynamic import pour éviter OOM

#### Approche : Dynamic Import + CDN Fallback

**Stratégie en 3 étapes :**

##### Étape 2.1 : LLM Agent avec Dynamic Import
- Créer `src/agents/llm/dynamic.ts`
- Import dynamique : `await import('@mlc-ai/web-llm')`
- Modèle léger : **Qwen2.5-0.5B** (350MB) pour validation
- Gestion progressive du modèle via `MODEL_PROGRESS` events

##### Étape 2.2 : Configuration Build Optimisée
- Nouveau config Vite : `vite.llm-dynamic.config.ts`
- `external: ['@mlc-ai/web-llm']` (ne pas bundler)
- Build avec esbuild si Vite échoue encore
- Script npm : `build:llm-dynamic`

##### Étape 2.3 : Fallback Gracieux
- Si import échoue → charger depuis CDN jsDelivr
- Si CDN échoue → fallback vers Mock LLM
- Toast informatif pour l'utilisateur : "Mode simulation activé"

**Validation**:
```bash
# 1. Build sans OOM
npm run build:llm-dynamic
# ✅ Génère dist/agents/llm.agent.js

# 2. Test navigateur
npm run dev
# Envoyer message "Bonjour"
# ✅ Streaming avec vrai LLM
# ✅ Pas de crash
```

---

### Phase 3 : IndexedDB Migration (Jour 5 - 1j)

**Objectif**: Stocker 1000+ messages au lieu de 100

#### Tâches
1. ✅ Installer `idb` (wrapper IndexedDB)
2. ✅ Créer `src/core/storage/ConversationStore.ts`
3. ✅ Migrer `useKenshoStore` pour utiliser IndexedDB
4. ✅ Script de migration depuis localStorage
5. ✅ Tester avec 500 messages

**Validation**:
- DevTools > Application > IndexedDB > kensho-db visible
- Envoyer 500 messages → Pas de perte de données

---

### Phase 4 : RAG Lite (Jours 6-7 - 2j)

**Objectif**: Mémoire contextuelle basique

#### Approche : Embeddings avec Transformers.js

##### Étape 4.1 : Embeddings
- Installer `@xenova/transformers`
- Modèle : `Xenova/all-MiniLM-L6-v2` (léger, 80MB)
- Worker séparé pour les embeddings (éviter bloquer UI)

##### Étape 4.2 : Vector Store Simple
- Cosine similarity en pur JS
- Top-3 retrieval
- Stockage dans IndexedDB

##### Étape 4.3 : Intégration
- Enrichir prompts avec contexte pertinent
- UI : Badge "Contexte" quand RAG activé

**Validation**:
```
User: "Je m'appelle Alice"
Kensho: "Enchanté Alice !"
...
(20 messages plus tard)
User: "Comment je m'appelle ?"
Kensho: "Vous vous appelez Alice." ✅
```

---

### Phase 5 : Polish & Documentation (Jour 8 - 1j)

#### Tâches
1. ✅ Refactor code (cleanup console.log)
2. ✅ Mettre à jour `README.md`
3. ✅ Créer `SPRINT3_COMPLETION.md`
4. ✅ Enregistrer démo vidéo
5. ✅ Merge `sprint-3` → `main`
6. ✅ Tag `v0.3.0`

---

## 🚀 Prochaines Actions Immédiates (Maintenant)

### Action 1 : Setup Toast Notifications (15 min)

**Fichiers à créer/modifier :**
1. `src/hooks/useToast.ts`
2. `src/stores/useKenshoStore.ts` (intégrer toasts)
3. `src/pages/Index.tsx` (ajouter `<Toaster />`)

### Action 2 : Test Manuel (5 min)
- Simuler erreur
- Vérifier toast s'affiche

### Action 3 : Commit
```bash
git add .
git commit -m "feat(ui): Add toast notifications for error handling"
```

---

## 📅 Timeline Révisée

| Jour | Phase | Livrable |
|------|-------|----------|
| 1 | Error UI | Toast notifications ✅ |
| 2 | LLM Setup | `llm/dynamic.ts` créé |
| 3 | LLM Build | Build sans OOM |
| 4 | LLM Test | Streaming fonctionne |
| 5 | IndexedDB | Migration complète |
| 6 | RAG | Embeddings + Vector Store |
| 7 | RAG | Intégration complète |
| 8 | Polish | Documentation + Release |

**Total : 8 jours** (au lieu de 10)

---

## ✅ Tests React : Plan Futur (Sprint 4)

**Pourquoi reporter ?**
- Blocker OOM non critique pour MVP
- Alternative : Tests E2E Browser (déjà en place)
- Tests unitaires logique métier (MessageBus, etc.) passent

**Sprint 4 : Approche Tests**
- Option 1 : Migrer vers **Jest** (plus stable sur Windows)
- Option 2 : **Playwright Component Testing** (moderne, robuste)
- Option 3 : Augmenter RAM système (16GB → 32GB)

---

## 🎯 Commençons Phase 1 : Error Handling UI

**Êtes-vous prêt à implémenter les toasts maintenant ?** 🚀

Je vais créer les 3 fichiers nécessaires immédiatement.
