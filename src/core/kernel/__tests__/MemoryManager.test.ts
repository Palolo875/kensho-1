// src/core/kernel/__tests__/MemoryManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { memoryManager } from '../MemoryManager';
import { MOCK_MODEL_CATALOG } from '../ModelCatalog';

describe('MemoryManager (Mock Version)', () => {
  beforeEach(() => {
    memoryManager.reset();
  });

  describe('registerLoaded', () => {
    it('should register a model as loaded', () => {
      memoryManager.registerLoaded('dialogue-gemma-mock');
      expect(memoryManager.getLoadedModels()).toContain('dialogue-gemma-mock');
    });

    it('should not duplicate a model if already loaded', () => {
      memoryManager.registerLoaded('dialogue-gemma-mock');
      memoryManager.registerLoaded('dialogue-gemma-mock');
      expect(memoryManager.getLoadedModels().length).toBe(1);
    });

    it('should log when model is loaded', () => {
      // This test verifies the method works without throwing
      expect(() => {
        memoryManager.registerLoaded('code-qwen-mock');
      }).not.toThrow();
    });
  });

  describe('registerUnloaded', () => {
    it('should unregister a loaded model', () => {
      memoryManager.registerLoaded('dialogue-gemma-mock');
      memoryManager.registerUnloaded('dialogue-gemma-mock');
      expect(memoryManager.getLoadedModels()).not.toContain('dialogue-gemma-mock');
    });

    it('should handle unregistering a non-loaded model gracefully', () => {
      expect(() => {
        memoryManager.registerUnloaded('non-existent-model');
      }).not.toThrow();
    });
  });

  describe('canLoadModel', () => {
    it('should return true for a model that fits in available VRAM', () => {
      // With 8GB total and no models loaded, even largest should fit
      expect(memoryManager.canLoadModel('vision-clip-mock')).toBe(true);
    });

    it('should return false for unknown models', () => {
      expect(memoryManager.canLoadModel('unknown-model' as any)).toBe(false);
    });

    it('should handle edge cases with full VRAM', () => {
      // Load models until almost full
      memoryManager.registerLoaded('research-phi-mock'); // 2.1GB
      memoryManager.registerLoaded('code-qwen-mock');    // 1.8GB
      memoryManager.registerLoaded('creative-llama-mock'); // 1.5GB
      memoryManager.registerLoaded('math-bitnet-mock');   // 1.2GB
      // Total: 6.6GB, available: 1.4GB
      
      // Try to load a 1.5GB model - should fail
      expect(memoryManager.canLoadModel('creative-llama-mock')).toBe(false);
      
      // Try to load a 0.3GB model - should succeed
      expect(memoryManager.canLoadModel('embedding-e5-mock')).toBe(true);
    });
  });

  describe('suggestModelsToUnload', () => {
    it('should return empty array when enough space is available', () => {
      memoryManager.registerLoaded('dialogue-gemma-mock');
      const suggestions = memoryManager.suggestModelsToUnload(0.1);
      expect(suggestions).toEqual([]);
    });

    it('should suggest models to unload when space is needed', () => {
      memoryManager.registerLoaded('dialogue-gemma-mock'); // 0.5GB, loaded first
      memoryManager.registerLoaded('code-qwen-mock');      // 1.8GB, loaded second
      
      // Need 2GB but only have ~6.5GB available
      const suggestions = memoryManager.suggestModelsToUnload(2.0);
      
      // Should suggest models in LRU order (by loadedAt)
      expect(suggestions).toContain('dialogue-gemma-mock');
    });
  });

  describe('touch and LRU', () => {
    it('should update lastAccessed timestamp when touched', () => {
      memoryManager.registerLoaded('dialogue-gemma-mock');
      const beforeTouch = memoryManager.getModelInfo('dialogue-gemma-mock')?.lastAccessed;
      
      // Wait a bit to ensure timestamp changes
      setTimeout(() => {
        memoryManager.touch('dialogue-gemma-mock');
        const afterTouch = memoryManager.getModelInfo('dialogue-gemma-mock')?.lastAccessed;
        expect(afterTouch).toBeGreaterThanOrEqual(beforeTouch || 0);
      }, 10);
    });

    it('should handle touching non-existent models gracefully', () => {
      expect(() => {
        memoryManager.touch('non-existent-model');
      }).not.toThrow();
    });
  });

  describe('getMemoryReport', () => {
    it('should return detailed memory report', () => {
      memoryManager.registerLoaded('dialogue-gemma-mock');
      memoryManager.registerLoaded('code-qwen-mock');
      
      const report = memoryManager.getMemoryReport();
      
      expect(report.totalVRAM).toBe(8);
      expect(report.loadedModelsCount).toBe(2);
      expect(report.usedVRAM).toBeCloseTo(2.3); // 0.5 + 1.8
      expect(report.availableVRAM).toBeCloseTo(5.7); // 8 - 2.3
      expect(report.usagePercentage).toBeCloseTo(28.75); // (2.3/8)*100
      expect(report.loadedModels).toHaveLength(2);
      
      // Check structure of loaded models data
      const firstModel = report.loadedModels[0];
      expect(firstModel).toHaveProperty('key');
      expect(firstModel).toHaveProperty('vram');
      expect(firstModel).toHaveProperty('loadedAt');
      expect(firstModel).toHaveProperty('ageMs');
    });
  });

  describe('getModelInfo', () => {
    it('should return model info for loaded models', () => {
      memoryManager.registerLoaded('dialogue-gemma-mock');
      const info = memoryManager.getModelInfo('dialogue-gemma-mock');
      
      expect(info).toBeDefined();
      expect(info?.key).toBe('dialogue-gemma-mock');
      expect(info?.vram).toBe(0.5);
      expect(info?.loadedAt).toBeDefined();
      expect(info?.lastAccessed).toBeDefined();
    });

    it('should return undefined for non-loaded models', () => {
      const info = memoryManager.getModelInfo('non-existent-model' as any);
      expect(info).toBeUndefined();
    });
  });
});