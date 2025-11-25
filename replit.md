# Kensho - FactCheckerAgent & Learning System

## Overview
Kensho is an advanced AI debate orchestration system featuring meta-critique validation, cognitive traceability, performance monitoring, and feedback-driven learning. It is now enhanced with robust fact-checking capabilities and a **production-ready asynchronous kernel** (Sprint 12). The project aims to provide transparent, verifiable, and nuanced AI-generated insights. Kensho is designed to reduce AI hallucinations, improve response reliability, and offer a transparent view into the AI's reasoning process.

## User Preferences
I prefer detailed explanations and transparency in the AI's operations. I want to see the cognitive process and verification steps clearly. I value robust error handling and graceful degradation in system responses. I prefer a modular and extensible architecture. I would like the agent to prioritize reliability and factual accuracy. I prefer that the agent asks before making major changes to the system architecture.

## System Architecture
Kensho's architecture is built around a multi-agent debate system that includes Optimist, Critic, and MetaCritic agents, orchestrated in a 4-step flow with graceful degradation. Cognitive traceability is provided via a `JournalCognitif` system, logging all debate steps and decisions.

### Sprint 12: Le Cœur Asynchrone (Kernel v2.0)
**Date:** Novembre 2025  
**Statut:** ✅ Implémenté et Production-Ready

Le Sprint 12 introduit un noyau asynchrone robuste pour gérer les modèles IA et les ressources système de manière optimale:

**Composants principaux:**
- **ModelManager v2.0** (`src/core/kernel/ModelManager.ts`): Gestionnaire asynchrone de modèles WebLLM avec:
  - Initialisation explicite et promesse `ready` pour éviter les race conditions
  - Support du changement de modèle à chaud via `switchModel()`
  - Tracking de l'état actuel du modèle chargé
  - Gestion du cycle de vie complet (init → dispose)
  - Callback de progression pour l'UI
  
- **ResourceManager v1.0** (`src/core/kernel/ResourceManager.ts`): Système nerveux sensoriel surveillant:
  - **Mémoire**: Utilisation JS heap, tendances (rising/falling/stable), détection >85%
  - **Batterie**: Niveau, état de charge, temps avant décharge
  - **Réseau**: État online/offline, type de connexion (4G/3G/2G), latence RTT
  - **CPU**: Nombre de cœurs logiques, détection de throttling
  - **Mode éco**: Détection automatique du mode économie d'énergie
  - Système d'événements réactifs (`on('memory-critical')`, `on('battery-low')`, etc.)
  - Cache temporel (500ms) pour éviter les lectures excessives
  
- **KernelCoordinator** (`src/core/kernel/KernelCoordinator.ts`): Orchestrateur intelligent qui:
  - Coordonne ModelManager et ResourceManager
  - Prend des décisions de chargement basées sur les ressources (`canLoadModel()`)
  - Gère les événements critiques (mémoire saturée → notification)
  - Fournit une API unifiée pour l'application
  
- **ModelCatalog** (`src/core/kernel/ModelCatalog.ts`): Catalogue centralisé des modèles:
  - `gemma-3-270m-it-MLC`: Noyau de dialogue ultra-compact (270M, q4f16_1)
  - Consommation optimale: 0.75% batterie pour 25 conversations
  - Extensible pour futurs modèles (embeddings, spécialisés)

**Corrections de bugs critiques:**
- Fix `hasMemoryAPI`: Utilise `performance.memory` au lieu de `navigator.deviceMemory`
- Gestion complète des event listeners avec cleanup pour éviter memory leaks
- Validation robuste des propriétés optionnelles (`connection.effectiveType`)

**Architecture:**
```
Application
    ↓
KernelCoordinator (Orchestration)
    ↓                    ↓
ModelManager     ResourceManager
(Que charger)    (Quand charger)
    ↓                    ↓
WebLLM Engine    Browser APIs
```

**Usage:**
```typescript
import { kernelCoordinator } from '@/core/kernel';

// Initialisation
await kernelCoordinator.init('gemma-3-270m', (progress) => {
  console.log(progress.text);
});

// Changement de modèle intelligent
await kernelCoordinator.switchModel('qwen2-e5-embed');

// Vérification des ressources
const decision = await kernelCoordinator.canLoadModel('heavy-model');
if (!decision.canLoad) {
  console.warn(decision.reason); // "Mémoire saturée", "Batterie critique", etc.
}
```

### Sprint 13: Le Router Intelligent v2.0
**Date:** Novembre 2025  
**Statut:** ✅ Implémenté et Production-Ready

