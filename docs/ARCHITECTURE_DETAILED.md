# 🏗️ Kensho Architecture - Detailed Guide

Complete deep-dive into Kensho's architecture.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   React Application (UI)                    │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│              Message Bus (Communication Hub)                │
│  ├── RequestManager (RPC)                                   │
│  ├── StreamManager (Streaming)                              │
│  ├── DuplicateDetector (Exactly-once)                       │
│  ├── MessageRouter (Dispatch)                               │
│  └── OfflineQueue (Persistence)                             │
└─────────────────────────────────────────────────────────────┘
          ↕ Multiple Transports ↕
     ┌─────────────────────────────────┐
     ├── BroadcastChannel (Local)       │
     ├── WebSocket (Network)            │
     └── Hybrid (Both)                  │
     └─────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────┐
│           Web Workers (Autonomous Agents)                   │
│  ├── LLMAgent (WebGPU Inference)                            │
│  ├── CalculatorAgent (Math Evaluation)                      │
│  ├── OIEAgent (Orchestration)                               │
│  ├── TelemetryAgent (Logging)                               │
│  └── Custom Agents (Your Code)                              │
└─────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────┐
│           Guardian System (Coordination)                    │
│  ├── WorkerRegistry (Discovery)                             │
│  ├── LeaderElection (Consensus)                             │
│  └── FailureDetection (Heartbeat)                           │
└─────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────┐
│        IndexedDB (Persistent Storage)                       │
│  ├── Agent State                                            │
│  ├── Offline Queue                                          │
│  ├── Worker Registry                                        │
│  └── Telemetry Logs                                         │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent Runtime (`src/core/agent-system/`)

**Purpose**: Execution environment for agents

**Key Classes**:
- `AgentRuntime`: Base runtime with lifecycle, messaging, state management
- `defineAgent`: Factory for creating agents
- `runAgent`: Entry point for agent execution

**Lifecycle**:
```
init() → ready → handleMessages() → stop() → cleanup()
```

**Features**:
- ✅ Message handling with type safety
- ✅ Handler registration and dispatch
- ✅ Streaming support
- ✅ State persistence
- ✅ Error handling

### 2. Message Bus (`src/core/communication/`)

**Purpose**: Central hub for all inter-agent communication

**Components**:

#### RequestManager
- Handles RPC-style request/response
- Promise-based API
- Timeout management
- Automatic error propagation

**Example**:
```typescript
const response = await messageBus.request('TargetAgent', payload, 5000);
```

#### StreamManager
- Progressive data delivery
- Chunk buffering
- Error handling
- Completion signals

**Example**:
```typescript
await messageBus.requestStream('Agent', payload, {
  onChunk: (data) => console.log(data),
  onError: (err) => console.error(err),
  onComplete: () => console.log('done')
});
```

#### DuplicateDetector
- Ensures exactly-once semantics
- TTL-based cache (60s window)
- Prevents message duplication

**Algorithm**:
```
messageId → hash → cache lookup → if exists: reject, else: cache & forward
```

#### MessageRouter
- Intelligent message dispatching
- Type-based routing
- Handler priority

**Supported Message Types**:
- `REQUEST` - RPC request
- `RESPONSE` - RPC response
- `STREAM_REQUEST` - Stream initiation
- `STREAM_CHUNK` - Stream data
- `STREAM_END` - Stream completion
- `PUB_SUB` - Publish/Subscribe

#### OfflineQueue
- Queues messages for offline agents
- IndexedDB persistence
- Automatic flush on reconnection
- Max 1000 messages, max age 30 days

### 3. Transports (`src/core/communication/transport/`)

**Purpose**: Pluggable communication mechanisms

#### BroadcastTransport (Default)
- **Mechanism**: Browser BroadcastChannel API
- **Scope**: Same origin only
- **Latency**: <1ms
- **Use Case**: Local dev, same-tab communication

```typescript
const transport = new BroadcastTransport('channel-name');
```

#### WebSocketTransport
- **Mechanism**: WebSocket via relay server
- **Scope**: Network-wide (different devices)
- **Latency**: 10-100ms (network dependent)
- **Use Case**: Distributed systems, multi-device

```typescript
const transport = new WebSocketTransport('ws://localhost:8080');
```

**Features**:
- Exponential backoff reconnection (1s → 30s)
- Circuit breaker (max 10 retries)
- Heartbeat monitoring (30s interval)
- Automatic message queuing

#### HybridTransport
- **Mechanism**: BroadcastChannel + WebSocket
- **Deduplication**: Automatic
- **Use Case**: Production (maximum resilience)

```typescript
const transport = new HybridTransport({
  broadcast: new BroadcastTransport(),
  websocket: new WebSocketTransport('ws://...')
});
```

### 4. Guardian System (`src/core/guardian/`)

**Purpose**: Distributed coordination and consensus

#### WorkerRegistry
- Automatic service discovery
- Inactivity-based garbage collection (10s threshold)
- Tracks: name, id, status, lastHeartbeat

**API**:
```typescript
registry.register(workerId, { name, status });
registry.unregister(workerId);
registry.getWorker(workerId);
registry.getAllWorkers();
```

#### LeaderElection
- **Algorithm**: Lazy Bully (modified)
- **Priority**: Worker ID (higher = higher priority)
- **State**: FOLLOWER, CANDIDATE, LEADER

**Process**:
```
1. Worker startup → register in registry
2. No leader exists? → trigger election
3. Highest priority worker wins
4. Others become followers
5. Leader periodically sends heartbeat
6. If leader dies → re-election
```

#### FailureDetection
- Heartbeat monitoring (2s intervals)
- Detection window (6s for failure)
- Automatic re-election on leader failure

