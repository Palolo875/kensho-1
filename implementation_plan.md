# 💾 Sprint 3 Implementation Plan: Persistence Integration

## Goal
Integrate the `IndexedDBAdapter` into the core system components to ensure data survival across page reloads.

## User Review Required
> [!IMPORTANT]
> This change introduces asynchronous initialization for `MessageBus` and `AgentRuntime` because IndexedDB access is async.
> Existing code that synchronously instantiates agents might need to await a `ready()` promise.

## Proposed Changes

### 1. OfflineQueue Persistence
The `OfflineQueue` currently stores messages in memory (`Map<string, QueueItem[]>`).
We will modify it to write to `STORES.OFFLINE_QUEUE` on every enqueue/dequeue.

#### [MODIFY] [OfflineQueue.ts](file:///c:/Users/dell/Music/kensho-1/src/core/communication/OfflineQueue.ts)
- Inject `StorageAdapter` in constructor.
- `enqueue()`: Add to memory AND save to DB.
- `dequeue()`/`flush()`: Remove from memory AND DB.
- `loadFromStorage()`: New method called on startup to restore queue from DB.

### 2. Agent State Persistence
Allow agents to save their internal state easily.

#### [MODIFY] [AgentRuntime.ts](file:///c:/Users/dell/Music/kensho-1/src/core/agent-system/AgentRuntime.ts)
- Add `storage: StorageAdapter` property.
- Add public methods:
    - `saveState(key: string, value: unknown): Promise<void>`
    - `loadState<T>(key: string): Promise<T | undefined>`
- These methods will use `STORES.AGENT_STATE` with a key prefix based on the agent's name.

### 3. Guardian Persistence
The Guardian needs to remember which workers were alive to speed up discovery on reload.

#### [MODIFY] [OrionGuardian.ts](file:///c:/Users/dell/Music/kensho-1/src/core/guardian/OrionGuardian.ts)
- Save `knownWorkers` list to `STORES.WORKER_REGISTRY` periodically or on change.
- Load this list on startup.

## Verification Plan

### Automated Tests
- **Unit Tests**: Update `OfflineQueue.test.ts` to mock `StorageAdapter` and verify calls.
- **E2E Test**: `tests/browser/sprint3-persistence-e2e.html`
    1. Start Agent A and Agent B.
    2. Agent A sends message to Agent B (who is offline/busy).
    3. Message goes to OfflineQueue.
    4. **RELOAD PAGE**.
    5. Agent A restarts.
    6. Verify OfflineQueue restores the message.
    7. Agent B comes online.
    8. Message is delivered.

### Manual Verification
- Use `tests/browser/storage-test.html` to inspect DB content.
