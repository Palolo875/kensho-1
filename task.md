# Kensho Project Tasks

## Sprint 3: Persistence (Next)
Focus: Giving agents long-term memory using IndexedDB.

- [ ] **Core Infrastructure**
    - [ ] Define State Interfaces (`src/core/state/types.ts`)
    - [ ] Implement `IndexedDBAdapter`
    - [ ] Implement `StateManager` class
- [ ] **System Integration**
    - [ ] Integrate StateManager into `AgentRuntime`
    - [ ] Make `WorkerRegistry` persistent
    - [ ] Make `OfflineQueue` persistent
- [ ] **Validation**
    - [ ] Create `sprint3-persistence-e2e.html`

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
    - [x] Robustness verification (timeouts, types)

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
