# 🛠️ Agent Development Guide

Complete guide for building custom agents in Kensho.

## What is an Agent?

An agent is an autonomous unit that:
- Runs in its own Web Worker (true parallelism)
- Communicates via MessageBus (decoupled)
- Registers handlers for specific actions
- Maintains optional state
- Can persist to IndexedDB

## Agent Lifecycle

```
defineAgent/runAgent()
        ↓
   Worker Created
        ↓
    init() called
        ↓
  Handlers Registered
        ↓
    Ready for Messages
        ↓
  Process Requests
        ↓
     stop() called
        ↓
   Cleanup & Terminate
```

## Basic Agent Structure

### Minimal Agent

Create `src/agents/MyAgent/index.ts`:

```typescript
import { runAgent } from '../../core/agent-system/defineAgent';

runAgent({
  name: 'MyAgent',
  
  init: async (runtime) => {
    console.log('🤖 MyAgent initialized');
    
    // Register a handler
    runtime.registerHandler('myAction', async (payload) => {
      return { result: 'processed' };
    });
  }
});
```

### Using the Agent

```typescript
import { MessageBus } from './core/communication/MessageBus';

const bus = new MessageBus('App');

// Call the agent
const response = await bus.request('MyAgent', {}, 5000);
console.log(response);
```

## Handler Types

### 1. Simple Handler

```typescript
runtime.registerHandler('simple', async (payload) => {
  return { message: 'Hello' };
});

// Call
const result = await messageBus.request('MyAgent', { action: 'simple' });
```

### 2. Handler with Payload Validation

```typescript
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number()
});

runtime.registerHandler('validate', async (payload) => {
  const validated = schema.parse(payload);
  return { valid: true, data: validated };
});
```

### 3. Streaming Handler

```typescript
runtime.registerHandler('stream', async (payload, sender, streamId) => {
  if (!streamId) {
    throw new Error('This handler requires streaming');
  }

  // Send chunks
  for (let i = 0; i < 10; i++) {
    await runtime.sendStreamChunk(streamId, {
      progress: i * 10,
      message: `Processing... ${i * 10}%`
    });
    await new Promise(r => setTimeout(r, 100));
  }

  // Send completion
  await runtime.sendStreamEnd(streamId, { 
    status: 'complete',
    total: 10 
  });
});
```

### 4. Async Handler with Error Handling

```typescript
runtime.registerHandler('async', async (payload) => {
  try {
    // Long-running operation
    const result = await fetchFromAPI(payload);
    return result;
  } catch (error) {
    runtime.log('error', `Handler failed: ${error.message}`);
    throw error; // Propagates to caller
  }
});
```

## State Management

### Persisting Agent State

```typescript
runAgent({
  name: 'StatefulAgent',
  
  init: async (runtime) => {
    // Load state
    const state = await runtime.loadState();
    let counter = state?.counter ?? 0;
    
    runtime.registerHandler('increment', async (payload) => {
      counter++;
      
      // Save state
      await runtime.saveState({ counter });
      
      return { counter };
    });
  }
});
```

### State Format

```typescript
interface AgentState {
  [key: string]: any;
}

// Save
await runtime.saveState({ 
  counter: 5, 
  users: ['alice', 'bob'],
  config: { theme: 'dark' }
});

// Load
const state = await runtime.loadState();
```

## Logging

### Built-in Logging

```typescript
runtime.log('info', 'Agent started');
runtime.log('warn', 'Deprecated action called');
runtime.log('error', 'Operation failed');
runtime.log('debug', 'Internal state:', { value: 123 });
```

**Log Levels**:
- `debug` - Detailed diagnostic info
- `info` - General information
- `warn` - Warning messages
- `error` - Error messages

Logs are:
- Sent to Telemetry Agent
- Stored in IndexedDB
- Visible in Observatory UI

## Building for Production

### 1. Create Agent File

```typescript
// src/agents/ProdAgent/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';

runAgent({
  name: 'ProductionAgent',
  init: async (runtime) => {
    // ... implementation
  }
});
```

### 2. Update Build Config

In `vite.config.ts`, add to the test-agents mode:

```typescript
rollupOptions.input = {
  'prod-agent': resolve(__dirname, 'src/agents/ProdAgent/index.ts'),
  // ... other agents
};
```

### 3. Build

```bash
bun run build:test-agents
# Creates: dist/test-agents/prod-agent.agent.js
```

### 4. Use

```typescript
// Agent is automatically loaded as Web Worker
const bus = new MessageBus('App');
const result = await bus.request('ProductionAgent', payload);
```

## Advanced Patterns

### 1. Multi-Handler Agent

