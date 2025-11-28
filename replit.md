# Kensho - FactCheckerAgent & Learning System

## Overview
Kensho is an advanced AI debate orchestration system designed for reliable, transparent, and high-performance AI-driven factual inference and debate. It features robust fact-checking, a production-ready asynchronous kernel, intelligent routing, multi-queue task execution, and a modern chat UI with an analytics dashboard. The system integrates meta-critique validation, cognitive traceability, performance monitoring, and feedback-driven learning.

## User Preferences
I prefer detailed explanations and transparency in the AI's operations. I want to see the cognitive process and verification steps clearly. I value robust error handling and graceful degradation in system responses. I prefer a modular and extensible architecture. I would like the agent to prioritize reliability and factual accuracy. I prefer that the agent asks before making major changes to the system architecture. I prefer to keep good solutions if they already exist. I want natural, organic color palettes in dark mode with noir doux instead of brown/walnut tones.

## System Architecture
Kensho's core is a **multi-agent debate system** (Optimist, Critic, MetaCritic) orchestrated in a 4-step flow with graceful degradation and cognitive traceability via a `JournalCognitif` system. The architecture emphasizes memory-aware orchestration, cache-aware execution, and real-time streaming for high performance and transparency.

**Core Architectural Components:**
*   **Asynchronous Kernel (v2.0):** Manages AI models and system resources.
*   **Intelligent Router (v2.0):** Directs user requests to appropriate AI agents.
*   **TaskExecutor (v3.1):** Cache-aware orchestration with multi-queue support (SERIAL, PARALLEL_LIMITED, PARALLEL_FULL) and real-time streaming.
*   **MemoryManager (v1.0):** Manages VRAM with real-time estimation and LRU strategies for model unloading.
*   **ModelManager (v3.1):** Memory-aware model switching with transparent status updates via SSEStreamer.
*   **ResponseCache (v1.0):** LRU cache with TTL and deterministic UUID v5 hashing.
*   **SSEStreamer (v1.0):** Central EventEmitter-based real-time event bus for UI updates, delivering tokens, complete messages, errors, and metrics.
*   **DialoguePlugin (v1.0):** Orchestrates caching, VRAM checks, streaming, and metrics.
*   **Fact-Checking System:** Integrated into the chat interface, providing status (VERIFIED, CONTRADICTED, AMBIGUOUS, UNKNOWN), evidence, and confidence scores using semantic search and a knowledge graph.
*   **Production Hardening:** Includes `Fusioner v2.0`, `ExecutionTraceContext`, type-safe error handling, and retry logic.
*   **Structured Logging (v1.0):** Isomorphic logger with context tracking and log levels.
*   **Utilities Library (v1.0):** Modularized utilities (classnames, formatters, JSON, timing).

**UI/UX Decisions:**
*   **Clean and Focused Navigation:** Prioritizes core functionalities with advanced tools in settings.
*   **Inline Fact-Checking Results:** Displays verification outcomes directly in chat.
*   **Dynamic UI Elements:** Panels and dashboards appear only when active.
*   **Real-Time Streaming:** Provides immediate feedback and transparency for system operations.
*   **Responsive Design:** Optimized for mobile and desktop.
*   **Natural Color Palette:** Organic, calming colors (linen, old paper, rice) in light mode; "noir doux" soft black theme in dark mode with warm accents. Theme toggle available in Settings.

## External Dependencies
*   **LLM Providers:** Abstracted models for agent reasoning and verification.
*   **HNSW (Hierarchical Navigable Small Worlds):** For semantic search and embedding storage within `GraphWorker`.
*   **`mathjs`:** Used by `CalculatorAgent`.
*   **`lru-cache` (11.2.2):** For `ResponseCache`.
*   **`uuid` (13.0.0):** For deterministic UUID v5 cache key generation.
*   **`events` (3.3.0):** EventEmitter for `SSEStreamer`.
*   **External Knowledge Graph/Database:** Implied for semantic search and evidence retrieval.