**State Machine**:
```
HEALTHY → (no heartbeat for 6s) → SUSPECTED → DEAD → re-election
```

### 5. Storage (`src/core/storage/`)

**Purpose**: Persistent data management

#### IndexedDBAdapter
- Browser-native storage
- Async API (Promise-based)
- Multiple object stores

**Stores**:
- `AGENT_STATE` - Agent persisted state
- `OFFLINE_QUEUE` - Queued messages
- `WORKER_REGISTRY` - Registry snapshots
- `TELEMETRY` - Log entries

**Usage**:
```typescript
const storage = new IndexedDBAdapter('kensho');

// Save
await storage.saveState('AgentName', { data: 'value' });

// Load
const state = await storage.loadState('AgentName');

// Clear
await storage.clearState('AgentName');
```

### 6. Monitoring (`src/core/monitoring/`)

**Purpose**: Observability and performance tracking

#### MetricsCollector
- Counters (with tags)
- Timings (with percentiles: p50, p95, p99)
- Gauges (current values)
- Automatic expiration (60s TTL)

**API**:
```typescript
metrics.incrementCounter('requests', { endpoint: '/api' });
metrics.recordTiming('response_time_ms', 45);
metrics.recordGauge('active_connections', 5);

// Get stats
const stats = metrics.getTimingStats('response_time_ms');
// Returns: { min, max, avg, p50, p95, p99, count }
```

#### PerformanceMonitor
- Function monitoring (sync/async)
- Decorator support
- Checkpoint tracking

**Usage**:
```typescript
@Monitor('expensive_operation')
async processData(data) {
  // Automatically tracked
}

// Or manual:
const monitor = new PerformanceMonitor('operation');
monitor.start();
// ... do work ...
const duration = monitor.end();
```

### 7. Specialized Agents

#### CalculatorAgent
- **Purpose**: Secure math expression evaluation
- **Engine**: mathjs
- **Supported**: Arithmetic, functions, constants
- **Rejected**: Matrices, complex numbers, unit conversion

#### MainLLMAgent
- **Purpose**: WebGPU-accelerated LLM inference
- **Model**: Phi-3-mini-4k-instruct
- **Features**: Streaming, configurable parameters, GPU fallback

#### OIEAgent
- **Purpose**: Multi-agent orchestration
- **Routing**: Keyword-based task planning
- **Features**: Dynamic agent availability, graceful fallback

---

## Communication Patterns

### 1. Request-Response (RPC)

```typescript
// Sender
const result = await messageBus.request('TargetAgent', { query: 'data' }, 5000);

// Receiver
runtime.registerHandler('default', async (payload) => {
  return { result: 'processed' };
});
```

### 2. Streaming

```typescript
// Sender
await messageBus.requestStream('TargetAgent', {}, {
  onChunk: (chunk) => console.log(chunk),
  onError: (err) => console.error(err),
  onComplete: () => console.log('done')
});

// Receiver
runtime.registerHandler('default', async (payload, sender, streamId) => {
  if (!streamId) return; // Not a stream request

  for (let i = 0; i < 10; i++) {
    await runtime.sendStreamChunk(streamId, { progress: i });
  }
  await runtime.sendStreamEnd(streamId, { done: true });
});
```

### 3. Pub/Sub

```typescript
// Publisher
messageBus.publish('channel', { data: 'value' });

// Subscriber
messageBus.subscribe('channel', (message) => {
  console.log('Received:', message);
});
```

---

## Data Flow Example

**User types a question → LLM generates response**

```
1. User input (React Component)
   ↓
2. Kensho Store (Zustand) captures input
   ↓
3. MessageBus.request() to OIEAgent
   ↓
4. OIEAgent analyzes query
   ↓
5. OIEAgent routes to MainLLMAgent
   ↓
6. MainLLMAgent.generateResponse() (WebGPU)
   ↓
7. Streaming chunks back through MessageBus
   ↓
8. Store receives chunks, updates UI
   ↓
9. Display response in chat view
```

---

## Resilience Patterns

### 1. Circuit Breaker (WebSocket)
- Opens after 10 failed reconnection attempts
- Prevents repeated connection attempts
- Manual reset required

### 2. Exponential Backoff
- First retry: 1s
- Max retry: 30s
- Formula: min(30, previous * 1.5)

### 3. Offline Queue
- Automatically queues if agent unavailable
- Persists to IndexedDB
- Flushed when agent comes online

### 4. Duplicate Detection
- TTL cache (60s window)
- Prevents duplicate processing
- Atomic check-and-insert

### 5. Health Checks
- Heartbeat every 2s
- Detection window: 6s
- Auto re-election on failure

---

## Performance Characteristics

| Operation | Latency | Notes |
|-----------|---------|-------|
| BroadcastChannel Message | <1ms | Same origin only |
| WebSocket Message | 10-100ms | Network dependent |
| IndexedDB Write | 5-50ms | Async, browser dependent |
| Agent Startup | 100-500ms | Worker creation + init |
| LLM Inference | 1-10s | Model size + hardware dependent |
| Calculator Math | 1-50ms | Expression complexity dependent |

---

## Security Architecture

### Isolation
- Each agent runs in separate Web Worker
- No direct memory access between agents
- Message-only communication

### Validation
- Payload validation (Zod schemas)
- Message type checking
- Handler verification

### Limits
- Request timeout (configurable)
- Message size (IndexedDB limits)
- Queue size (1000 max)

### Storage
- IndexedDB scope per domain
- No cross-origin access
- Browser security policies apply

---

See also: [API_REFERENCE.md](./API_REFERENCE.md) for detailed API documentation.
