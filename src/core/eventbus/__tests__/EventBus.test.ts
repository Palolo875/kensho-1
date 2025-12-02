// src/core/eventbus/EventBus.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from './EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should subscribe and emit events', () => {
    const listener = vi.fn();
    eventBus.on('TOKEN', listener);
    
    const payload = { token: 'test-token' };
    eventBus.emit('TOKEN', payload);
    
    expect(listener).toHaveBeenCalledWith(payload);
  });

  it('should support wildcard subscriptions', () => {
    const wildcardListener = vi.fn();
    eventBus.on('*', wildcardListener);
    
    const payload = { token: 'test-token' };
    eventBus.emit('TOKEN', payload);
    
    expect(wildcardListener).toHaveBeenCalledWith({ type: 'TOKEN', payload });
  });

  it('should support one-time subscriptions', () => {
    const listener = vi.fn();
    const unsubscribe = eventBus.once('TOKEN', listener);
    
    const payload1 = { token: 'first-token' };
    const payload2 = { token: 'second-token' };
    
    eventBus.emit('TOKEN', payload1);
    eventBus.emit('TOKEN', payload2);
    
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(payload1);
    
    // Verify the listener is automatically unsubscribed
    unsubscribe(); // This should not cause any issues
  });

  it('should support manual unsubscription', () => {
    const listener = vi.fn();
    const unsubscribe = eventBus.on('TOKEN', listener);
    
    const payload1 = { token: 'first-token' };
    const payload2 = { token: 'second-token' };
    
    eventBus.emit('TOKEN', payload1);
    unsubscribe();
    eventBus.emit('TOKEN', payload2);
    
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(payload1);
  });

  it('should provide statistics', () => {
    const initialStats = eventBus.getStats();
    expect(initialStats.totalListeners).toBe(0);
    
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    
    eventBus.on('TOKEN', listener1);
    eventBus.on('STATUS', listener2);
    eventBus.on('*', listener1); // Wildcard listener
    
    const statsAfterAdd = eventBus.getStats();
    expect(statsAfterAdd.totalListeners).toBe(3);
    expect(statsAfterAdd.listenerCounts.TOKEN).toBe(1);
    expect(statsAfterAdd.listenerCounts.STATUS).toBe(1);
    expect(statsAfterAdd.listenerCounts.WILDCARD).toBe(1);
    
    eventBus.off('TOKEN', listener1);
    
    const statsAfterRemove = eventBus.getStats();
    expect(statsAfterRemove.totalListeners).toBe(2);
    expect(statsAfterRemove.listenerCounts.TOKEN).toBeUndefined();
    expect(statsAfterRemove.listenerCounts.STATUS).toBe(1);
    expect(statsAfterRemove.listenerCounts.WILDCARD).toBe(1);
  });

  it('should handle errors in listeners gracefully', () => {
    const failingListener = vi.fn(() => { throw new Error('Test error'); });
    const workingListener = vi.fn();
    
    eventBus.on('TOKEN', failingListener);
    eventBus.on('TOKEN', workingListener);
    
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const payload = { token: 'test-token' };
    eventBus.emit('TOKEN', payload);
    
    expect(failingListener).toHaveBeenCalledWith(payload);
    expect(workingListener).toHaveBeenCalledWith(payload);
    expect(consoleErrorSpy).toHaveBeenCalled();
    
    consoleErrorSpy.mockRestore();
  });

  it('should support convenience methods', () => {
    const tokenListener = vi.fn();
    const statusListener = vi.fn();
    const completeListener = vi.fn();
    const errorListener = vi.fn();
    const infoListener = vi.fn();
    const metricsListener = vi.fn();
    
    eventBus.on('TOKEN', tokenListener);
    eventBus.on('STATUS', statusListener);
    eventBus.on('COMPLETE', completeListener);
    eventBus.on('ERROR', errorListener);
    eventBus.on('INFO', infoListener);
    eventBus.on('METRICS', metricsListener);
    
    eventBus.streamToken('test-token');
    eventBus.streamStatus('running', 'details');
    eventBus.streamComplete('final response');
    eventBus.streamError(new Error('test error'));
    eventBus.streamInfo('info message');
    eventBus.updateMetrics(100, 50);
    
    expect(tokenListener).toHaveBeenCalledWith({ token: 'test-token' });
    expect(statusListener).toHaveBeenCalledWith({ status: 'running', details: 'details' });
    expect(completeListener).toHaveBeenCalledWith({ response: 'final response' });
    expect(errorListener).toHaveBeenCalledWith({ 
      message: 'test error', 
      name: 'Error', 
      stack: expect.any(String) 
    });
    expect(infoListener).toHaveBeenCalledWith({ message: 'info message' });
    expect(metricsListener).toHaveBeenCalledWith({ ttft: 100, tokensPerSec: 50 });
  });

  it('should support throttled emissions', new Promise((resolve) => {
    const listener = vi.fn();
    eventBus.on('TOKEN', listener);
    
    // Emit multiple events rapidly
    eventBus.emitThrottled('TOKEN', { token: 'token1' });
    eventBus.emitThrottled('TOKEN', { token: 'token2' });
    eventBus.emitThrottled('TOKEN', { token: 'token3' });
    
    // Initially, no events should be emitted
    expect(listener).not.toHaveBeenCalled();
    
    // After the throttle delay, all events should be emitted
    setTimeout(() => {
      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, { token: 'token1' });
      expect(listener).toHaveBeenNthCalledWith(2, { token: 'token2' });
      expect(listener).toHaveBeenNthCalledWith(3, { token: 'token3' });
      resolve(null);
    }, 100); // Default throttle delay is 50ms
  }));

  it('should support debug mode', () => {
    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    
    eventBus.enableDebug();
    eventBus.emit('TOKEN', { token: 'test-token' });
    
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      'Emitting event: TOKEN',
      { eventType: 'TOKEN', payload: { token: 'test-token' } }
    );
    
    eventBus.disableDebug();
    eventBus.emit('TOKEN', { token: 'another-token' });
    
    // No additional debug logs should be called
    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    
    consoleDebugSpy.mockRestore();
  });
});