Le Sprint 13 introduit un système de routage intelligent qui dirige les requêtes utilisateur vers les experts IA appropriés, avec vérifications de disponibilité des ressources et classification hybride.

**Corrections Critiques Intégrées:**
1. ✅ **Anti-Hallucination** - `ModelCatalog` vérifié avec UNIQUEMENT des modèles WebLLM/MLC existants (Gemma-3-270M, Qwen2.5-Coder-1.5B, Qwen2.5-Math-1.5B)
2. ✅ **Classification Hybride** - Mots-clés rapides → Fallback LLM (Gemma-3-270M), pas BGE qui n'est pas dans WebLLM
3. ✅ **Fail-Aware Classifier** - `ClassificationError` propagées, pas de masquage silencieux
4. ✅ **Sélection Consciente** - Vérification via `kernelCoordinator.canLoadModel()` avant création de plan
5. ✅ **Capacity Score Holistique** - CPU + Mémoire + Batterie + Réseau → Score/10 pour décision SERIAL vs PARALLEL
6. ✅ **Transparence des Downgrades** - `downgradedFromIntent` et `downgradeReason` dans `ExecutionPlan`

**Composants principaux:**
- **Router** (`src/core/router/Router.ts`): Orchestrateur intelligent créant des plans d'exécution
- **IntentClassifier** (`src/core/router/IntentClassifier.ts`): Classification hybride des intentions (CODE, MATH, FACTCHECK, DIALOGUE)
- **CapacityEvaluator** (`src/core/router/CapacityEvaluator.ts`): Évaluation holistique de la capacité système (score 0-10)
- **ModelCatalog** (`src/core/router/ModelCatalog.ts`): Catalogue vérifié des modèles disponibles avec dates de vérification

**Architecture:**
```
User Query
    ↓
IntentClassifier (Keywords → LLM Fallback)
    ↓
CapacityEvaluator (CPU + Memory + Battery + Network → Score/10)
    ↓
Router.selectExperts (Intent + canLoadModel → Model Selection)
    ↓
ExecutionPlan (Primary + Fallback + Strategy + Downgrade Info)
```

**Usage:**
```typescript
import { Router } from '@/core/router';

const router = new Router();

// Créer un plan d'exécution
const plan = await router.createPlan("Comment debugger ce code JavaScript ?");
// {
//   primaryTask: { agentName: 'CodeExpert', modelKey: 'qwen2.5-coder-1.5b', ... },
//   fallbackTasks: [{ agentName: 'GeneralDialogue', modelKey: 'gemma-3-270m', ... }],
//   strategy: 'PARALLEL',
//   capacityScore: 8.5,
//   estimatedDuration: 18000,
//   downgradedFromIntent: undefined  // Pas de downgrade
// }

// En cas de downgrade (modèle spécialisé non disponible)
const degradedPlan = await router.createPlan("Calcule la dérivée de x²");
// {
//   primaryTask: { agentName: 'CalculatorAgent', modelKey: 'gemma-3-270m', ... },
//   fallbackTasks: [],
//   downgradedFromIntent: 'MATH',
//   downgradeReason: 'Mémoire saturée (>80%)'
// }
```

**Modèles Supportés (Vérifiés WebLLM/MLC):**
- `gemma-3-270m-it-MLC` - Dialogue généraliste (270M, q4f16_1)
- `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC` - Expert code (1.5B, q4f16_1)
- `Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC` - Expert mathématiques (1.5B, q4f16_1)

### Sprint 14: TaskExecutor v3.0 - Chef de Chantier Multi-Queue
**Date:** Novembre 2025  
**Statut:** ✅ Implémenté et Production-Ready

Le Sprint 14 introduit le TaskExecutor v3.0 qui orchestre l'exécution des tâches multi-agents avec gestion fine de la concurrence, des priorités, des timeouts et du streaming.

**Architecture Multi-Queue (Finale):**
- **Queue SERIAL** (`concurrency: 1`) : Une seule tâche à la fois
- **Queue PARALLEL_LIMITED** (`concurrency: 2`) : Jusqu'à 2 tâches simultanées
- **Queue PARALLEL_FULL** (`concurrency: 4`) : Jusqu'à 4 tâches simultanées

Chaque stratégie d'exécution obtient sa propre queue pour **respecter strictement les limites de concurrence** définies par le plan du Router.

