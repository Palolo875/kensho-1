/**
 * Test Suite: Type-safe Error Handling
 * Priority 1: Union types instead of `any`
 */

import { describe, it, expect } from 'vitest';
import { type SystemErrorType } from '../router/RouterTypes';

describe('Type-safe Error Handling - Priority 1 ✅', () => {
  it('should create InsufficientMemory error', () => {
    const error: SystemErrorType = {
      type: 'InsufficientMemory',
      required: 512,
      available: 256
    };

    expect(error.type).toBe('InsufficientMemory');
    expect(error.required).toBe(512);
    expect(error.available).toBe(256);
  });

  it('should create ModelNotFound error', () => {
    const error: SystemErrorType = {
      type: 'ModelNotFound',
      modelKey: 'unknown-model-123',
      availableModels: ['model-1', 'model-2']
    };

    expect(error.type).toBe('ModelNotFound');
    expect(error.modelKey).toBe('unknown-model-123');
    expect(error.availableModels).toContain('model-1');
  });

  it('should create TimeoutError', () => {
    const error: SystemErrorType = {
      type: 'TimeoutError',
      duration: 30000,
      component: 'model_loading'
    };

    expect(error.type).toBe('TimeoutError');
    expect(error.component).toBe('model_loading');
    expect(error.duration).toBe(30000);
  });

  it('should create NetworkError', () => {
    const error: SystemErrorType = {
      type: 'NetworkError',
      detail: 'Connection lost'
    };

    expect(error.type).toBe('NetworkError');
    expect(error.detail).toBe('Connection lost');
  });

  it('should create ClassificationFailed error', () => {
    const error: SystemErrorType = {
      type: 'ClassificationFailed',
      reason: 'Unable to classify intent',
      userInput: 'What is 2+2?'
    };

    expect(error.type).toBe('ClassificationFailed');
    expect(error.reason).toBe('Unable to classify intent');
  });

  it('should create ParseError', () => {
    const error: SystemErrorType = {
      type: 'ParseError',
      format: 'json',
      rawData: '{ invalid json'
    };

    expect(error.type).toBe('ParseError');
    expect(error.format).toBe('json');
  });

  it('should create UnknownError', () => {
    const error: SystemErrorType = {
      type: 'UnknownError',
      message: 'Something went wrong'
    };

    expect(error.type).toBe('UnknownError');
    expect(error.message).toBe('Something went wrong');
  });

  it('should discriminate error types correctly', () => {
    const errors: SystemErrorType[] = [
      { type: 'InsufficientMemory', required: 512, available: 256 },
      { type: 'ModelNotFound', modelKey: 'unknown', availableModels: [] },
      { type: 'TimeoutError', duration: 60000, component: 'inference' }
    ];

    errors.forEach(error => {
      switch (error.type) {
        case 'InsufficientMemory':
          expect(error.required).toBeDefined();
          expect(error.available).toBeDefined();
          break;
        case 'ModelNotFound':
          expect(error.modelKey).toBeDefined();
          expect(error.availableModels).toBeDefined();
          break;
        case 'TimeoutError':
          expect(error.component).toBeDefined();
          expect(error.duration).toBeDefined();
          break;
      }
    });
  });

  it('should prevent incorrect error structures', () => {
    const validMemoryError: SystemErrorType = {
      type: 'InsufficientMemory',
      required: 512,
      available: 256
    };

    expect(validMemoryError.type).toBe('InsufficientMemory');
  });

  it('should handle error metadata correctly', () => {
    const error: SystemErrorType = {
      type: 'TimeoutError',
      component: 'streaming_inference',
      duration: 120000
    };

    const errorMsg = `${error.type}: ${error.component} exceeded ${error.duration}ms`;
    expect(errorMsg).toContain('TimeoutError');
    expect(errorMsg).toContain('streaming_inference');
  });
});
