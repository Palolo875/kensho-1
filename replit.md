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
- **OIEAgent (Orchestration Intelligence Engine)**: Central orchestrator for multi-agent AI, dynamically routing user queries to specialized agents.
- **TaskPlanner**: Intelligent keyword-based routing system with confidence scoring and prioritization for agents.
- **MainLLMAgent**: WebGPU-accelerated LLM inference (TinyLlama-1.1B-Chat) with streaming response generation and configurable parameters.
- **ModelLoader**: Robust model loading with WebGPU availability checks, retry logic, and persistent storage requests for caching.
- **CalculatorAgent**: Specialized agent for precise mathematical calculations using mathjs, with security features and standardized error handling.

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
- **IndexedDB**: Browser-native persistent storage for `AGENT_STATE`, `OFFLINE_QUEUE`, `WORKER_REGISTRY`, `TELEMETRY`.

### AI/ML
- **@mlc-ai/web-llm**: WebGPU-based LLM inference library.
- **mathjs**: Used by CalculatorAgent for secure expression evaluation.

### Build & Development
- **ESLint**: Code linting.
- **PostCSS**: CSS processing.
- **Tailwind CSS**: Utility-first styling.