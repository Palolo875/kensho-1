import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelLoader } from '../ModelLoader';

describe('ModelLoader', () => {
  let modelLoader: ModelLoader;
  let mockProgressCallback: any;

  beforeEach(() => {
    mockProgressCallback = vi.fn();
    modelLoader = new ModelLoader(mockProgressCallback);
  });

  it('should initialize with correct properties', () => {
    expect(modelLoader).toBeInstanceOf(ModelLoader);
    expect((modelLoader as any).progressCallback).toBe(mockProgressCallback);
  });

  it('should get system capabilities', async () => {
    // Mock navigator.gpu
    const mockGPU = {
      requestAdapter: vi.fn().mockResolvedValue({
        features: new Set(['feature1', 'feature2']),
        limits: { maxTextureDimension2D: 8192 },
      }),
    };
    
    // Save original navigator
    const originalNavigator = navigator;
    
    // Override navigator
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: mockGPU,
      },
      writable: true,
    });
    
    const capabilities = await ModelLoader.getSystemCapabilities();
    
    expect(capabilities.webgpu).toBeDefined();
    expect(capabilities.webgpu!.supported).toBe(true);
    expect(capabilities.webgpu!.adapter).toBeDefined();
    
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });

  it('should handle unsupported WebGPU gracefully', async () => {
    // Save original navigator
    const originalNavigator = navigator;
    
    // Override navigator to not have gpu
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: undefined,
      },
      writable: true,
    });
    
    const capabilities = await ModelLoader.getSystemCapabilities();
    
    expect(capabilities.webgpu).toBeDefined();
    expect(capabilities.webgpu!.supported).toBe(false);
    
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });

  it('should pause and resume loading', () => {
    expect(modelLoader.isPaused()).toBe(false);
    
    modelLoader.pause();
    expect(modelLoader.isPaused()).toBe(true);
    
    modelLoader.resume();
    expect(modelLoader.isPaused()).toBe(false);
  });

  it('should cancel loading', () => {
    expect(modelLoader.isCancelled()).toBe(false);
    
    modelLoader.cancel();
    expect(modelLoader.isCancelled()).toBe(true);
  });

  it('should load model with progress updates', async () => {
    // Mock the webllm module
    const mockEngine = {
      reload: vi.fn().mockResolvedValue(undefined),
    };
    
    const mockWebllm = {
      CreateMLCEngine: vi.fn().mockResolvedValue(mockEngine),
    };
    
    // Mock the module import
    vi.doMock('@mlc-ai/web-llm', () => mockWebllm);
    
    // Mock window.mlceWasmUrl
    const originalMlceWasmUrl = (window as any).mlceWasmUrl;
    (window as any).mlceWasmUrl = 'http://localhost/mock.wasm';
    
    const modelId = 'test-model';
    
    await modelLoader.loadModel(modelId);
    
    expect(mockWebllm.CreateMLCEngine).toHaveBeenCalledWith(
      modelId,
      expect.objectContaining({
        initProgressCallback: expect.any(Function),
      })
    );
    
    // Restore original value
    if (originalMlceWasmUrl) {
      (window as any).mlceWasmUrl = originalMlceWasmUrl;
    } else {
      delete (window as any).mlceWasmUrl;
    }
  });

  it('should handle model loading errors', async () => {
    // Mock the webllm module to throw an error
    const mockWebllm = {
      CreateMLCEngine: vi.fn().mockRejectedValue(new Error('Model loading failed')),
    };
    
    // Mock the module import
    vi.doMock('@mlc-ai/web-llm', () => mockWebllm);
    
    // Mock window.mlceWasmUrl
    const originalMlceWasmUrl = (window as any).mlceWasmUrl;
    (window as any).mlceWasmUrl = 'http://localhost/mock.wasm';
    
    const modelId = 'test-model';
    
    await expect(modelLoader.loadModel(modelId)).rejects.toThrow('Model loading failed');
    
    // Restore original value
    if (originalMlceWasmUrl) {
      (window as any).mlceWasmUrl = originalMlceWasmUrl;
    } else {
      delete (window as any).mlceWasmUrl;
    }
  });
});