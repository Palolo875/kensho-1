# Kensho - Distributed Multi-Agent System

## Overview

Kensho is a distributed multi-agent communication system running in the browser. It employs a microservices-like architecture using Web Workers for autonomous agents, incorporating distributed systems patterns such as leader election, failure detection, message persistence, and multi-transport communication. Agents communicate via RPC, streaming, and pub/sub across local and remote contexts. The system includes resilience mechanisms, monitoring, data persistence using IndexedDB, and supports lazy loading of its large language model (LLM).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Agent System
- **AgentRuntime**: Manages agent lifecycle, messaging, and state.
- **Worker-based isolation**: Each agent runs in its own Web Worker for parallel execution.

### Communication Layer (MessageBus)
- **Multi-Transport Support**:
    - **BroadcastTransport**: Local communication via BroadcastChannel.
    - **WebSocketTransport**: Network communication via a relay server with resilience features.
    - **HybridTransport**: Combines transports with deduplication.
- **Messaging Patterns**: Supports RPC, streaming, and pub/sub.
- **Resilience**: Duplicate detection and an offline queue with IndexedDB persistence.

### Guardian System (Orion)
- **Distributed Coordination**:
    - **WorkerRegistry**: Service discovery and garbage collection.
    - **LeaderElection**: Lazy Bully algorithm for consensus.
    - **FailureDetection**: Heartbeat-based monitoring with automatic re-election.

### Data Persistence
- **IndexedDBAdapter**: Storage for agent state, offline queue, worker registry, telemetry, and the Knowledge Graph.

### Monitoring & Observability
- **MetricsCollector**: Comprehensive metrics system.
- **MetricsDashboard**: React component for real-time metrics visualization.
- **Telemetry Agent**: Centralized log collection.
- **Observatory UI**: Real-time visualization of agents, leader status, and logs.

### AI Agent Orchestration
- **LLMPlanner Infrastructure**: Generates execution plans via LLM, with robust JSON validation and graceful fallback.
- **OIEAgent (Orchestration Intelligence Engine)**: Central orchestrator for multi-agent AI with integrated memory and intent classification. Handles MEMORIZE, FORGET, and CHAT intents.
- **TaskPlanner**: Intelligent keyword-based routing for agents.
- **MainLLMAgent**: WebGPU-accelerated LLM inference (TinyLlama-1.1B-Chat).
- **ModelLoader**: Handles robust model loading and caching.
- **CalculatorAgent**: Specialized agent for mathematical calculations.
- **UniversalReaderAgent**: Document reader with multi-format support (PDF, images) and OCR fallback (Tesseract.js).

### Knowledge Graph System
- **GraphWorker**: Orchestrates the distributed semantic memory system with atomic transactions and crash resilience.
- **SQLiteManager**: Manages SQLite database with IndexedDB persistence, schema versioning, and automatic checkpointing.
- **HNSWManager**: Vector search index using `hnswlib-wasm` with lazy loading and linear search fallback.
- **EmbeddingAgent**: Generates vector embeddings using `Xenova/all-MiniLM-L6-v2` with batching and lazy model loading.
- **IntentClassifierAgent**: Classifies user intentions (MEMORIZE, FORGET, CHAT) using ultra-fast regex patterns, supporting multiple languages.
- **MemoryRetriever**: Intelligent memory retrieval system using vector search, re-ranking based on similarity, recency, and importance.
- **Data Model**: Defines `IMemoryNode`, `IMemoryEdge`, `IProvenance`, `IMemoryTransaction`, and `Intent` for structured memory management.

### User Interface
- **Chat Interface**: Built with React and Zustand for state management and conversation history persistence.
- **ModelLoadingView Component**: Provides enhanced loading UX for models, allowing user control over downloads (start, pause, resume).

## External Dependencies

### Runtime Dependencies
- **React 18**: UI framework.
- **Radix UI**: Component primitives.
- **shadcn/ui**: Design system.
- **Lucide Icons**: Icon library.
- **React Router**: Client-side routing.
- **Vite**: Build tool.
- **TypeScript**: Type safety.

### WebSocket Infrastructure
- **ws**: WebSocket server for the relay service.

### Storage
- **IndexedDB**: Browser-native persistent storage.
- **sql.js**: SQLite compiled to WebAssembly.
- **hnswlib-wasm**: HNSW approximate nearest-neighbor search.

### AI/ML
- **@mlc-ai/web-llm**: WebGPU-based LLM inference.
- **@xenova/transformers**: Browser-based transformer models.
- **mathjs**: Used by CalculatorAgent.
- **pdfjs-dist**: PDF parsing.
- **tesseract.js**: OCR library.
## Sprint 6: Internal Debate System (November 23, 2025)

