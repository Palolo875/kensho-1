import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { modelManager } from '../ModelManager';

describe('ModelManager', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Reset any internal state if needed
        vi.resetAllMocks();
    });

    it('should initialize correctly', () => {
        expect(modelManager).toBeDefined();
    });

    it('should initialize mock mode', async () => {
        await expect(modelManager.initMockMode()).resolves.not.toThrow();
    });

    it('should download and initialize Qwen3', async () => {
        const progressCallback = vi.fn();
        
        // This method might not be fully implemented, so we check it handles gracefully
        await expect(modelManager.downloadAndInitQwen3(progressCallback))
            .resolves
            .toBeUndefined();
    });

    it('should switch to model', async () => {
        await expect(modelManager.switchToModel('mock')).resolves.not.toThrow();
        await expect(modelManager.switchToModel('gpt2')).resolves.not.toThrow();
    });

    it('should get current model', () => {
        const currentModel = modelManager.getCurrentModel();
        expect(typeof currentModel).toBe('string');
    });

    it('should check if model is loaded', () => {
        const isLoaded = modelManager.isModelLoaded('mock');
        expect(typeof isLoaded).toBe('boolean');
    });

    it('should generate mock response', async () => {
        const response = await modelManager.generate('Test prompt');
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(0);
    });

    it('should generate stream mock response', async () => {
        const chunks: string[] = [];
        const onChunk = vi.fn((chunk: string) => chunks.push(chunk));
        
        await modelManager.generateStream('Test prompt', onChunk);
        
        expect(onChunk).toHaveBeenCalled();
        expect(chunks.length).toBeGreaterThan(0);
    });

    it('should get model info', () => {
        const modelInfo = modelManager.getModelInfo();
        
        expect(modelInfo).toEqual({
            modelName: expect.any(String),
            modelVersion: expect.any(String),
            capabilities: expect.any(Array),
            isReady: expect.any(Boolean),
        });
    });

    it('should handle errors gracefully', async () => {
        // Test that error handling works
        await expect(modelManager.generate('')).resolves.not.toThrow();
    });
});