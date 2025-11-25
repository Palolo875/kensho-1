# 🛠️ Kensho Developer Guide

> **Practice & Workflow**

This guide is for developers who want to build, debug, and maintain Kensho. It covers setup, workflows, and common tasks.

---

---

## 1. Technology Stack & Dependencies

### 1.1. Core Dependencies

#### AI & Machine Learning
-   **@mlc-ai/web-llm** (0.2.79): WebGPU-powered LLM runtime. Runs Phi-3, Qwen, Gemma models locally.
-   **@xenova/transformers** (2.17.2): For generating text embeddings (RAG system).

#### Data Management
-   **sql.js** (1.13.0): SQLite compiled to WebAssembly for the Knowledge Graph.
-   **hnswlib-wasm** (0.8.2): Vector similarity search (HNSW algorithm).
-   **IndexedDB**: Native browser API for large data persistence.

#### UI Framework
-   **React** (18.3.1) + **React DOM**: Core UI library.
-   **@radix-ui/**: 25+ headless UI components (dialog, dropdown, toast, etc.).
-   **Tailwind CSS** (3.4.17): Utility-first styling.
-   **shadcn/ui**: Pre-built component library built on Radix.

#### Utilities
-   **zod** (3.25.76): Runtime type validation for messages.
-   **mathjs** (15.1.0): Safe math expression evaluation (CalculatorAgent).
-   **pdfjs-dist** (5.4.394): PDF parsing in UniversalReaderAgent.
-   **lru-cache** (11.2.2): Response caching.
-   **uuid** (13.0.0): Unique ID generation for messages.

### 1.2. Project Structure
```
kensho-1/
├── src/                  # Source code
│   ├── agents/          # Agent implementations
│   ├── components/      # React UI components
│   ├── core/            # Kernel, MessageBus, Storage
│   ├── hooks/           # React hooks
│   ├── lib/             # Utilities (logger, formatters)
│   └── stores/          # Zustand state management
├── server/              # Relay server (WebSocket)
│   ├── relay.js         # Basic relay
│   ├── relay.secure.js  # JWT-protected relay
│   └── middleware/      # Rate limiting, auth
├── tests/               # Unit & E2E tests
│   ├── browser/         # Browser-based E2E
│   └── integration/     # Integration tests
├── docs/                # Legacy documentation (76 files)
├── packages/            # npm package scaffolds
└── scripts/             # Build & demo scripts
```

---

## 2. Getting Started

### 1.1. Prerequisites
-   **Node.js**: v18 or higher.
-   **Browser**: Chrome/Edge 113+ (for WebGPU support).
-   **Git**: Basic knowledge.

### 1.2. Installation
```bash
# Clone the repository
git clone https://github.com/Palolo875/kensho-1.git
cd kensho-1

# Install dependencies
npm install
```

### 1.3. Running Locally
```bash
# Start the development server
npm run dev
```
Access the app at `http://localhost:8080`.

---

## 2. Development Workflow

### 2.1. Project Structure
```
src/
├── agents/         # Worker scripts for each agent
├── components/     # React UI components
├── core/           # Kernel, MessageBus, Storage
├── hooks/          # React hooks
├── lib/            # Utilities (logger, formatting)
└── types/          # TypeScript definitions
```

### 2.2. Adding a New Agent
To create a new agent (e.g., `WeatherAgent`):

1.  **Create Directory**: `src/agents/weather/`
2.  **Implement Worker**: Create `worker.ts`.
    ```typescript
    import { BaseAgent } from '@/core/agents/BaseAgent';
    
    class WeatherAgent extends BaseAgent {
      async handleRequest(payload) {
        return { temp: 25, condition: 'Sunny' };
      }
    }
    new WeatherAgent();
    ```
3.  **Register**: Add to `src/agents/index.ts`.
4.  **Manifest**: Define capabilities in `manifest.ts`.

### 2.3. Using the Logger
Stop using `console.log`. Use the structured logger:
```typescript
import { createLogger } from '@/lib/logger';
const log = createLogger('MyComponent');

log.info('System initialized', { mode: 'dev' });
log.error('Connection failed', error);
```

---

## 3. Debugging Masterclass

### 3.1. Debugging Workers
Workers run in separate threads. To debug them in Chrome DevTools:
1.  Open DevTools (F12).
2.  Go to the **Sources** tab.
3.  Look for the **Threads** section on the right.
4.  Select the worker you want to inspect (e.g., `llm-worker`).

### 3.2. Tracing Messages
The **Observatory** is your best friend.
-   Go to `Settings > Observatory`.
-   You will see a real-time log of all messages passing through the Bus.
-   Filter by `source`, `target`, or `type`.

### 3.3. Common Issues & Fixes

#### "OIEAgent not ready after initialization timeout"
-   **Symptom**: The OIE rejects requests immediately after startup.
-   **Cause**: The `GraphWorker` (SQLite/HNSW) is taking too long to initialize.
-   **Fix**: Check the `GraphWorker` console logs. It might be rebuilding the vector index. Increase the retry limit in `src/agents/oie/index.ts` if your device is slow.

#### "VRAM Insufficient" / "Model load rejected"
-   **Symptom**: Models refuse to load even if you think you have space.
-   **Cause**: `MemoryManager` detected a lower limit via WebGPU or you are in a non-GPU environment (Node.js) where it defaults to 2GB.
-   **Fix**:
    1.  Check `chrome://gpu` to ensure hardware acceleration is enabled.
    2.  Open DevTools console and look for `[MemoryManager] 🎮 GPU détecté`.
    3.  If testing in Node, mock the `navigator.gpu` object.

#### "Network Offline" events firing randomly
-   **Symptom**: The UI flashes "Offline" mode.
-   **Cause**: The `ResourceManager` uses `navigator.connection.rtt` which can fluctuate.
-   **Fix**: Adjust the sensitivity in `src/core/kernel/ResourceManager.ts` (currently checks every 500ms).

---

## 4. Testing Strategy

### 4.1. Unit Tests
Run tests for individual components (Managers, Utils).
```bash
npm run test:unit
```

### 4.2. E2E Tests
Run browser-based scenarios.
```bash
npm run test:e2e
```
*Note: Requires a graphical environment.*

### 4.3. Chaos Monkey
Test system resilience by randomly killing agents.
1.  Open the app with `?chaos=true`.
2.  Watch the logs to see if the system recovers (OrionGuardian should restart agents).

---

## 5. Deployment

### 5.1. Production Build
```bash
npm run build
```
This creates a `dist/` folder optimized for production.

### 5.2. Preview
```bash
npm run preview
```
Runs the production build locally.

---

## 6. Maintenance

### 6.1. Updating Dependencies
```bash
npm update
```
*Caution*: Check `package.json` for breaking changes, especially with `@mlc-ai/web-llm`.

### 6.2. Code Quality
Run the linter before pushing:
```bash
npm run lint
npm run type-check
```

---

*For architectural details, see [ARCHITECTURE.md](./ARCHITECTURE.md).*