### Overview
Complex user questions now trigger an **internal debate** between two AI personas (Optimist "Léo" and Critic "Athéna") before synthesizing a final response. Results show significantly improved response quality and nuance.

### Architecture Components

#### 1. **QueryClassifier** (`src/core/oie/QueryClassifier.ts`)
- Classifies questions as `simple` or `complex`
- Keyword-based scoring with configurable weights
- **Unicode Normalization**: Handles case/accents via NFD + regex
- Heuristic: Questions > 20 words = complex

#### 2. **OptimistAgent** (`src/agents/persona/optimist/index.ts`)
- **Persona**: Léo - constructive optimist
- Generates initial response with positive bias
- Uses MainLLMAgent for inference
- Output: Plain text (not JSON)

#### 3. **CriticAgent** (`src/agents/persona/critic/index.ts`)
- **Persona**: Athéna - structured critic
- Identifies flaws, risks, weaknesses
- Output: JSON with `{major_flaw, evidence, suggested_fix}`
- Robust JSON validation via JSONExtractor

#### 4. **LLMPlanner Enhancement** (`src/agents/oie/planner.ts`)
- Checks: `classification === 'complex' && debateModeEnabled`
- Generates `DebatePlan` (fixed 3-step structure)
- Passes `debateModeEnabled` context

#### 5. **TaskExecutor Improvements** (`src/agents/oie/executor.ts`)
- **Recursive Interpolation**: Handles nested objects/arrays
- Detects `"{{key}}"` (quoted) vs `{{key}}` (unquoted)
- Preserves types correctly
- Sends real-time step updates: `thought_process_start`, `thought_step_update`

#### 6. **MainLLMAgent.synthesizeDebate()** (`src/agents/llm/index.ts`)
- Synthesizes Léo + Athéna perspectives
- Output: Balanced response integrating both views
- Structure: Benefits + Risks + Recommendation

### UI & Real-Time Streaming

#### Store Extensions (`src/stores/useKenshoStore.ts`)
- **State**: `isDebateModeEnabled: boolean` (default: true)
- **State**: `currentThoughtProcess: ThoughtStep[] | null`
- **Method**: `setDebateModeEnabled(enabled: boolean)`
- Passes `debateModeEnabled` in OIE payload

#### SettingsModal Toggle
- Label: "Activer le mode Débat"
- Description: "Débat interne entre Léo et Athéna (plus lent, meilleure qualité)"
- Controlled by store, persists across sessions

#### ThoughtStream Component (`src/components/chat/ThoughtStream.tsx`)
- Displays debate steps in real-time
- Title: "Journal Cognitif" (Cognitive Journal)
- Icons with status colors (pending/running/completed/failed)
- Smooth Tailwind animations (bounce, transition)

### Debate Flow

```
User Question
    ↓
QueryClassifier → "simple" | "complex"
    ↓
IF complex && isDebateModeEnabled:
    Step 1: OptimistAgent → draft response
    Step 2: CriticAgent → critique JSON
    Step 3: synthesizeDebate → final response
    Stream chunks: thought_process_start, thought_step_update
ELSE: Standard plan
```

### Demo Scenarios (Day 10)

**Scenario 1: Debate OFF**
- Toggle disabled
- Question: "Est-ce une bonne idée d'apprendre Rust en 2025?"
- Result: Standard response, no debate visible

**Scenario 2: Debate ON**
- Toggle enabled
- Same question
- UI shows:
  ```
  [⚙️] Réflexion initiale (Léo)
  [✓] Réflexion initiale (Léo)
  [⚙️] Examen critique (Athéna)
  [✓] Examen critique (Athéna)
  [⚙️] Synthèse finale
  [✓] Synthèse finale
  ```
- Result: Nuanced response integrating both perspectives

**Scenario 3: Transparency**
- Click "Voir la réflexion"
- Shows Léo's response, Athéna's critique (JSON), synthesis

### Key Improvements
- ✅ QueryClassifier handles case/accents correctly
- ✅ Recursive interpolation for nested argument substitution
- ✅ Real-time streaming of debate steps to UI
- ✅ Smooth animations (non-intrusive)
- ✅ Toggle control via settings
- ✅ Maintains response quality for simple questions
- ✅ Significantly improves quality for complex questions

## Centralized Download Management System (November 23, 2025)

### Overview
Complete user control over ALL model downloads with a centralized **DownloadManager** singleton. Users decide WHEN to download, can pause/resume at any time, with full visibility of all ongoing downloads.

### No Auto-Downloads Policy
- ✅ All downloads are ON-DEMAND
- ✅ Pause/resume available
- ✅ State persists across sessions
- ✅ Singleton ensures consistent state

