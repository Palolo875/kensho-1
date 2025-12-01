# Kensho - FactCheckerAgent & Learning System

## Overview
Kensho is an advanced AI debate orchestration system designed for reliable, transparent, and high-performance AI-driven factual inference and debate. It features robust fact-checking, a production-ready asynchronous kernel, intelligent routing, multi-queue task execution, and a modern chat UI with an analytics dashboard. The system integrates meta-critique validation, cognitive traceability, performance monitoring, and feedback-driven learning.

## User Preferences
I prefer detailed explanations and transparency in the AI's operations. I want to see the cognitive process and verification steps clearly. I value robust error handling and graceful degradation in system responses. I prefer a modular and extensible architecture. I would like the agent to prioritize reliability and factual accuracy. I prefer that the agent asks before making major changes to the system architecture. I prefer to keep good solutions if they already exist. I want natural, organic color palettes in dark mode with noir doux instead of brown/walnut tones. I want mobile-responsive designs with smaller, optimized sizing for small screens.

## Recent Changes (Dec 1, 2025)
- **Model Selector Dialog Removed:** Application now starts directly without model selection popup
- **SharedWorker Architecture (v1.0):** Complete isolation architecture for UI/Backend communication
  - **KenshoWorker:** SharedWorker entry point supporting multi-tab connections with connection tracking
  - **KernelInitializer:** Secure message handling with Zod validation, AbortController for task cancellation, cleanup lifecycle
  - **UI Bridge:** Promise-based API with automatic timeout, message queue for unready worker, reconnection (3 attempts), helper methods (processPrompt, cancelTask, clearCache, ping)
  - **Message Types:** Strict TypeScript types with Zod schemas for process-prompt, cancel-task, clear-cache, get-status, ping
  - **Security:** Message validation at worker entry, exhaustive switch for type safety, error isolation

## Recent Changes (Nov 30, 2025)
- **MemoryManager v2.0 Enhanced:** Complete rewrite with advanced VRAM management
  - **Smart Recommendations:** `suggestModelToUnload()` uses LRU + utility scoring (recency, usage, efficiency, priority)
  - **Forced Reclaim:** `forceReclaim(targetFreeVRAM)` with iterative VRAM re-evaluation after each unload
  - **Emergency Cleanup:** `emergencyCleanup()` for critical situations
  - **State Persistence:** Automatic save/restore via localStorage with validation and resync from catalog
  - **Advanced Metrics:** Track inferenceCount, totalInferenceTime, lastAccessedAt per model
  - **Model Pinning:** CRITICAL/HIGH/NORMAL/LOW priorities with pin protection for essential models
  - **Strict Validation:** Validate cached entries (timestamps, VRAM, priority) before restoration
- **ModelCatalog Enhanced:** Added `virtual_vram_gb`, `specialty`, `priority`, `pin` fields for each model
- **DialoguePlugin Updated:** Uses new `suggestModelToUnload()` API for intelligent VRAM recommendations
- **ResponseCache v2.0 Enhanced:** SHA-256 hashing (Web Crypto API), full `CachedResponse` metadata (modelUsed, timestamp, tokens, promptHash), utility methods (`invalidateModel`, `invalidateOlderThan`, `getEntriesByModel`), advanced stats by model
- **Fusioner v3.0 Refactored:** 
  - **Unified API:** `fuseUnified(results[])` for homogeneous multi-agent fusion (no primaire/experts distinction)
  - **Advanced Contradiction Detection:** Multi-agent conflict scoring with detail tracking
  - **Enriched Metadata:** `FusionOutput` with sources, confidence, strategy, conflicts count, tokensUsed, timestamp
  - **Mock Harmonizer by Specialty:** Synthesizes CODE (with 🔒 security + ⚡ perf tips as inline tips), DIALOGUE (passthrough), MATH (alternative methods)
  - **Intelligent Fallback:** If primary fails, select best expert via weighted scoring (confidence 50% + length 30% + speed 20%)
  - **Natural Synthesis:** One-line insights using `> emoji message` format instead of section headers
  - **Fusion Strategies:** CONSENSUS, CONFLICT_RESOLUTION, PRIORITY, ENRICHMENT, COMPLEMENTARY, QUALITY_SYNTHESIS
  - **Backward Compatible:** Original `fuse(primaryResult, expertResults)` API still works

## Recent Changes (Nov 28, 2025)
- **Sound Wave Visualization ENHANCED:** Completely redesigned WaveformVisualizer with 3-layer animated waveforms, much larger display (200x200px SVG), dynamic frequency response to audio intensity, multiple gradient layers, glow effects, and pulsing intensity meter with radial display
- **File Upload Buttons FIXED:** Both Plus (+) and Paperclip buttons now properly trigger file selection with preventDefault/stopPropagation, accept multiple formats (.pdf, .png, .jpg, .jpeg, .gif, .webp, .doc, .docx, .txt)
- **Voice Recording UI Enhanced:** Full-screen waveform visualization during recording with large animated display (h-48), multiple frequency layers, responsive intensity meter, smooth animations synced to audio level
- **Sidebar Interactions Fixed:** Analytics.tsx now has proper callback implementations for onOpenSettings, onOpenSearch, onOpenObservatory, onNewConversation matching Index.tsx pattern, includes SettingsModal, SearchModal, ObservatoryModal
- **Custom Icon System:** Created personalized handmade-style icons (JournalIcon, LightbulbIcon, WarningIcon, CustomCrownIcon) replacing AI-generated emojis for authentic visual identity
- **Observatory Modal Complete Mobile Responsive:** Centered header with flexbox, w-full max-w-2xl sm:max-w-4xl lg:max-w-6xl, tabs responsive (Journal, Agents, Logs), all content px-3 sm:px-6, text-xs sm:text-sm
- **Observatory Tabs Optimized:** Journal tab with custom icons, Agents grid 1 col mobile → 2 sm → 3 lg, Logs tab scrollable height-[300px] sm:height-[400px]
- **Analytics Dashboard Mobile Responsive:** Headers reduced from text-5xl to text-2xl sm:text-3xl md:text-4xl, cards grid 2 cols on mobile / 4 cols on desktop, padding optimized (px-3 sm:px-6)
- **PerformanceDashboard Responsive:** All metric cards (Total, Success, Avg Response, Active) now have responsive text sizes (text-2xl sm:text-3xl), reduced padding, mobile-first layout with 2-column grid
- **Chart Heights Reduced:** All charts reduced from height={300} to height={200} for better mobile viewing
- **Responsive Utilities:** Consistent use of px-3 sm:px-6 spacing, text-[10px] sm:text-xs for small labels, gap-2 sm:gap-4 for grid spacing

## System Architecture
Kensho's core is a **multi-agent debate system** (Optimist, Critic, MetaCritic) orchestrated in a 4-step flow with graceful degradation and cognitive traceability via a `JournalCognitif` system. The architecture emphasizes memory-aware orchestration, cache-aware execution, and real-time streaming for high performance and transparency.

**Core Architectural Components:**
*   **Asynchronous Kernel (v2.0):** Manages AI models and system resources.
*   **Intelligent Router (v2.0):** Directs user requests to appropriate AI agents.
*   **TaskExecutor (v3.1):** Cache-aware orchestration with multi-queue support (SERIAL, PARALLEL_LIMITED, PARALLEL_FULL) and real-time streaming.
*   **MemoryManager (v2.0):** Advanced VRAM management with smart recommendations (LRU + utility scoring), forced reclaim with iterative re-evaluation, emergency cleanup, state persistence with validation, inference metrics tracking, and model pinning support.
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