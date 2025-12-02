// src/core/eventbus/EventBus.ts

import { createLogger } from '../../lib/logger';

const log = createLogger('EventBus');

/**
 * Strictly typed event map defining all possible events and their payloads
 */
export type EventMap = {
  TOKEN: { token: string };
  STATUS: { status: string; details?: string };
  COMPLETE: { response: string };
  ERROR: { message: string; name: string; stack?: string };
  METRICS: { ttft?: number; tokensPerSec?: number };
  INFO: { message: string };
};

export type Listener<T = any> = (payload: T) => void;

/**
 * Enhanced EventBus with strict typing, wildcard support, and debugging capabilities.
 * Replaces the previous SSEStreamer implementation with a more robust event system.
 */
export class EventBus {
  private listeners = new Map<keyof EventMap, Set<Listener>>();
  private wildcardListeners = new Set<Listener>();
  private debugEnabled = false;
  private stats = {
    listenerCounts: {} as Record<string, number>,
    totalListeners: 0
  };
  private throttleBuffers = new Map<keyof EventMap, EventMap[keyof EventMap][]>();
  private throttleTimers = new Map<keyof EventMap, NodeJS.Timeout>();

  constructor() {
    log.info('Intialized EventBus v2.0');
  }

  /**
   * Subscribe to specific events or all events using wildcard '*'
   * @param eventType The event type to subscribe to, or '*' for all events
   * @param listener The callback function to execute when the event is emitted
   * @returns A cleanup function to unsubscribe the listener
   */
  public on<K extends keyof EventMap>(eventType: K | '*', listener: Listener<EventMap[K]>): () => void {
    if (eventType === '*') {
      this.wildcardListeners.add(listener);
      this.updateStats('WILDCARD', 1);
    } else {
      if (!this.listeners.has(eventType)) {
        this.listeners.set(eventType, new Set());
      }
      this.listeners.get(eventType)!.add(listener);
      this.updateStats(eventType, 1);
    }

    // Return cleanup function
    return () => {
      this.off(eventType, listener);
    };
  }

  /**
   * Subscribe to an event only once
   * @param eventType The event type to subscribe to
   * @param listener The callback function to execute when the event is emitted
   * @returns A cleanup function to unsubscribe the listener (if not already executed)
   */
  public once<K extends keyof EventMap>(eventType: K, listener: Listener<EventMap[K]>): () => void {
    const onceListener = (payload: EventMap[K]) => {
      listener(payload);
      this.off(eventType, onceListener);
    };

    return this.on(eventType, onceListener);
  }

  /**
   * Unsubscribe a listener from an event
   * @param eventType The event type to unsubscribe from
   * @param listener The callback function to remove
   */
  public off<K extends keyof EventMap>(eventType: K | '*', listener: Listener<EventMap[K]>): void {
    if (eventType === '*') {
      this.wildcardListeners.delete(listener);
      this.updateStats('WILDCARD', -1);
    } else {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.delete(listener);
        this.updateStats(eventType, -1);
        
        // Clean up empty listener sets
        if (listeners.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    }
  }

  /**
   * Emit an event with typed payload
   * @param eventType The type of event to emit
   * @param payload The data to send with the event
   */
  public emit<K extends keyof EventMap>(eventType: K, payload: EventMap[K]): void {
    if (this.debugEnabled) {
      log.debug(`Emitting event: ${eventType}`, { eventType, payload });
    }

    // Notify specific event listeners
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(payload);
        } catch (error) {
          log.error(`Error in listener for event ${eventType}:`, error);
        }
      });
    }

    // Notify wildcard listeners
    this.wildcardListeners.forEach(listener => {
      try {
        listener({ type: eventType, payload });
      } catch (error) {
        log.error(`Error in wildcard listener for event ${eventType}:`, error);
      }
    });
  }

  /**
   * Emit events with throttling to optimize performance for high-frequency events
   * @param eventType The type of event to emit
   * @param payload The data to send with the event
   * @param delay The throttling delay in milliseconds (default: 50ms)
   */
  public emitThrottled<K extends keyof EventMap>(eventType: K, payload: EventMap[K], delay: number = 50): void {
    if (!this.throttleBuffers.has(eventType)) {
      this.throttleBuffers.set(eventType, []);
    }

    // Add payload to buffer
    this.throttleBuffers.get(eventType)!.push(payload);

    // Clear existing timer if present
    if (this.throttleTimers.has(eventType)) {
      clearTimeout(this.throttleTimers.get(eventType)!);
    }

    // Set new timer
    const timer = setTimeout(() => {
      const buffer = this.throttleBuffers.get(eventType) || [];
      if (buffer.length > 0) {
        // Emit buffered events
        buffer.forEach(item => {
          this.emit(eventType, item as EventMap[K]);
        });
        
        // Clear buffer
        this.throttleBuffers.set(eventType, []);
      }
      
      // Clean up timer reference
      this.throttleTimers.delete(eventType);
    }, delay);

    this.throttleTimers.set(eventType, timer);
  }

  /**
   * Convenience method for emitting TOKEN events
   * @param token The token to emit
   */
  public streamToken(token: string): void {
    this.emit('TOKEN', { token });
  }

  /**
   * Convenience method for emitting STATUS events
   * @param status The status message
   * @param details Optional details
   */
  public streamStatus(status: string, details?: string): void {
    this.emit('STATUS', { status, details });
  }

  /**
   * Convenience method for emitting COMPLETE events
   * @param response The final response
   */
  public streamComplete(response: string): void {
    this.emit('COMPLETE', { response });
  }

  /**
   * Convenience method for emitting ERROR events
   * @param error The error object
   */
  public streamError(error: Error): void {
    this.emit('ERROR', { 
      message: error.message, 
      name: error.name, 
      stack: error.stack 
    });
  }

  /**
   * Convenience method for emitting METRICS events
   * @param ttft Time to first token
   * @param tokensPerSec Tokens per second
   */
  public updateMetrics(ttft?: number, tokensPerSec?: number): void {
    this.emit('METRICS', { ttft, tokensPerSec });
  }

  /**
   * Convenience method for emitting INFO events
   * @param message The info message
   */
  public streamInfo(message: string): void {
    this.emit('INFO', { message });
  }

  /**
   * Enable debug mode to log all emitted events
   */
  public enableDebug(): void {
    this.debugEnabled = true;
    log.info('Debug mode enabled');
  }

  /**
   * Disable debug mode
   */
  public disableDebug(): void {
    this.debugEnabled = false;
    log.info('Debug mode disabled');
  }

  /**
   * Return statistics for monitoring listener counts and detecting memory leaks
   */
  public getStats(): { listenerCounts: Record<string, number>; totalListeners: number } {
    return { ...this.stats };
  }

  /**
   * Update internal statistics
   * @param eventType The event type
   * @param delta The change in listener count (+1 for add, -1 for remove)
   */
  private updateStats(eventType: string, delta: number): void {
    const currentCount = this.stats.listenerCounts[eventType] || 0;
    this.stats.listenerCounts[eventType] = currentCount + delta;
    this.stats.totalListeners += delta;
    
    if (this.stats.listenerCounts[eventType] <= 0) {
      delete this.stats.listenerCounts[eventType];
    }
  }

  /**
   * Clear all metrics buffers
   */
  public clearMetrics(): void {
    // Note: In the new implementation, we don't maintain a separate metrics buffer
    // since metrics are emitted directly. This method is kept for backward compatibility.
  }
}

// Export singleton instance
export const eventBus = new EventBus();