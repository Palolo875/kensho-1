# ⚡ Quick Start - 5 Minutes

Get Kensho running in 5 minutes.

## 1. Installation

```bash
# Clone the repository
git clone https://github.com/your-org/kensho.git
cd kensho

# Install dependencies
bun install
```

## 2. Start Development

```bash
# Terminal 1: Start the app
bun run dev

# Open http://localhost:5000 in your browser
```

## 3. Create Your First Agent

Create `src/agents/HelloAgent.ts`:

```typescript
import { runAgent } from '../core/agent-system/defineAgent';

runAgent({
  name: 'HelloAgent',
  init: async (runtime) => {
    console.log('👋 HelloAgent is ready!');
    
    runtime.registerHandler('greet', async (payload: { name: string }) => {
      return `Hello ${payload.name}! 🎉`;
    });
  }
});
```

## 4. Use Your Agent

In any React component or main app:

```typescript
import { MessageBus } from './core/communication/MessageBus';

const bus = new MessageBus('App');

async function testAgent() {
  try {
    const response = await bus.request<string>(
      'HelloAgent',
      { name: 'Alice' },
      5000
    );
    console.log(response); // Output: Hello Alice! 🎉
  } catch (error) {
    console.error('Error:', error);
  }
}

testAgent();
```

## 5. Build Agent Bundles

```bash
bun run build:test-agents
# Creates: dist/test-agents/HelloAgent.agent.js
```

## 6. Next Steps

✅ **Agent Created** - You now have your first agent!

Explore more:
- **[Full Getting Started Guide](./GETTING_STARTED.md)** - More details
- **[Agent Development](./AGENT_DEVELOPMENT.md)** - Advanced patterns
- **[API Reference](./API_REFERENCE.md)** - All methods & options
- **[Communication Patterns](./COMMUNICATION_PATTERNS.md)** - RPC, Streaming, etc.

---

## Common Tasks

### Run Tests
```bash
bun run test:e2e            # Browser E2E tests
bun run test:calculator     # Calculator agent tests
```

### Start Relay Server (for network agents)
```bash
bun run relay
# Listen to WebSocket at ws://localhost:8080
```

### Type Checking & Linting
```bash
bun run type-check
bun run lint
bun run quality  # All checks
```

---

**Need help?** Check [FAQ.md](./FAQ.md) or [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
