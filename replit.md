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
## Centralized Download Management System (November 23, 2025)

### Overview
Complete user control over ALL model downloads with a centralized **DownloadManager** singleton. Users decide WHEN to download, can pause/resume at any time, with full visibility of all ongoing downloads.

### Key Changes
1. **DownloadManager** (`src/core/downloads/DownloadManager.ts`):
   - Singleton managing all downloads with unique IDs
   - Types: 'llm' | 'embedding' | 'other'
   - Status: 'idle' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled'
   - Methods: register, pause, resume, pauseAll, resumeAll, updateProgress, subscribe

2. **MainLLMAgent Integration**:
   - Registers LLM download in DownloadManager
   - Listens for START_DOWNLOAD message from user
   - Synchronized pause/resume through DownloadManager

3. **EmbeddingAgent Integration**:
   - Lazy loading - only downloads on first use
   - Fully integrated with DownloadManager
   - Respects pause/resume commands

4. **useKenshoStore Extensions**:
   - New state: `downloads: DownloadProgress[]`
   - New methods: `startModelDownload()`, `pauseAllDownloads()`, `resumeAllDownloads()`
   - Subscribes to DownloadManager for real-time UI updates

5. **ModelLoadingView Updates**:
   - Shows initial idle state with "Démarrer le téléchargement" button
   - Displays all active downloads
   - Pause/resume controls per download
   - No automatic downloads - user controls everything

### No Auto-Downloads Policy
- ✅ LLM model doesn't load automatically
- ✅ Embedding model only loads on first use
- ✅ All downloads are ON-DEMAND
- ✅ Pause/resume available for all downloads
- ✅ State persists across tab re-mounts and browser refreshes
- ✅ Singleton ensures consistent state across entire app

### Architecture Flow
```
User Interface
    ↓
ModelLoadingView (displays all downloads)
    ↓
useKenshoStore (subscribes to DownloadManager)
    ↓
DownloadManager (singleton coordinates all downloads)
    ↑
MainLLMAgent, EmbeddingAgent (register downloads + respect pause)
```

