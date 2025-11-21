# Kensho Project Tasks

## Phase 2: MessageBus Refactoring (In Progress) 🚧
Focus: Decomposing the "God Object" MessageBus into specialized managers.

- [x] **Managers Implementation**
    - [x] Create `RequestManager` (RPC handling)
    - [x] Create `StreamManager` (Streaming support)
    - [x] Create `DuplicateDetector` (Deduplication)
    - [x] Create `MessageRouter` (Dispatching)
- [x] **Integration**
    - [x] Refactor `MessageBus` to use managers
- [ ] **Verification**
    - [x] Unit Tests for Managers (41 tests)
    - [ ] Unit Tests for MessageBus (Pending)
    - [ ] E2E Validation (Streaming, Persistence, Chaos)

## Sprint 3: Persistence (Completed) ✅
Focus: Giving agents long-term memory using IndexedDB.

- [x] **Core Infrastructure**
    - [x] Define State Interfaces (`src/core/storage/types.ts`)
    - [x] Implement `IndexedDBAdapter`
    - [x] Create basic test page (`tests/browser/storage-test.html`)
- [x] **System Integration**
    - [x] Integrate `IndexedDBAdapter` into `OfflineQueue` (Persistent Queue)
    - [x] Integrate `IndexedDBAdapter` into `AgentRuntime` (State Management)
- [x] **Validation**
    - [x] Create `sprint3-persistence-e2e.html` (Reload resilience test)
    - [x] Create `sprint3-agent-state-e2e.html` (Agent state test)

## Sprint 2: Streaming Support (Completed) ✅
- [x] **Core Implementation**
    - [x] Add streaming types to `KenshoMessage`
    - [x] Implement stream routing in `MessageBus`
    - [x] Add timeouts and cleanup logic
- [x] **Agent API**
    - [x] `registerStreamMethod` & `callAgentStream`
    - [x] `AgentStreamEmitter` helper
- [x] **Validation**
    - [x] E2E Test: `tests/browser/sprint2-streaming-e2e.html`

## Sprint 1C: Robustness & Chaos (Completed) ✅
- [x] **Offline Message Queue**
- [x] **Duplicate Detection**
- [x] **Chaos Testing**

## Sprint 1B: Coordination (Completed) ✅
- [x] **Discovery & Registry**
- [x] **Leader Election**
- [x] **Observability**

## Sprint 1A: Foundation (Completed) ✅
- [x] Basic MessageBus
- [x] Multi-transport support
