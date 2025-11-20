# Kensho - Distributed Multi-Agent System

## Overview

Kensho is a sophisticated distributed multi-agent communication system that runs entirely in the browser. It implements a complete microservices-like architecture using Web Workers as autonomous agents, featuring advanced distributed systems patterns including leader election, failure detection, message persistence, and multi-transport communication.

The system enables agents (Web Workers) to communicate via RPC, streaming, and pub/sub patterns across both local (same-origin) and remote (cross-device) contexts. It includes comprehensive resilience mechanisms, monitoring capabilities, and data persistence using IndexedDB.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Agent System
- **AgentRuntime**: Execution environment for autonomous agents with lifecycle management, message handling, and state persistence
- **defineAgent/runAgent**: Factory pattern for creating and initializing agents with configuration support
- **Worker-based isolation**: Each agent runs in its own Web Worker for true parallelism

### Communication Layer (MessageBus)
The MessageBus serves as the central nervous system with modular manager components:

- **RequestManager**: Handles RPC-style request/response patterns with timeout management and Promise-based API
- **StreamManager**: Manages streaming data flows for progressive responses (chunks, completion, errors)
- **DuplicateDetector**: Ensures exactly-once semantics using TTL-based caching (60s window)
- **MessageRouter**: Intelligent message dispatching to appropriate handlers
- **OfflineQueue**: Queues messages for offline agents with automatic flush on reconnection and IndexedDB persistence

**Multi-Transport Support**:
- **BroadcastTransport**: Ultra-fast local communication (<1ms latency) via BroadcastChannel API, limited to same-origin contexts
- **WebSocketTransport**: Network communication via relay server with exponential backoff reconnection, circuit breaker pattern, heartbeat monitoring, and message queuing
- **HybridTransport**: Combines both transports with automatic deduplication

### Guardian System (Orion)
Distributed coordination layer providing:

- **WorkerRegistry**: Automatic service discovery with inactivity-based garbage collection (10s threshold)
- **LeaderElection**: Lazy Bully algorithm for single-leader consensus with priority-based selection
- **FailureDetection**: Heartbeat-based monitoring (2s intervals) with automatic re-election on leader failure (6s detection window)
- **OrionGuardian**: Orchestrates all coordination mechanisms with system message routing

### Data Persistence
- **IndexedDBAdapter**: Storage abstraction implementing StorageAdapter interface for agent state, offline queue messages, worker registry, and telemetry
- **State Management**: Agent-scoped state persistence with async save/load operations
- **Queue Persistence**: OfflineQueue messages survive page reloads

### Monitoring & Observability
- **MetricsCollector**: Comprehensive metrics system with counters, timings, and gauges
  - Supports windowed statistics (min, max, avg, p50, p95, p99)
  - Tag-based metric organization
  - Automatic expiration of old values (60s TTL)
  - 20 unit tests covering all functionality
- **PerformanceMonitor**: Helper utilities for performance tracking
  - Async/sync function monitoring
  - Decorator support (@Monitor)
  - Checkpoint support for multi-step operations
- **Integrated Metrics**: WebSocket and RequestManager instrumented with:
  - Connection metrics (connections, disconnections, errors)
  - Message metrics (sent, received, dropped)
  - Latency metrics (send time, parse time, process time)
  - Throughput metrics (bytes sent/received, messages/sec)
  - Request metrics (created, succeeded, failed, timeout)
- **MetricsDashboard**: React component for real-time metrics visualization
  - Configurable refresh interval (500ms - 5s)
  - Connection status with color-coded badges
  - Latency percentiles (avg, p95)
  - Reliability statistics
- **Telemetry Agent**: Centralized log collection with batching (10 logs or 500ms flush)
- **Observatory UI**: Real-time visualization of agent constellation, leader status, epoch tracking, and log streaming with severity-based coloring

### AI Agent Orchestration (Sprint 2)
- **OIEAgent (Orchestration Intelligence Engine)**: Central orchestrator for multi-agent AI system
  - Receives user queries and plans task execution
  - Dynamic routing to specialized agents (CodeAgent, VisionAgent, MainLLMAgent)
  - Configuration-based agent availability (AVAILABLE_AGENTS set)
  - Graceful fallback when agents unavailable
  - Exposes `getAvailableAgents()` for introspection
