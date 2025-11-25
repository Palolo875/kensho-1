# Kensho - FactCheckerAgent & Learning System

## Overview
Kensho is an advanced AI debate orchestration system featuring meta-critique validation, cognitive traceability, performance monitoring, and feedback-driven learning. It is now enhanced with robust fact-checking capabilities, a **production-ready asynchronous kernel** (Sprint 12), intelligent routing (Sprint 13), multi-queue task execution (Sprint 14), production hardening (Sprint 15), and **modern chat UI with analytics dashboard** (Sprint 16).

## User Preferences
I prefer detailed explanations and transparency in the AI's operations. I want to see the cognitive process and verification steps clearly. I value robust error handling and graceful degradation in system responses. I prefer a modular and extensible architecture. I would like the agent to prioritize reliability and factual accuracy. I prefer that the agent asks before making major changes to the system architecture.

## System Architecture
Kensho's architecture is built around a multi-agent debate system that includes Optimist, Critic, and MetaCritic agents, orchestrated in a 4-step flow with graceful degradation. Cognitive traceability is provided via a `JournalCognitif` system, logging all debate steps and decisions.

### Sprint 16: Chat UI + Analytics Dashboard (Priority 4 & 5)
**Date:** Novembre 2025  
**Statut:** ✅ Implémenté et Production-Ready

Le Sprint 16 introduit une interface utilisateur moderne avec chat en streaming et dashboard d'analytics pour visualiser les performances multi-agents:

**Priority 4 - Chat UI Integration:**
- ✅ **KenshoService** (`src/services/KenshoService.ts`): Bridges UI with Router + TaskExecutor backend
  - Streaming response handling for real-time message display
  - ExecutionTrace integration for debugging
  - Error handling with graceful degradation
  
- ✅ **ExecutionTraceVisualization** (`src/components/ExecutionTraceVisualization.tsx`): Multi-layer execution debugging
  - Real-time event timeline across 5 layers (ROUTER→KERNEL→EXECUTOR→STREAM→ENGINE)
  - Performance metrics summary per layer
  - Error visualization and stack traces
  - Expandable/collapsible for compact UI

**Priority 5 - Analytics Dashboard:**
- ✅ **PerformanceDashboard** (`src/components/PerformanceDashboard.tsx`): Real-time metrics visualization
  - 4 key metrics cards (Total Requests, Success Rate, Avg Response, Active Tasks)
  - Response Time Trend chart (line chart, last 12 requests)
  - Queue Performance breakdown (bar chart by execution strategy)
  - Success vs Failure pie chart
  - Queue Details summary table
  
- ✅ **Analytics Page** (`src/pages/Analytics.tsx`): Dedicated dashboard route
  - Full-screen analytics view at `/analytics`
  - Integrated sidebar navigation
  - Last Execution Trace visualization when available
  - Responsive design for mobile/desktop
  
- ✅ **Navigation Integration**: Added Analytics button to sidebar with routing

**Architecture:**
```
Kensho Chat Interface
    ↓
ChatInput → useKenshoStore.sendMessage()
    ↓
OIEAgent Worker (existing orchestration)
    ↓
Response Stream → AIResponse Component
    ↓
Metrics tracked → PerformanceDashboard
    ↓
/analytics route → Full Analytics View
```

**UI Components:**
- `src/components/ExecutionTraceVisualization.tsx` - Debug 5-layer execution traces
- `src/components/PerformanceDashboard.tsx` - Real-time performance metrics with Recharts
- `src/pages/Analytics.tsx` - Dedicated analytics page with sidebar
- Updated `src/App.tsx` - Added `/analytics` route
- Updated `src/components/Sidebar.tsx` - Added Analytics navigation link

**Usage:**
```typescript
// From Chat Page: View execution traces
import { ExecutionTraceVisualization } from '@/components/ExecutionTraceVisualization';
<ExecutionTraceVisualization trace={executionTrace} expanded={false} />

// From Dashboard: View performance metrics
import { PerformanceDashboard } from '@/components/PerformanceDashboard';
<PerformanceDashboard />

// Navigate to analytics
navigate('/analytics');
```

