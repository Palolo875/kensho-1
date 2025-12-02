import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useWorkersStore } from '../useWorkersStore';

describe('useWorkersStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    useWorkersStore.setState({
      workers: {},
      workersReady: {},
      workerStatus: {},
    });
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useWorkersStore());
    
    expect(result.current.workers).toEqual({});
    expect(result.current.workersReady).toEqual({});
    expect(result.current.workerStatus).toEqual({});
  });

  it('should register workers', () => {
    const { result } = renderHook(() => useWorkersStore());
    const mockWorker = { postMessage: () => {} } as any;
    const workerType = 'llm';
    
    act(() => {
      result.current.registerWorker(workerType, mockWorker);
    });
    
    expect(result.current.workers[workerType]).toBe(mockWorker);
  });

  it('should set worker ready status', () => {
    const { result } = renderHook(() => useWorkersStore());
    const workerType = 'llm';
    
    act(() => {
      result.current.setWorkerReady(workerType, true);
    });
    
    expect(result.current.workersReady[workerType]).toBe(true);
    
    act(() => {
      result.current.setWorkerReady(workerType, false);
    });
    
    expect(result.current.workersReady[workerType]).toBe(false);
  });

  it('should set worker status', () => {
    const { result } = renderHook(() => useWorkersStore());
    const workerType = 'llm';
    const status = { status: 'running', progress: 50 };
    
    act(() => {
      result.current.setWorkerStatus(workerType, status);
    });
    
    expect(result.current.workerStatus[workerType]).toEqual(status);
  });

  it('should get worker by type', () => {
    const { result } = renderHook(() => useWorkersStore());
    const mockWorker = { postMessage: () => {} } as any;
    const workerType = 'llm';
    
    act(() => {
      result.current.registerWorker(workerType, mockWorker);
    });
    
    const worker = result.current.getWorker(workerType);
    expect(worker).toBe(mockWorker);
  });

  it('should return undefined for non-existent workers', () => {
    const { result } = renderHook(() => useWorkersStore());
    const worker = result.current.getWorker('nonexistent');
    expect(worker).toBeUndefined();
  });

  it('should check if worker is ready', () => {
    const { result } = renderHook(() => useWorkersStore());
    const workerType = 'llm';
    
    expect(result.current.isWorkerReady(workerType)).toBe(false);
    
    act(() => {
      result.current.setWorkerReady(workerType, true);
    });
    
    expect(result.current.isWorkerReady(workerType)).toBe(true);
  });
});