# Kensho - Distributed Multi-Agent System

## Overview

Kensho is a sophisticated distributed multi-agent communication system that runs entirely in the browser. It implements a microservices-like architecture using Web Workers as autonomous agents, featuring advanced distributed systems patterns including leader election, failure detection, message persistence, and multi-transport communication. The system enables agents to communicate via RPC, streaming, and pub/sub patterns across both local (same-origin) and remote (cross-device) contexts. It includes comprehensive resilience mechanisms, monitoring, and data persistence using IndexedDB. Kensho also supports lazy loading of its large language model (LLM) and can operate in a "Lite Mode" without AI for faster development and testing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Agent System
- **AgentRuntime**: Execution environment for autonomous agents with lifecycle management, message handling, and state persistence.
- **Worker-based isolation**: Each agent runs in its own Web Worker for true parallelism.

### Communication Layer (MessageBus)
- **Multi-Transport Support**:
    - **BroadcastTransport**: Ultra-fast local communication via BroadcastChannel API.
    - **WebSocketTransport**: Network communication via relay server with resilience features (exponential backoff, circuit breaker, heartbeat).
    - **HybridTransport**: Combines both transports with automatic deduplication.
- **Messaging Patterns**: Supports RPC (RequestManager), streaming (StreamManager), and pub/sub.
- **Resilience**: DuplicateDetector for exactly-once semantics, OfflineQueue with IndexedDB persistence for offline agents.

### Guardian System (Orion)
- **Distributed Coordination**:
    - **WorkerRegistry**: Automatic service discovery and garbage collection.
    - **LeaderElection**: Lazy Bully algorithm for single-leader consensus.
    - **FailureDetection**: Heartbeat-based monitoring with automatic re-election.

### Data Persistence
- **IndexedDBAdapter**: Storage abstraction for agent state, offline queue messages, worker registry, and telemetry.
- **State Management**: Agent-scoped state persistence.

### Monitoring & Observability
- **MetricsCollector**: Comprehensive metrics system (counters, timings, gauges) with windowed statistics and tag-based organization.
- **PerformanceMonitor**: Utilities for performance tracking with decorator support.
- **MetricsDashboard**: React component for real-time metrics visualization.
- **Telemetry Agent**: Centralized log collection with batching.
- **Observatory UI**: Real-time visualization of agent constellation, leader status, and log streaming.

### AI Agent Orchestration
- **LLMPlanner Infrastructure**:
    - **JSONExtractor**: Robust JSON extraction from noisy LLM output.
    - **Prompts system**: Optimized Chain-of-Thought prompts for LLMPlanner.
    - **LLMPlanner**: Generates execution plans via LLM, with robust JSON validation and graceful fallback.
    - **TaskExecutor**: Executes plans sequentially with result interpolation and progressive streaming.
- **OIEAgent (Orchestration Intelligence Engine)**: Central orchestrator for multi-agent AI with integrated memory and intent classification.
    - **Intent Classification**: Détecte automatiquement MEMORIZE, FORGET, et CHAT via IntentClassifierAgent.
    - **Memory Integration**: Récupère les souvenirs pertinents avant la planification via MemoryRetriever.
    - **Direct Memory Operations**: Gère MEMORIZE et FORGET directement sans passer par le planificateur.
    - **Context Enrichment**: Enrichit le contexte de conversation avec les souvenirs pour des réponses plus pertinentes.
- **TaskPlanner**: Intelligent keyword-based routing system with confidence scoring and prioritization for agents.
- **MainLLMAgent**: WebGPU-accelerated LLM inference (TinyLlama-1.1B-Chat) with streaming response generation and configurable parameters.
- **ModelLoader**: Robust model loading with WebGPU availability checks, retry logic, and persistent storage requests for caching.
- **CalculatorAgent**: Specialized agent for precise mathematical calculations using mathjs, with security features and standardized error handling.
- **UniversalReaderAgent**: Intelligent document reader with multi-format support (PDF, images) and automatic OCR fallback.
    - **TesseractService**: OCR service using Tesseract.js with lazy initialization and support for French and English.
    - **ChunkProcessor**: Map-Reduce text processing for long documents, automatic chunking and summarization using LLM.
    - **Intelligent Routing**: Attempts native PDF text extraction first, falls back to OCR for scanned documents.
    - **Progress Tracking**: Real-time progress updates during OCR operations.

### Knowledge Graph System (Sprint 5)
- **GraphWorker**: Orchestrateur principal du système de mémoire sémantique distribuée.
    - **Atomic Transactions**: Garantit la cohérence entre SQLite et HNSW via un journal de transactions avec rollback automatique.
    - **Cross-System Validation**: Validation croisée entre la base de données et l'index vectoriel pour éviter les incohérences.
    - **Crash Resilience**: Conçu pour survivre aux rechargements brutaux (F5) sans corruption de données.
