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