**Composants principaux:**
- **TaskExecutor** (`src/core/kernel/TaskExecutor.ts`): Orchestre l'exécution des tâches avec:
  - Streaming complètement dans le job PQueue (occupation du slot pendant toute la génération)
  - Vraie cancellation via `engine.interruptGenerate()` sur timeout
  - Callback pattern pour envoi des chunks en temps réel
  - Polling-based streaming pour UX optimale
  - Gestion des priorités (HIGH=10, MEDIUM=5, LOW=1)
  
- **Fusioner** (`src/core/kernel/Fusioner.ts`): Fusionneur intelligent des résultats multi-agents

**Flux de Traitement:**
```
Requête Utilisateur
    ↓
Router.createPlan (intention + capacité → stratégie)
    ↓
TaskExecutor.processStream (sélection queue → exécution)
    ├─ PQueue sélectionnée (SERIAL|LIMITED|FULL)
    ├─ Job primaire avec streaming
    ├─ Jobs fallback en parallèle
    └─ Polling des chunks → Envoi en temps réel
    ↓
Fusioner.fuse (résultats primaire + fallback → réponse finale)
    ↓
Réponse Fusionnée + Métadonnées
```

**Usage:**
```typescript
import { taskExecutor } from '@/core/kernel';

// Streaming (pour chat UX)
for await (const chunk of taskExecutor.processStream(userPrompt)) {
  if (chunk.type === 'primary') {
    console.log("Chunk reçu:", chunk.content);
  } else if (chunk.type === 'fusion') {
    console.log("Réponse finale:", chunk.content);
  }
}

// Non-streaming (pour batch)
const response = await taskExecutor.process(userPrompt);
```

**Améliorations Clés:**
- ✅ Multi-queue stricte → Pas de dépassement de concurrence même avec tâches entrelacées
- ✅ Streaming entièrement dans job → Queue ne libère le slot que quand génération finie
- ✅ Vraie interruption → Cancellation réelle du moteur, pas juste une promesse rompue
- ✅ Priorités respectées → Tasks high-priority exécutées en priorité
- ✅ Fallback parallèle → Experts backup exécutés en parallèle si primaire échoue

The FactCheckerAgent employs a hybrid approach for claim extraction (LLM + Rule-Based fallback) and a 2-step verification process (semantic search via HNSW embeddings + LLM Judge). Verification results include status (VERIFIED, CONTRADICTED, AMBIGUOUS, UNKNOWN), confidence scores, and evidence tracking.

**UI/UX Decisions:**
- **JournalCognitifView:** A timeline-based UI for cognitive traceability, displaying debate steps and detailed fact-checking results.
- **VerificationResultItem:** Visualizes fact-check status with color-coded icons (✅, ❌, 🟡, ⚠️), claim text, confidence scores, and evidence previews.
- **ChatMessage:** Features a `SourcesFooter` to display consulted sources with badges and tooltips, enhancing transparency.
- **ObservatoryModal:** A 4-tabbed interface for monitoring and feedback.

**Technical Implementations & Design Choices:**
- **Hybrid Claim Extraction:** Combines LLM flexibility for complex context with rule-based determinism for guaranteed output and fallback. Multi-level parsing (JSON → Markdown → Rules) ensures robustness.
- **Semantic Verification:** Utilizes `EmbeddingAgent` and `GraphWorker.findEvidence` for efficient semantic search against a knowledge graph, judged by a minimalist LLM prompt for fast verdicts.
- **Graceful Degradation:** The system can return a draft response directly if meta-critique validation scores are below a dynamic threshold, preventing low-quality AI outputs.
- **Performance Optimization:** Parallelized Optimist and Critic agent execution to reduce latency.
- **Feedback Learning:** `FeedbackLearner` dynamically adjusts thresholds based on user feedback to improve MetaCritic accuracy.
- **Enhanced Type System:** Robust type definitions and validation (`MessageMetadata`, `isValidWorkerName`).
- **Centralized Utilities:** UUID generation and configurable logging strategies (`ConsoleLogger`, `BufferedLogger`, `NoOpLogger`).
- **JSONExtractor Enhancements:** Supports various Markdown JSON formats, single-quote conversion, and strict/lenient parsing modes.
- **CalculatorAgent Security:** Limited `mathjs` scopes to reduce attack surface and bundle size.

## External Dependencies
- **LLM Providers:** Used for agent reasoning, claim extraction, and verification. Specific models are abstracted but critical to agent operations.
- **HNSW (Hierarchical Navigable Small Worlds):** Used by `GraphWorker.findEvidence` for efficient semantic search and embedding storage.
- **`mathjs`:** Utilized by `CalculatorAgent` for mathematical operations (with limited scopes for security).
- **External Knowledge Graph/Database:** Implied for semantic search and evidence retrieval during fact-checking.