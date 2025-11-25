# Kensho - FactCheckerAgent & Learning System

## Overview
Kensho is an advanced AI debate orchestration system with meta-critique validation, cognitive traceability, performance monitoring, and feedback-driven learning. It features robust fact-checking capabilities, a production-ready asynchronous kernel, intelligent routing, multi-queue task execution, and a modern chat UI with an analytics dashboard. The project aims to provide a reliable, transparent, and high-performance platform for AI-driven factual inference and debate.

## User Preferences
I prefer detailed explanations and transparency in the AI's operations. I want to see the cognitive process and verification steps clearly. I value robust error handling and graceful degradation in system responses. I prefer a modular and extensible architecture. I would like the agent to prioritize reliability and factual accuracy. I prefer that the agent asks before making major changes to the system architecture.

## System Architecture
Kensho's architecture is built around a multi-agent debate system (Optimist, Critic, MetaCritic) orchestrated in a 4-step flow with graceful degradation. Cognitive traceability is provided via a `JournalCognitif` system.

**Key Architectural Components:**

*   **Asynchronous Kernel (v2.0):** Robust core for managing AI models and system resources.
*   **Intelligent Router (v2.0):** Directs user requests to appropriate AI agents based on intent (e.g., `FACTCHECK`).
*   **TaskExecutor (v3.0):** Orchestrates multi-agent task execution with concurrent, prioritized multi-queues (SERIAL, PARALLEL\_LIMITED, PARALLEL\_FULL) and streaming capabilities.
*   **MemoryManager (v1.0):** Manages VRAM with real-time estimation, LRU strategies for model unloading, and integration with the ModelManager.
*   **ResponseCache:** LRU cache with automatic eviction for optimizing response times and reducing re-computation.
*   **EventBus & SSEStreamer:** Isomorphic streaming solutions for real-time token delivery, performance metrics (TTFT, tokens/sec), and browser/Node client support.
*   **DialoguePlugin:** Orchestrates caching, VRAM checks, streaming, and metrics for efficient and optimized dialogue processing.
*   **Fact-Checking System:** Integrated directly into the main chat interface, it uses semantic search and a knowledge graph to verify claims, providing status (VERIFIED, CONTRADICTED, AMBIGUOUS, UNKNOWN), evidence, and confidence scores.
*   **Chat UI + Analytics Dashboard:** A modern UI with real-time chat streaming, multi-layer execution trace visualization, and a performance dashboard displaying key metrics like request counts, success rates, response times, and queue statistics.
*   **Production Hardening:** Includes `Fusioner v2.0` with multiple strategies, `ExecutionTraceContext` for comprehensive debugging, type-safe error handling, retry logic with exponential backoff, and stress-tested resilience.

**UI/UX Decisions:**

*   **Clean and Focused Navigation:** Sidebar prioritizes Conversation, Search, History, and Projects, with advanced tools (Observatory, Analytics, Fact-Checking examples) accessible via a Settings modal for a cleaner interface.
*   **Inline Fact-Checking Results:** Fact-checking outcomes are displayed directly within the chat interface, showing claim status, evidence cards, and semantic search results.
*   **Dynamic UI Elements:** Download panels only appear during active downloads, and project dashboards activate upon selection, maintaining a clean interface.
*   **Responsive Design:** All UI components are designed for optimal viewing on both mobile and desktop.

## External Dependencies
*   **LLM Providers:** Abstracted models used for agent reasoning, claim extraction, and verification.
*   **HNSW (Hierarchical Navigable Small Worlds):** Utilized for efficient semantic search and embedding storage within the `GraphWorker` for evidence retrieval.
*   **`mathjs`:** Used by the `CalculatorAgent` for secure mathematical operations.
*   **External Knowledge Graph/Database:** Implied for semantic search and evidence retrieval during the fact-checking process.