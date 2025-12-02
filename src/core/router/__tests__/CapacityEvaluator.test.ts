import { describe, it, expect } from 'vitest';
import { CapacityEvaluator } from '../CapacityEvaluator';

describe('CapacityEvaluator', () => {
  it('should evaluate model capacity based on system resources', () => {
    const evaluator = new CapacityEvaluator();
    
    // Mock system info with high capacity
    const highCapacitySystem = {
      ramGB: 16,
      vramGB: 8,
      cpuCores: 8,
      isWebGPUSupported: true,
    };
    
    const highCapacity = evaluator.evaluateModelCapacity(highCapacitySystem);
    expect(highCapacity).toBeGreaterThanOrEqual(0.7); // High capacity system
    
    // Mock system info with low capacity
    const lowCapacitySystem = {
      ramGB: 4,
      vramGB: 1,
      cpuCores: 2,
      isWebGPUSupported: false,
    };
    
    const lowCapacity = evaluator.evaluateModelCapacity(lowCapacitySystem);
    expect(lowCapacity).toBeLessThanOrEqual(0.3); // Low capacity system
  });

  it('should calculate memory requirements for models', () => {
    const evaluator = new CapacityEvaluator();
    
    // Test memory requirements calculation
    const smallModelMB = evaluator['getModelMemoryRequirements']('small');
    const mediumModelMB = evaluator['getModelMemoryRequirements']('medium');
    const largeModelMB = evaluator['getModelMemoryRequirements']('large');
    
    expect(smallModelMB).toBeLessThan(mediumModelMB);
    expect(mediumModelMB).toBeLessThan(largeModelMB);
    
    // Unknown model size should return default
    const unknownModelMB = evaluator['getModelMemoryRequirements']('unknown');
    expect(unknownModelMB).toBe(2048); // Default 2GB
  });

  it('should determine if model fits in system', () => {
    const evaluator = new CapacityEvaluator();
    
    // System with plenty of resources
    const systemWithResources = {
      ramGB: 16,
      vramGB: 8,
      cpuCores: 8,
      isWebGPUSupported: true,
    };
    
    const fitsLarge = evaluator['doesModelFitInSystem']('large', systemWithResources);
    expect(fitsLarge).toBe(true);
    
    // System with limited resources
    const systemLimited = {
      ramGB: 4,
      vramGB: 1,
      cpuCores: 2,
      isWebGPUSupported: false,
    };
    
    const fitsLargeLimited = evaluator['doesModelFitInSystem']('large', systemLimited);
    expect(fitsLargeLimited).toBe(false);
    
    const fitsSmallLimited = evaluator['doesModelFitInSystem']('small', systemLimited);
    expect(fitsSmallLimited).toBe(true);
  });

  it('should normalize capacity scores', () => {
    const evaluator = new CapacityEvaluator();
    
    // Test normalization
    const normalizedLow = evaluator['normalizeCapacity'](0.2, 0, 1);
    expect(normalizedLow).toBeCloseTo(0.2);
    
    const normalizedHigh = evaluator['normalizeCapacity'](1.5, 0, 1);
    expect(normalizedHigh).toBeCloseTo(1.0); // Clamped to max
    
    const normalizedMid = evaluator['normalizeCapacity'](0.5, 0, 1);
    expect(normalizedMid).toBeCloseTo(0.5);
  });
});