- **TaskPlanner**: Intelligent keyword-based routing system
  - Multi-keyword detection with normalization (accents support)
  - Prioritization: VisionAgent > CodeAgent > MainLLMAgent
  - Confidence scoring and metadata (detected keywords)
  - Configurable agent availability and defaults
  - **19 unit tests covering routing, edge cases, configuration**
- **MainLLMAgent**: WebGPU-accelerated LLM inference via web-llm
  - TinyLlama-1.1B-Chat model for Sprint 2
  - Streaming response generation with chunked delivery
  - Configurable parameters: temperature, max_tokens, top_p
  - Intelligent system prompts (multi-language support)
  - Parameter validation and error handling
  - Methods: `generateResponse`, `getSystemCapabilities`, `resetEngine`, `getModelStats`
- **ModelLoader**: Robust model loading with resilience
  - WebGPU availability check with CPU fallback
  - Retry logic (3 attempts, configurable delay)
  - Persistent storage request for model caching
  - Progress phases: checking_gpu, downloading, compiling, ready, error
  - Static `getSystemCapabilities()` for introspection

### Testing Infrastructure
- **Vitest Configuration**: Unit tests for core components (MessageBus, OfflineQueue, OrionGuardian, Managers, Monitoring) with 61+ test cases
- **Monitoring Tests**: 20 comprehensive tests for MetricsCollector and PerformanceMonitor
  - Counters with tags
  - Timing statistics with precise percentile validation (±0.005 tolerance)
  - Gauge values
  - Window expiration
  - Async/sync monitoring helpers
- **E2E Test Suite**: Browser-based validation for communication patterns, resilience (chaos testing), persistence, streaming, and multi-transport scenarios
- **Chaos Testing**: Automated kill/restart cycles to validate system self-healing
- **web-llm POC Test** (tests/poc/test-webllm.html): Browser-based validation test for @mlc-ai/web-llm integration
  - Validates WebGPU availability
  - Tests model loading and initialization (TinyLlama-1.1B)
  - Verifies inference capabilities with progress monitoring
  - Run with: `npm run test:poc:webllm`
- **Sprint 2 E2E Test** (tests/browser/sprint2-e2e.html): Complete OIE + LLM integration test
  - Tests full flow: UI → OIE → LLM → streaming response
  - Worker monitoring (OIE, LLM status)
  - Model loading progress visualization
  - Parameter configuration UI (temperature, max_tokens)
  - System logs and metadata display
  - Run with: `npm run test:e2e:sprint2`

## External Dependencies

### Runtime Dependencies
- **React 18**: UI framework with React Query for state management
- **Radix UI**: Component primitives (Dialog, Tabs, ScrollArea, etc.)
- **shadcn/ui**: Design system built on Radix with Tailwind CSS styling
- **Lucide Icons**: Icon library
- **React Router**: Client-side routing
- **Vite**: Build tool and dev server
- **TypeScript**: Type safety across codebase

### WebSocket Infrastructure
- **ws** (Node.js package): WebSocket server implementation for relay service
- **Relay Server** (server/relay.js): Message broadcasting hub running on port 8080 with connection tracking and heartbeat support

### Storage
- **IndexedDB**: Browser-native persistent storage (no external database required)
- Storage stores: `AGENT_STATE`, `OFFLINE_QUEUE`, `WORKER_REGISTRY`, `TELEMETRY`

### Testing
- **Vitest**: Unit test runner with happy-dom browser environment simulation
- **esbuild**: Used by Vite for agent bundling (builds to dist/test-agents/)
- **@mlc-ai/web-llm**: WebGPU-based LLM inference library for browser-based AI capabilities
- **tsx**: TypeScript execution tool for Node.js scripts

### Build & Development
- **ESLint**: Code linting with TypeScript support
- **PostCSS**: CSS processing with Tailwind and Autoprefixer
- **Tailwind CSS**: Utility-first styling framework

### Key Design Patterns
- **Facade Pattern**: MessageBus delegates to specialized managers
- **Factory Pattern**: defineAgent for agent instantiation
- **Observer Pattern**: Event-driven message handling
- **Circuit Breaker**: WebSocket fault tolerance (10 retry limit)
- **Exponential Backoff**: Reconnection strategy (1s → 30s max)
- **Leader Election**: Bully algorithm for distributed consensus