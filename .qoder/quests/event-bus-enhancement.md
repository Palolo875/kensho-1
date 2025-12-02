# EventBus Enhancement Design Document

## 1. Introduction and Context

### 1.1 Problem Statement
The current implementation (SSEStreamer) has several critical issues that need to be addressed:
- Misleading naming that confuses it with HTTP Server-Sent Events (SSE)
- Missing unsubscribe mechanism leading to potential memory leaks
- Lack of advanced subscription features like wildcards and one-time events
- Absence of strict type safety
- No debugging capabilities or performance optimization for high-frequency events

### 11.2 Objectives
- Rename the component to accurately reflect its purpose as an EventBus
- Implement unsubscribe mechanism to prevent memory leaks
- Add wildcard and one-time event subscription capabilities
- Introduce strict TypeScript typing for event payloads
- Provide debugging tools for development
- Optimize performance for high-frequency event emission

## 2. Design Overview

### 2.1 Component Architecture
The enhanced EventBus will follow a publisher-subscriber pattern with the following key components:
- Event registry for managing listeners
- Typed event map for compile-time type checking
- Subscription management with cleanup functions
- Debugging and monitoring capabilities

### 2.2 Key Features
1. Strict TypeScript EventMap for type-safe event emission
2. Wildcard ('*') subscription for listening to all events
3. One-time event subscription with automatic cleanup
4. Unsubscribe mechanism to prevent memory leaks
5. Debug mode with event logging and statistics
6. Throttling/debouncing for high-frequency events

## 3. Detailed Design

### 3.1 Type Definitions
The EventBus will use a strict EventMap type definition to ensure type safety:

```typescript
export type EventMap = {
  TOKEN: { token: string };
  STATUS: { status: string; details?: string };
  COMPLETE: { response: string };
  ERROR: { message: string; name: string; stack?: string };
  // Additional event types as needed
};

export type Listener<T = any> = (payload: T) => void;
```

### 3.2 Core Methods

#### 3.2.1 Subscription Management
- `on<K extends keyof EventMap>(eventType: K | '*', listener: Listener<EventMap[K]>): () => void`
  - Subscribe to specific events or all events using wildcard
  - Returns cleanup function for unsubscribing

- `once<K extends keyof EventMap>(eventType: K, listener: Listener<EventMap[K]>): () => void`
  - Subscribe to an event only once
  - Automatically unsubscribes after first emission

- `off<K extends keyof EventMap>(eventType: K, listener: Listener<EventMap[K]>): void`
  - Manually unsubscribe a listener from an event

#### 3.2.2 Event Emission
- `emit<K extends keyof EventMap>(eventType: K, payload: EventMap[K]): void`
  - Emit an event with typed payload
  - Invokes all relevant listeners with error isolation
  - Notifies both specific event listeners and wildcard listeners

- `emitThrottled<K extends keyof EventMap>(eventType: K, payload: EventMap[K], delay: number = 50): void`
  - Emit events with throttling to optimize performance for high-frequency events
  - Buffers events within the delay period and emits them in batches
  - Particularly useful for high-frequency events like token streaming

#### 3.2.3 Helper Methods
- `streamToken(token: string): void`
  - Convenience method for emitting TOKEN events

- `streamStatus(status: string, details?: string): void`
  - Convenience method for emitting STATUS events

- `streamComplete(response: string): void`
  - Convenience method for emitting COMPLETE events

- `streamError(error: Error): void`
  - Convenience method for emitting ERROR events

#### 3.2.3 Debugging Tools
- `enableDebug(): void`
  - Enable debug mode to log all emitted events
  - Logs include event type, payload, and timestamp
  - Output directed to console for development monitoring

- `getStats(): { listenerCounts: Record<string, number>; totalListeners: number }`
  - Return statistics for monitoring listener counts and detecting memory leaks
  - Provides breakdown of listeners per event type
  - Tracks total active listeners for memory leak detection

### 3.3 Internal Structure
The EventBus will maintain:
- `listeners`: Map<keyof EventMap, Set<Listener>> - Map of event types to sets of listeners
- `wildcardListeners`: Set<Listener> - Set of listeners subscribed to all events
- `debugEnabled`: boolean - Flag to enable/disable debug logging
- `stats`: { listenerCounts: Record<string, number>, totalListeners: number } - Statistics for monitoring
- `throttleBuffers`: Map<keyof EventMap, EventMap[keyof EventMap][]> - Buffers for throttled events

## 4. Implementation Considerations

### 4.1 Memory Leak Prevention
- Using Set data structure for O(1) removal operations
- Providing explicit cleanup functions returned from subscription methods
- Automatic cleanup for one-time subscriptions
- Stats tracking to monitor listener counts and identify potential leaks
- WeakMap consideration for future enhancements to prevent leaks from orphaned listeners

### 4.2 Error Handling
- Isolated error handling for individual listeners
- Preventing one listener's error from affecting others
- Comprehensive error logging in debug mode
- Error boundaries to prevent crashes in listener callbacks
- Graceful degradation when non-critical listeners fail

### 4.3 Performance Optimization
- Throttling mechanism for high-frequency events with configurable delay
- Efficient data structures for listener management (Map and Set)
- Minimal overhead in production mode when debug is disabled
- Lazy initialization of throttle buffers only when needed
- Batch processing of throttled events to reduce UI updates

## 5. Migration Strategy

### 5.1 Breaking Changes
- Component renaming from SSEStreamer to EventBus
- Method signature changes to include unsubscribe functions
- Stricter type checking that may reveal existing type mismatches

### 5.2 Backward Compatibility
- Provide adapter/wrapper for existing usage patterns
- Deprecation warnings for old APIs
- Clear migration documentation

## 6. Testing Approach

### 6.1 Test Scenarios
1. Subscription and unsubscription functionality
2. Wildcard event handling
3. One-time event subscription
4. Type safety validation
5. Memory leak detection using stats API
6. Error isolation between listeners
7. Throttling behavior for high-frequency events
8. Debug mode functionality

### 6.2 Quality Metrics
- Zero memory leaks in component lifecycle tests
- Compile-time type checking for all event payloads
- Performance benchmarks for high-frequency event emission
- Complete code coverage for subscription management