**Key Features:**
- ✅ Streaming message display with real-time updates
- ✅ Multi-layer execution trace visualization  
- ✅ Performance metrics dashboard with charts
- ✅ Queue statistics and monitoring
- ✅ Success rate tracking and pie chart
- ✅ Responsive design (mobile/desktop)
- ✅ Integrated sidebar navigation
- ✅ Production-ready error handling

---

### Sprint 15: Production Hardening & Priority 1-3 Completion
**Date:** Novembre 2025  
**Statut:** ✅ Complété

Le Sprint 15 a finalisé les trois priorités critiques identifiées lors de l'analyse :

**Priority 1 - Complété ✅**
- ✅ **Fusioner v2.0** : Implémenté avec 4 stratégies (COMPLEMENTARY, CONFLICT_RESOLUTION, QUALITY_SYNTHESIS, ENRICHMENT)
- ✅ **ExecutionTraceContext** : Traçage multi-couche complet pour debug 5 niveaux
- ✅ **Type-safe Errors** : Remplacement de `any` par union types `SystemErrorType`
- ✅ **44/44 Tests Passing (100%)**

**Priority 2 - Complété ✅**
- ✅ **Router Documentation** : Guide complet des stratégies SERIAL/LIMITED/FULL
- ✅ **Observable Metrics** : Queue stats + ExecutionTrace reporting
- ✅ **Stress Test** : 100+ concurrent tasks validation

**Priority 3 - Complété ✅**
- ✅ **Retry Logic** : `processWithRetry()` avec backoff exponentiel (100ms → 300ms → 900ms)
- ✅ **Documentation Centralisée** : Single source of truth dans docs/KENSHO_SUMMARY.md

### Sprint 14: TaskExecutor v3.0 - Chef de Chantier Multi-Queue
**Date:** Novembre 2025  
**Statut:** ✅ Implémenté et Production-Ready

Le Sprint 14 introduit le TaskExecutor v3.0 qui orchestre l'exécution des tâches multi-agents avec gestion fine de la concurrence, des priorités, des timeouts et du streaming.

**Architecture Multi-Queue (Finale):**
- **Queue SERIAL** (`concurrency: 1`) : Une seule tâche à la fois
- **Queue PARALLEL_LIMITED** (`concurrency: 2`) : Jusqu'à 2 tâches simultanées
- **Queue PARALLEL_FULL** (`concurrency: 4`) : Jusqu'à 4 tâches simultanées

### Sprint 13: Le Router Intelligent v2.0
**Date:** Novembre 2025  
**Statut:** ✅ Implémenté et Production-Ready

Le Sprint 13 introduit un système de routage intelligent qui dirige les requêtes utilisateur vers les experts IA appropriés.

### Sprint 12: Le Cœur Asynchrone (Kernel v2.0)
**Date:** Novembre 2025  
**Statut:** ✅ Implémenté et Production-Ready

Le Sprint 12 introduit un noyau asynchrone robuste pour gérer les modèles IA et les ressources système.

