# 📜 Project History

> **The Story of Kensho**

This document chronicles the evolution of Kensho from a simple prototype to a production-ready distributed AI system.

---

## 1. The Beginning (Sprints 1-3)

### Sprint 1: The Foundation (MessageBus v1)
**Goal**: Prove that distributed agents can run in the browser without blocking the UI.

**Technical Achievements**:
-   Created the first `MessageBus` prototype using the `BroadcastChannel` API.
-   Implemented basic RPC (Request/Response) patterns with UUID-based correlation.
-   **Challenge**: Handling message ordering and timeouts.
-   **Solution**: Introduced `RequestManager` to track pending promises.

**Code Stats**:
-   Lines of Code: ~1,200
-   Files Created: 8 (MessageBus, BroadcastTransport, types)
-   First E2E Test: `sprint1-basic-communication.html`

### Sprint 2: The Brain (LLM Integration)
**Goal**: Run a local LLM without freezing the browser.

**Technical Achievements**:
-   Integrated `@mlc-ai/web-llm` with TinyLlama-1.1B (500MB).
-   Offloaded model loading to a dedicated Worker (`LLMWorker`).
-   Implemented token streaming using the `StreamManager`.
-   **Challenge**: The 500MB download was blocking the UI.
-   **Solution**: Added a `DownloadProgressMonitor` with visual feedback.

**Performance Metrics**:
-   Cold Start: ~30 seconds (download + compile).
-   Warm Start: ~2 seconds (cached).
-   Tokens/sec: ~15 on a mid-range laptop.

### Sprint 3: The Tools (Agent Ecosystem)
**Goal**: Enable the LLM to use external tools.

**Technical Achievements**:
-   Created `CalculatorAgent` with safe `mathjs` execution.
-   Added `WeatherAgent` (mock data for testing multi-agent coordination).
-   Designed the "Tool Use" pattern: LLM outputs JSON, Parser extracts function calls.
-   **Innovation**: Function calling without modifying the model (pure prompt engineering).

**Example Tool Call**:
```json
{
  "function": "calculator.evaluate",
  "arguments": { "expression": "2 + 2" }
}
```

---

## 2. The Maturation (Sprints 4-10)

### Sprint 4: OIE (Orchestrateur Intelligent)
**Goal**: Enable multi-step reasoning and agent coordination.

**Technical Achievements**:
-   Created the `OIEAgent` - the first "meta-agent" in Kensho.
-   Integrated `LLMPlanner` which uses the LLM to generate execution plans.
-   Built `TaskExecutor` with support for SERIAL and PARALLEL execution modes.
-   Added support for file attachments (initially PDF and TXT).

**Breakthrough Moment**:
-   User query: "Read this PDF and calculate the total expenses on page 3."
-   OIE Plan: `[UniversalReaderAgent.read(file), CalculatorAgent.sum(expenses)]`
-   Result: ✅ Worked on the first try.

**Code Complexity**:
-   TaskExecutor: 400+ lines with retry logic and error handling.
-   Tests: Added 15 unit tests for plan parsing.

### Sprint 7: Persistence (IndexedDB + Knowledge Graph)
**Goal**: Remember conversations and build a searchable memory.

**Technical Achievements**:
-   Migrated from `localStorage` to `IndexedDB` for scalability.
-   Implemented `GraphWorker` with SQLite (via `sql.js`) and HNSW for vector search.
-   Created a `Projects` table to organize conversations by topic.
-   **Schema**:
    ```sql
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      content TEXT,
      embedding BLOB,
      type TEXT,
      importance REAL
    );
    ```

**Performance**:
-   Indexed 10,000 nodes in ~3 seconds.
-   Vector similarity search: < 50ms.

### Sprint 10: Remote Capabilities (WebSocket + Relay)
**Goal**: Enable cross-device communication.

