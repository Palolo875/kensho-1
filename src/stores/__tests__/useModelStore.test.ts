import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useModelStore } from '../useModelStore';

describe('useModelStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    useModelStore.setState({
      availableModels: [],
      loadedModels: {},
      activeModel: null,
      modelLoading: false,
      modelError: null,
    });
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useModelStore());
    
    expect(result.current.availableModels).toEqual([]);
    expect(result.current.loadedModels).toEqual({});
    expect(result.current.activeModel).toBeNull();
    expect(result.current.modelLoading).toBe(false);
    expect(result.current.modelError).toBeNull();
  });

  it('should set available models', () => {
    const { result } = renderHook(() => useModelStore());
    const models = [
      { id: 'model1', name: 'Model 1', description: 'First model' },
      { id: 'model2', name: 'Model 2', description: 'Second model' },
    ];
    
    act(() => {
      result.current.setAvailableModels(models);
    });
    
    expect(result.current.availableModels).toEqual(models);
  });

  it('should set loaded models', () => {
    const { result } = renderHook(() => useModelStore());
    const loadedModels = {
      model1: { status: 'loaded', version: '1.0' },
    };
    
    act(() => {
      result.current.setLoadedModels(loadedModels);
    });
    
    expect(result.current.loadedModels).toEqual(loadedModels);
  });

  it('should set active model', () => {
    const { result } = renderHook(() => useModelStore());
    const modelId = 'model1';
    
    act(() => {
      result.current.setActiveModel(modelId);
    });
    
    expect(result.current.activeModel).toBe(modelId);
  });

  it('should set model loading status', () => {
    const { result } = renderHook(() => useModelStore());
    
    act(() => {
      result.current.setModelLoading(true);
    });
    
    expect(result.current.modelLoading).toBe(true);
    
    act(() => {
      result.current.setModelLoading(false);
    });
    
    expect(result.current.modelLoading).toBe(false);
  });

  it('should set model error', () => {
    const { result } = renderHook(() => useModelStore());
    const error = new Error('Model loading failed');
    
    act(() => {
      result.current.setModelError(error);
    });
    
    expect(result.current.modelError).toBe(error);
    
    act(() => {
      result.current.setModelError(null);
    });
    
    expect(result.current.modelError).toBeNull();
  });

  it('should check if model is loaded', () => {
    const { result } = renderHook(() => useModelStore());
    const modelId = 'model1';
    
    expect(result.current.isModelLoaded(modelId)).toBe(false);
    
    act(() => {
      result.current.setLoadedModels({
        [modelId]: { status: 'loaded', version: '1.0' },
      });
    });
    
    expect(result.current.isModelLoaded(modelId)).toBe(true);
  });
});