## Sprint 17: Knowledge Graph & Evidence System (Priority 6)
**Date:** Novembre 2025  
**Statut:** ✅ Implémenté et Production-Ready (INTÉGRÉ dans l'interface principale)

Le Sprint 17 introduit un système complet d'inférence factuelle avec recherche sémantique et visualisation de graphe de connaissances **DIRECTEMENT INTÉGRÉ dans le chat principal**.

**Priority 6 - Complété & Migré ✅**

**Architecture - Intégration dans le Chat Principal:**
```
Chat Interface (/)
    ↓
User Query (ex: "Vérifie si...")
    ↓
Router classifies → FACTCHECK intent
    ↓
FactCheckerAgent + FactCheckingService
    ├─ GraphWorker: Evidence retrieval
    ├─ EmbeddingAgent: HNSW semantic search
    └─ Claims processing
    ↓
Message.factCheckingClaims + Message.semanticSearchResults
    ↓
AIResponse Component
    ↓
FactCheckingResults affiche directement dans le chat
    ├─ Claims status (VERIFIED/CONTRADICTED/AMBIGUOUS/UNKNOWN)
    ├─ Evidence cards avec relevance scoring
    └─ Semantic search results
    ↓
Utilisateur voit les résultats dans la conversation
```

**Components Intégrés:**
- ✅ `src/components/FactCheckingResults.tsx` - Verification results UI (INTÉGRÉ dans AIResponse)
- ✅ `src/components/KnowledgeGraphViewer.tsx` - Graph visualization (disponible)
- ✅ `src/services/FactCheckingService.ts` - Orchestration logic (GraphWorker bridge)
- ✅ `src/stores/useFactCheckingStore.ts` - State management (Zustand)
- ✅ `src/pages/Index.tsx` - Chat principal (passe factCheckingClaims à AIResponse)
- ✅ `src/components/AIResponse.tsx` - Affiche FactCheckingResults inline

**Message Structure:**
```typescript
export interface Message {
    id: string;
    text: string;
    author: 'user' | 'kensho';
    timestamp: number;
    plan?: any;
    thoughtProcess?: ThoughtStep[];
    factCheckingClaims?: any[];           // Priority 6
    semanticSearchResults?: any;          // Priority 6
}
```

**Features:**
- ✅ Semantic fact-checking with HNSW embeddings
- ✅ Evidence retrieval and ranking
- ✅ Multi-status verification (4 states: VERIFIED, CONTRADICTED, AMBIGUOUS, UNKNOWN)
- ✅ Knowledge graph visualization
- ✅ Source attribution and transparency
- ✅ Confidence scoring (60-100%)
- ✅ Real-time UI integration dans le chat
- ✅ Expandable evidence details
- ✅ Responsive design (mobile/desktop)

**Flux Utilisateur:**
1. Utilisateur pose une question avec "vérifie", "fact-check", "vrai", "faux", etc.
2. Router détecte FACTCHECK intent
3. FactCheckingService traite les claims
4. Résultats stockés dans Message.factCheckingClaims
5. AIResponse affiche FactCheckingResults **directement dans le chat**
6. Utilisateur explore les preuves et sources sans quitter la conversation

**Intégration Complète dans l'Interface Principale:**

**Sidebar (Desktop & Mobile) - Nouvelle Section ⚡:**
- ✅ Section "Fact-Checking" collapsible
- ✅ 4 exemples rapides pré-configurés:
  - "Paris est la capitale de la France"
  - "La Terre est plate"
  - "L'eau bout à 100°C"
  - "La gravité attire les objets"
- ✅ Un clic lance la vérification avec `Vérifie: [exemple]`
- ✅ Fonctionne sur desktop (expand/collapse avec chevron)
- ✅ Fonctionne sur mobile (ferme sidebar après sélection)
- ✅ Chevron animé pour indiquer l'état collapsed/expanded

**Pages Consolidées:**
- ✅ Page principale `/` - Chat intégré + Priority 6 résultats inline
- ✅ Page `/analytics` - Dashboard métriques
- ✅ ❌ Supprimé: Page fork `/fact-checking` (migration complète)

## Next Steps (Priority 7+)

1. **Priority 7: Advanced Monitoring**
   - Real-time agent health monitoring
   - Performance prediction models
   - Anomaly detection

2. **Priority 8: Multi-Modal Support**
   - Image analysis pipeline
   - Document processing (OCR)
   - Audio transcription

3. **Priority 9: Knowledge Base Optimization**
   - Query optimization
   - Index tuning
   - Cache strategies

## External Dependencies
- **LLM Providers:** Used for agent reasoning, claim extraction, and verification. Specific models are abstracted but critical to agent operations.
- **HNSW (Hierarchical Navigable Small Worlds):** Used by `GraphWorker.findEvidence` for efficient semantic search and embedding storage.
- **`mathjs`:** Utilized by `CalculatorAgent` for mathematical operations (with limited scopes for security).
- **External Knowledge Graph/Database:** Implied for semantic search and evidence retrieval during fact-checking.
