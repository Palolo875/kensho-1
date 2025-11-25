# 🧩 Kensho Components Encyclopedia

> **Technical Reference**

This document provides a deep dive into the internal components of Kensho. It is intended for advanced developers who need to understand the API and behavior of specific modules.

---

## 1. Kernel v2.0 Components

### 1.1. MemoryManager
**Path**: `src/core/kernel/MemoryManager.ts`

The `MemoryManager` is a singleton that acts as the gatekeeper for VRAM.

**Internal Logic**:
1.  **Initialization**: Calls `navigator.gpu.requestAdapter()` to get `maxBufferSize`.
2.  **Fallback**: If WebGPU is missing (or in Node.js), defaults to a safe 2GB limit.
3.  **Bundle Tracking**: When a model is loaded, its size is stored in `realBundleSizes` map and persisted to `localStorage`.

**Public API**:
```typescript
class MemoryManager {
  // Returns true if the model fits in VRAM with safety margin
  async canLoadModel(modelKey: string): Promise<{ can: boolean; reason?: string }>;

  // Marks a model as loaded and deducts its size from available VRAM
  registerLoaded(modelKey: string, sizeGB: number): void;

  // Marks a model as unloaded and frees the VRAM
  registerUnloaded(modelKey: string): void;

  // Returns current VRAM usage stats
  getStats(): { used: number; total: number; models: number };
}
```

### 1.2. ResourceManager
**Path**: `src/core/kernel/ResourceManager.ts`

The `ResourceManager` provides a real-time view of the device's health.

**Monitoring Logic**:
-   **Battery**: Listens to `levelchange` and `chargingchange`. Emits `battery-low` if level < 15% and discharging.
-   **Network**: Listens to `navigator.connection` changes. Emits `network-offline` if `navigator.onLine` is false.
-   **Memory**: Tracks a rolling history of 10 samples to determine if memory usage is `rising`, `falling`, or `stable`.

**Events**:
-   `battery-low`: Triggered when battery is critical.
-   `network-offline`: Triggered when connection is lost.
-   `memory-pressure`: Triggered when JS heap is rising dangerously fast.

**Public API**:
```typescript
class ResourceManager {
  // Returns a snapshot of the current device status
  getStatus(): DeviceStatus;

  // Subscribe to resource events
  on(event: ResourceEvent, handler: EventHandler): void;
}
```

---

## 2. Agents

### 2.1. OIE (Orchestrateur Intelligent d'Exécution)
**Path**: `src/agents/oie/index.ts`

The OIE is the "Manager" agent. It uses a specialized `LLMPlanner` to decompose tasks.

**Initialization Barrier**:
The OIE has a strict initialization sequence. It waits for the `GraphWorker` to be fully ready before accepting any requests. If a request comes in early, it enters a retry loop (max 100 retries, 50ms interval).

**Intent Classification**:
Before planning, the OIE calls the `IntentClassifierAgent` to determine if the user wants to:
-   `MEMORIZE`: Save information to the Knowledge Graph.
-   `QUERY`: Retrieve information.
-   `EXECUTE`: Run a complex task.

**Stream Methods**:
-   `executeQuery`: The main entry point. Accepts `{ query: string, attachedFile?: any }`.

**Dependencies**:
-   `GraphWorker`: For accessing long-term memory (SQLite + HNSW).
-   `LLMPlanner`: For generating execution plans.
-   `TaskExecutor`: For running the generated plan.

### 2.2. Universal Reader
**Path**: `src/agents/universal-reader/`

A specialized agent for parsing documents.

**Supported Formats**:
-   **PDF**: Uses `pdfjs-dist` (running in the worker).
-   **Text/Markdown**: Native parsing.
-   **Images**: (Planned) OCR via Tesseract.js.

### 2.3. Calculator
**Path**: `src/agents/calculator/`

A safe execution environment for mathematical operations.
-   **Security**: Uses `Function` constructor with strict sandboxing (no access to `window` or `document`).

---

## 3. Infrastructure

### 3.1. MessageBus
**Path**: `src/core/communication/MessageBus.ts`

The central hub for all communication.

**Managers**:
-   **RequestManager**: Handles request/response correlation (`messageId` -> `Promise`).
-   **StreamManager**: Handles streaming responses (SSE-like).
-   **DuplicateDetector**: Prevents processing the same message twice (idempotency).
-   **MessageRouter**: Routes messages to the correct worker or transport.

### 3.2. Transports
**Path**: `src/core/communication/transport/`

-   **BroadcastTransport**: Uses `BroadcastChannel` API. Zero-config, works between tabs.
-   **WebSocketTransport**: Connects to a relay server. Enables cross-device communication.
-   **HybridTransport**: Composes both. Prefers Broadcast for local, falls back to WebSocket.

---

## 4. UI System

### 4.1. Observatory
**Path**: `src/ui/observatory/`

A monitoring dashboard for the internal state of Kensho.
-   **LogStream**: Real-time view of MessageBus traffic.
-   **MetricsView**: Charts for memory, latency, and throughput.
-   **NetworkTopology**: Visualizes connected nodes (Leader, Followers).

### 4.2. Chat Interface
**Path**: `src/components/chat/`

The main user interface.
-   **Virtualization**: Uses `react-window` for efficient rendering of long conversations.
-   **Streaming**: Renders markdown tokens in real-time as they arrive from the LLM.

---

---

## 5. Server Components (Optional)

### 5.1. Relay Server
**Path**: `server/relay.js` (Basic) | `server/relay.secure.js` (Production)

The Relay Server enables **cross-device communication** via WebSocket.

#### Features
-   **Basic Relay** (`relay.js`):
    -   Simple WebSocket broadcast.
    -   No authentication.
    -   Good for local development.

-   **Secure Relay** (`relay.secure.js`):
    -   **JWT Authentication**: Clients must authenticate before connecting.
    -   **Rate Limiting**: 100 requests/minute per IP.
    -   **CORS**: Configured for specific origins.
    -   **Payload Validation**: Max 1MB per message.

#### Running the Relay
```bash
# Basic (port 3001)
node server/relay.js

# Secure (port 3001 with JWT)
JWT_SECRET="your-secret-key" node server/relay.secure.js
```

#### Protocol
-   **Connect**: Client sends JWT token in the `Authorization` header.
-   **Message Format**: Same as BroadcastChannel (KenshoMessage).
-   **Routing**: Server broadcasts to all connected clients except sender.

### 5.2. Deployment Options

#### Option A: Static Hosting (GitHub Pages, Vercel)
-   **Pros**: Free, CDN-backed, simple.
-   **Cons**: No relay server (BroadcastChannel only).
-   **Steps**: Run `npm run build`, deploy `dist/` folder.

#### Option B: Self-Hosted (VPS + Relay)
-   **Pros**: Full control, relay enabled.
-   **Cons**: Requires server maintenance.
-   **Stack**: Nginx (reverse proxy) + Node.js (relay) + PM2 (process manager).

#### Option C: Containers (Docker)
-   **Dockerfile**:
    ```dockerfile
    FROM node:18
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci
    COPY . .
    RUN npm run build
    EXPOSE 8080 3001
    CMD ["npm", "run", "relay"]
    ```

---

*For architectural context, see [ARCHITECTURE.md](./ARCHITECTURE.md).*
