# @kensho/multi-agent-orchestration

Distributed multi-agent orchestration framework for browser-based AI systems with WebGPU-powered LLMs.

## Features

- **Multi-Agent Orchestration**: Debate system (Optimist/Critic/MetaCritic) with meta-critique validation
- **Browser-Native**: Runs entirely in the browser using Web Workers and WebGPU
- **Isomorphic Design**: Works in both Node.js and browser environments
- **Real-time Streaming**: Event-driven architecture with SSE streamer
- **Production-Ready**: VRAM management, response caching, graceful degradation

## Installation

```bash
npm install @kensho/multi-agent-orchestration
```

## Quick Start

```typescript
import { AgentRuntime } from '@kensho/multi-agent-orchestration';

// Create agent runtime
const runtime = new AgentRuntime('agent-1');

// Register methods
runtime.registerMethod('echo', async (msg: string) => msg);

// Use in your application
const result = await runtime.callAgent('echo', ['Hello']);
```

## Architecture

- **Kernel**: Task execution, memory management, response caching
- **Agents**: LLM, OIE, Graph, Embedding agents
- **Communication**: MessageBus, WebSocket transport, SSE streaming
- **Utilities**: Logging, VRAM tracking, performance metrics

## Documentation

See the main Kensho repository for detailed documentation.

## License

MIT