**Technical Achievements**:
-   Implemented `WebSocketTransport` with auto-reconnection.
-   Built a secure Relay Server (Node.js + Express) with JWT auth.
-   Added `HybridTransport` which intelligently routes between local and remote.
-   **Security**: Rate limiting (100 req/min), payload size validation (1MB max).

**Multi-Device Test**:
-   Device A (Desktop): Loads a 4GB model.
-   Device B (Mobile): Connects via WebSocket and uses Device A's model via RPC.
-   Latency: ~200ms (local network).

---

## 3. The Modern Era (Sprint 13-14)

### Sprint 13: Kernel v2.0
-   **Goal**: Stability and Resource Management.
-   **Problem**: Loading too many models crashed the browser tab.
-   **Solution**: Created `MemoryManager` and `KernelCoordinator`.

### Sprint 14: Elite Performance
-   **Goal**: Speed and Efficiency.
-   **Result**:
    -   **WebGPU Probing**: Real VRAM detection.
    -   **ResponseCache**: Instant answers for repeated queries.
    -   **SSEStreamer**: Smoother UI updates.

---

---

## 4. Architecture Decision Records (ADRs)

### ADR-001: Distributed Agent Communication (Implicit)
**Date**: Sprint 1 (November 2025)

**Decision**: Use `BroadcastChannel` API for inter-agent communication instead of direct Worker `postMessage`.

**Rationale**:
-   **Decoupling**: Agents don't need to know about each other's Worker instances.
-   **Multi-Tab**: Automatic synchronization across browser tabs.
-   **Extensibility**: Easy to add new agents without modifying existing ones.

**Trade-offs**:
-   ✅ Simplified agent development.
-   ❌ Requires browser support (IE11 not supported).

### ADR-002: LLMPlanner Action Schema Contract
**Date**: Sprint 4 (November 22, 2025)

**Problem**: Mismatch between LLM-generated plans (using `method` field) and TypeScript interface (using `action` field).

**Decision**: Standardize on `action` field for all plan steps.

**Schema**:
```typescript
interface PlanStep {
  agent: string;           // e.g., "CalculatorAgent"
  action: string;          // e.g., "calculate"
  args: Record<string, any>;
  prompt?: string;         // For MainLLMAgent
}
```

**Impact**:
-   ✅ Consistent prompt engineering.
-   ✅ Proper result interpolation (`{{step1_result}}`).
-   ❌ Requires migration of cached plans.

### ADR-003: WebGPU for VRAM Detection (Implicit)
**Date**: Sprint 13 (November 2025)

**Decision**: Use `navigator.gpu.requestAdapter()` to detect real VRAM limits instead of theoretical calculations.

**Rationale**:
-   **Accuracy**: Theoretical calculations (params × bits/8) are often wrong.
-   **Safety**: Prevents OOM crashes by knowing the true hardware limit.

**Fallback Strategy**:
-   If WebGPU is unavailable (Node.js, old browsers): Default to 2GB safe limit.

**Code Reference**: `src/core/kernel/MemoryManager.ts`

### ADR-004: LRU Eviction for Model Management (Implicit)
**Date**: Sprint 14 (November 2025)

**Decision**: Use **Least Recently Used (LRU)** strategy for unloading models when VRAM is full.

**Alternatives Considered**:
1.  **FIFO** (First In First Out): Too naive. The oldest model might be the most used.
2.  **LFU** (Least Frequently Used): Requires complex counting. Overhead not worth it.
3.  **LRU**: Good balance. Models used recently are likely to be used again.

**Implementation**: `MemoryManager` tracks `lastUsed` timestamp via `touch(modelKey)`.

---

## 5. The Future (Sprint 15+)

We are now moving towards **Phase 4: Ecosystem**.
-   **Goal**: Allow anyone to build agents for Kensho.
-   **Key Features**: Plugin System, Agent Marketplace.

---

*For current status and roadmap, see [PROJECT_STATUS.md](./PROJECT_STATUS.md).*