```typescript
runAgent({
  name: 'MultiHandler',
  
  init: async (runtime) => {
    runtime.registerHandler('action1', async (payload) => {
      return doAction1(payload);
    });
    
    runtime.registerHandler('action2', async (payload) => {
      return doAction2(payload);
    });
    
    runtime.registerHandler('action3', async (payload) => {
      return doAction3(payload);
    });
  }
});

// Usage
await bus.request('MultiHandler', { action: 'action1' }, 5000);
await bus.request('MultiHandler', { action: 'action2' }, 5000);
```

### 2. Agent-to-Agent Communication

```typescript
runAgent({
  name: 'CordinatorAgent',
  
  init: async (runtime) => {
    runtime.registerHandler('orchestrate', async (payload) => {
      // Call another agent
      const result1 = await runtime.messageBus.request(
        'AgentA', 
        { data: 'value' },
        5000
      );
      
      // Use result in another call
      const result2 = await runtime.messageBus.request(
        'AgentB',
        { input: result1 },
        5000
      );
      
      return result2;
    });
  }
});
```

### 3. Long-Running Tasks

```typescript
runAgent({
  name: 'LongRunningAgent',
  
  init: async (runtime) => {
    runtime.registerHandler('process', async (payload, sender, streamId) => {
      const batchSize = 100;
      const totalBatches = 10;
      
      for (let batch = 0; batch < totalBatches; batch++) {
        // Process batch
        const result = processBatch(batch, batchSize);
        
        // Stream progress
        if (streamId) {
          await runtime.sendStreamChunk(streamId, {
            batch,
            progress: ((batch + 1) / totalBatches) * 100,
            result
          });
        }
        
        // Simulate work
        await new Promise(r => setTimeout(r, 500));
      }
      
      if (streamId) {
        await runtime.sendStreamEnd(streamId, { status: 'complete' });
      }
      
      return { processed: true };
    });
  }
});
```

### 4. Conditional Handler

```typescript
runAgent({
  name: 'SmartAgent',
  
  init: async (runtime) => {
    runtime.registerHandler('conditional', async (payload) => {
      if (payload.type === 'fast') {
        return { result: quickOperation() };
      } else if (payload.type === 'slow') {
        return { result: await slowOperation() };
      } else {
        throw new Error(`Unknown type: ${payload.type}`);
      }
    });
  }
});
```

## Testing Agents

### Manual Testing

Create `tests/agents/MyAgent.manual.ts`:

```typescript
import { MessageBus } from '../../src/core/communication/MessageBus';

async function testMyAgent() {
  const bus = new MessageBus('Test');
  
  console.log('Testing MyAgent...');
  
  // Test 1
  try {
    const result = await bus.request('MyAgent', { test: 1 }, 5000);
    console.log('✅ Test 1 passed:', result);
  } catch (error) {
    console.error('❌ Test 1 failed:', error);
  }
  
  // Test 2
  // ...
}

testMyAgent();
```

Run:
```bash
bun tests/agents/MyAgent.manual.ts
```

### E2E Testing

Create `tests/browser/MyAgent-e2e.html`:

```html
<html>
<head><title>MyAgent E2E</title></head>
<body>
  <script type="module">
    import { MessageBus } from '../../src/core/communication/MessageBus';
    
    async function test() {
      const bus = new MessageBus('E2E');
      const result = await bus.request('MyAgent', {}, 5000);
      console.log('Result:', result);
    }
    
    test();
  </script>
</body>
</html>
```

## Best Practices

### ✅ Do's
- Keep handlers focused and single-purpose
- Use streaming for long-running operations
- Persist important state
- Log errors and warnings
- Validate payloads
- Use TypeScript for type safety
- Test agents thoroughly
- Document handler signatures
- Handle timeouts gracefully
- Clean up resources in stop()

### ❌ Don'ts
- Don't share state between agents (use messages)
- Don't block the worker thread indefinitely
- Don't throw errors without logging
- Don't trust external payloads (validate!)
- Don't create agents dynamically (define at build time)
- Don't use localStorage (use IndexedDB)
- Don't synchronous infinite loops

## Troubleshooting

### Agent Not Responding
- Check agent is registered: `console.log('Agent initialized')`
- Verify handler name matches
- Check timeout duration
- Review browser console for errors

### Memory Leaks
- Clear intervals/timeouts in cleanup
- Unsubscribe from channels
- Don't hold references to large objects

### Slow Performance
- Use streaming for large responses
- Batch operations
- Profile with DevTools

---

See also:
- [COMMUNICATION_PATTERNS.md](./COMMUNICATION_PATTERNS.md) - Message patterns
- [API_REFERENCE.md](./API_REFERENCE.md) - Runtime API
- [EXAMPLES_BASIC.md](./EXAMPLES_BASIC.md) - Code examples
