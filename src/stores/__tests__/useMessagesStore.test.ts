import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMessagesStore } from '../useMessagesStore';

describe('useMessagesStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    useMessagesStore.setState({
      messages: [],
      isKenshoWriting: false,
      statusMessage: '',
      currentThoughtProcess: null,
    });
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useMessagesStore());
    
    expect(result.current.messages).toEqual([]);
    expect(result.current.isKenshoWriting).toBe(false);
    expect(result.current.statusMessage).toBe('');
    expect(result.current.currentThoughtProcess).toBeNull();
  });

  it('should add messages', () => {
    const { result } = renderHook(() => useMessagesStore());
    
    act(() => {
      result.current.addMessage({
        id: '1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      });
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual({
      id: '1',
      role: 'user',
      content: 'Hello',
      timestamp: expect.any(Number),
    });
  });

  it('should clear messages', () => {
    const { result } = renderHook(() => useMessagesStore());
    
    act(() => {
      result.current.addMessage({
        id: '1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      });
    });
    
    expect(result.current.messages).toHaveLength(1);
    
    act(() => {
      result.current.clearMessages();
    });
    
    expect(result.current.messages).toHaveLength(0);
  });

  it('should set Kensho writing status', () => {
    const { result } = renderHook(() => useMessagesStore());
    
    act(() => {
      result.current.setKenshoWriting(true);
    });
    
    expect(result.current.isKenshoWriting).toBe(true);
    
    act(() => {
      result.current.setKenshoWriting(false);
    });
    
    expect(result.current.isKenshoWriting).toBe(false);
  });

  it('should set status message', () => {
    const { result } = renderHook(() => useMessagesStore());
    const testMessage = 'Processing your request...';
    
    act(() => {
      result.current.setStatusMessage(testMessage);
    });
    
    expect(result.current.statusMessage).toBe(testMessage);
  });

  it('should set current thought process', () => {
    const { result } = renderHook(() => useMessagesStore());
    const thoughtProcess = {
      type: 'reasoning',
      content: 'Analyzing the problem',
      timestamp: Date.now(),
    };
    
    act(() => {
      result.current.setCurrentThoughtProcess(thoughtProcess);
    });
    
    expect(result.current.currentThoughtProcess).toEqual(thoughtProcess);
  });
});