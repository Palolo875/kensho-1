# EventBus Implementation

## Overview

This directory contains the enhanced EventBus implementation that replaces the previous SSEStreamer. The new EventBus provides:

1. **Strict TypeScript Typing** - Type-safe event emission with defined EventMap
2. **Wildcard Subscriptions** - Listen to all events with the `*` wildcard
3. **One-time Subscriptions** - Automatically unsubscribe after first event
4. **Memory Leak Prevention** - Proper unsubscribe mechanism with cleanup functions
5. **Debugging Tools** - Statistics and debug logging capabilities
6. **Performance Optimization** - Throttling for high-frequency events
7. **Backward Compatibility** - Compatibility layer for existing SSEStreamer API

## Components

### EventBus.ts
The main implementation with all the new features:
- Strictly typed event system
- Wildcard and one-time subscriptions
- Throttling for high-frequency events
- Debug mode and statistics
- Convenience methods for common events

### SSEStreamerCompat.ts
Compatibility layer that maintains the old SSEStreamer API while using the new EventBus internally:
- Drop-in replacement for existing code
- Maps old event types to new ones
- Maintains backward compatibility

### verify.ts
Simple verification script to test the implementation:
- Tests all major features
- Verifies functionality without complex test frameworks

## Usage

### New EventBus API (Recommended)

```typescript
import { eventBus } from './eventbus/EventBus';

// Subscribe to specific events
const unsubscribe = eventBus.on('TOKEN', (payload) => {
  console.log('Received token:', payload.token);
});

// Subscribe to all events (wildcard)
eventBus.on('*', (payload) => {
  console.log('Received event:', payload);
});

// One-time subscription
eventBus.once('COMPLETE', (payload) => {
  console.log('Task completed:', payload.response);
});

// Emit events
eventBus.emit('TOKEN', { token: 'Hello world!' });

// Use convenience methods
eventBus.streamToken('Hello world!');
eventBus.streamComplete('Task finished!');
eventBus.streamError(new Error('Something went wrong'));

// Enable debug mode
eventBus.enableDebug();

// Get statistics
const stats = eventBus.getStats();
console.log('Active listeners:', stats.totalListeners);

// Clean up
unsubscribe();
```

### Legacy SSEStreamer API (Backward Compatible)

```typescript
import { sseStreamer } from './eventbus/SSEStreamerCompat';

// Existing code continues to work without changes
sseStreamer.streamInfo('Loading model...');
sseStreamer.streamError(new Error('Failed to load'));

// Subscribe as before
const listener = (event) => {
  if (event.type === 'token') {
    console.log('Token:', event.data);
  }
};
sseStreamer.subscribe(listener);
```

## Migration Guide

1. **New Projects** - Use the EventBus directly from [EventBus.ts](EventBus.ts)
2. **Existing Projects** - Replace imports from `../core/streaming/SSEStreamer` to `../core/eventbus/SSEStreamerCompat`
3. **Gradual Migration** - Update to the new API when convenient for better type safety and features

## Features Comparison

| Feature | Old SSEStreamer | New EventBus |
|---------|-----------------|--------------|
| Type Safety | ❌ | ✅ |
| Unsubscribe | ✅ | ✅ |
| Wildcard Events | ❌ | ✅ |
| One-time Events | ❌ | ✅ |
| Debug Mode | ❌ | ✅ |
| Statistics | ❌ | ✅ |
| Throttling | ❌ | ✅ |
| Error Isolation | ✅ | ✅ |

## Testing

Run the verification script to test the implementation:

```bash
npx tsx src/core/eventbus/verify.ts
```