- **SQLiteManager**: Gestion de la base de données SQLite avec persistance sur IndexedDB.
    - **Schema Versionné**: Utilise PRAGMA user_version pour la gestion des migrations.
    - **Automatic Checkpointing**: Sauvegarde automatique toutes les 30 secondes avec optimisation dirty flag.
    - **Transaction Journal**: Table de transactions pour la traçabilité et le diagnostic des échecs.
    - **Foreign Keys**: Contraintes d'intégrité référentielle pour garantir la cohérence des données.
- **HNSWManager**: Index de recherche vectorielle avec Lazy Loading pour démarrage rapide.
    - **Lazy Initialization**: Ne bloque pas le démarrage de l'application, reconstruction en arrière-plan.
    - **Linear Search Fallback**: Utilise une recherche linéaire pour les petites bases (<300 nœuds) avant que l'index soit prêt.
    - **WASM-based**: Utilise hnswlib-wasm pour une recherche vectorielle haute performance dans le navigateur.
    - **Dynamic Label Mapping**: Gestion bidirectionnelle entre IDs de nœuds et labels numériques HNSW.
- **EmbeddingAgent**: Agent spécialisé pour la génération d'embeddings vectoriels.
    - **Model**: Utilise Xenova/all-MiniLM-L6-v2 (384 dimensions) via @xenova/transformers.
    - **Batching**: Traitement par batch toutes les 500ms pour optimiser les performances.
    - **Rate Limiting**: File d'attente pour éviter la surcharge et garantir un traitement efficace.
    - **Lazy Loading**: Le modèle est chargé uniquement à la première utilisation.
- **IntentClassifierAgent**: Agent de classification d'intention pour comprendre les commandes utilisateur.
    - **Hot Path**: Patterns regex ultra-rapides pour détecter MEMORIZE, FORGET, et CHAT.
    - **High Confidence**: Confiance de 0.90-0.99 pour les patterns reconnus, 0.5 pour CHAT par défaut.
    - **Multilingual**: Supporte les commandes en français ("retiens que", "oublie", etc.).
    - **Lightweight**: Aucune dépendance LLM, classification instantanée.
- **MemoryRetriever**: Système de récupération intelligente de souvenirs.
    - **Wide Recall**: Récupère top-20 candidats via recherche vectorielle HNSW.
    - **Re-ranking**: Score composite basé sur similarité (60%), récence (20%), et importance (20%).
    - **Recency Decay**: Décroissance exponentielle avec demi-vie de 30 jours.
    - **Final Selection**: Retourne les 3 meilleurs souvenirs après re-ranking.
- **Data Model**:
    - **IMemoryNode**: Nœud de mémoire avec contenu, embedding (384D), type, provenance, et métadonnées de versionnement.
    - **IMemoryEdge**: Relation étiquetée avec poids entre deux nœuds.
    - **IProvenance**: Traçabilité complète de l'origine des souvenirs (chat, document, inférence, auto-correction).
    - **IMemoryTransaction**: Journal atomique des opérations ADD/DELETE/UPDATE avec statuts PENDING/COMMITTED/FAILED.
    - **Intent**: Type d'intention détectée (MEMORIZE, FORGET, CHAT) avec contenu et confiance.

### User Interface
- **Chat Interface**: Built with React and Zustand for state management.
    - **Zustand Store (useKenshoStore)**: LocalStorage persistence for conversation history, worker error tracking, and auto-save.
    - **ChatInput Component**: User input with validation, character limits, and dynamic placeholders.
    - **ChatView**: Message display with auto-scroll and responsive layout.
    - **ModelLoadingView Component**: Enhanced loading UX with phase-specific icons, progress bar, and contextual hints.

## External Dependencies

### Runtime Dependencies
- **React 18**: UI framework.
- **Radix UI**: Component primitives.
- **shadcn/ui**: Design system based on Radix and Tailwind CSS.
- **Lucide Icons**: Icon library.
- **React Router**: Client-side routing.
- **Vite**: Build tool and dev server.
- **TypeScript**: Type safety.

### WebSocket Infrastructure
- **ws** (Node.js package): WebSocket server for the relay service.
- **Relay Server**: Message broadcasting hub.

### Storage
- **IndexedDB**: Browser-native persistent storage for `AGENT_STATE`, `OFFLINE_QUEUE`, `WORKER_REGISTRY`, `TELEMETRY`, `KenshoDB` (Knowledge Graph).
- **sql.js**: SQLite compiled to WebAssembly for in-browser relational database.
- **hnswlib-wasm**: HNSW approximate nearest-neighbor search compiled to WebAssembly for fast vector similarity search.

### AI/ML
- **@mlc-ai/web-llm**: WebGPU-based LLM inference library.
- **@xenova/transformers**: Browser-based transformer models for embeddings and NLP tasks.
- **mathjs**: Used by CalculatorAgent for secure expression evaluation.
- **pdfjs-dist**: PDF parsing and rendering library for document reading.
- **tesseract.js**: OCR library for text extraction from images and scanned documents.

### Build & Development
- **ESLint**: Code linting.
- **PostCSS**: CSS processing.
- **Tailwind CSS**: Utility-first styling.