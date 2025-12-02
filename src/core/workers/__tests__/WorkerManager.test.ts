import { WorkerManager } from '../WorkerManager';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkerManager', () => {
  let workerManager: WorkerManager;

  beforeEach(() => {
    // Reset the singleton instance before each test
    (WorkerManager as any).instance = null;
    workerManager = WorkerManager.getInstance();
  });

  it('should be a singleton', () => {
    const instance1 = WorkerManager.getInstance();
    const instance2 = WorkerManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should register and retrieve workers', () => {
    const mockWorker = { postMessage: vi.fn() } as any;
    
    workerManager.registerWorker('testWorker', mockWorker);
    const retrievedWorker = workerManager.getWorker('testWorker');
    
    expect(retrievedWorker).toBe(mockWorker);
  });

  it('should return undefined for non-existent workers', () => {
    const worker = workerManager.getWorker('nonExistentWorker');
    expect(worker).toBeUndefined();
  });

  it('should return all registered workers', () => {
    const mockWorker1 = { postMessage: vi.fn() } as any;
    const mockWorker2 = { postMessage: vi.fn() } as any;
    
    workerManager.registerWorker('worker1', mockWorker1);
    workerManager.registerWorker('worker2', mockWorker2);
    
    const allWorkers = workerManager.getAllWorkers();
    expect(allWorkers).toEqual({
      worker1: mockWorker1,
      worker2: mockWorker2
    });
  });

  it('should unregister workers', () => {
    const mockWorker = { postMessage: vi.fn() } as any;
    
    workerManager.registerWorker('testWorker', mockWorker);
    expect(workerManager.getWorker('testWorker')).toBe(mockWorker);
    
    workerManager.unregisterWorker('testWorker');
    expect(workerManager.getWorker('testWorker')).toBeUndefined();
  });

  it('should terminate all workers', () => {
    const mockWorker1 = { postMessage: vi.fn(), terminate: vi.fn() } as any;
    const mockWorker2 = { postMessage: vi.fn(), terminate: vi.fn() } as any;
    
    workerManager.registerWorker('worker1', mockWorker1);
    workerManager.registerWorker('worker2', mockWorker2);
    
    workerManager.terminateAllWorkers();
    
    expect(mockWorker1.terminate).toHaveBeenCalled();
    expect(mockWorker2.terminate).toHaveBeenCalled();
  });

  it('should maintain backward compatibility with window.__kensho_workers', () => {
    const mockWorker = { postMessage: vi.fn() } as any;
    
    workerManager.registerWorker('testWorker', mockWorker);
    
    // Simulate window object
    const mockWindow = {} as any;
    (global as any).window = mockWindow;
    
    workerManager.registerWorker('anotherWorker', mockWorker);
    
    expect(mockWindow.__kensho_workers).toBeDefined();
    expect(mockWindow.__kensho_workers.testWorker).toBe(mockWorker);
    expect(mockWindow.__kensho_workers.anotherWorker).toBe(mockWorker);
    
    // Clean up
    delete (global as any).window;
  });
});