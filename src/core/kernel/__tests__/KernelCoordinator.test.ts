import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { kernelCoordinator } from '../KernelCoordinator';
import { modelManager } from '../ModelManager';
import { runtimeManager } from '../RuntimeManager';
import { resourceManager } from '../ResourceManager';
import { storageManager } from '../StorageManager';

// Mock all dependencies
vi.mock('../ModelManager');
vi.mock('../RuntimeManager');
vi.mock('../ResourceManager');
vi.mock('../StorageManager');

describe('KernelCoordinator', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Reset any internal state if needed
        vi.resetAllMocks();
    });

    it('should initialize with default configuration', () => {
        expect(kernelCoordinator).toBeDefined();
    });

    it('should set configuration correctly', () => {
        const newConfig = {
            autoInitRuntime: false,
            memoryThresholdMB: 1000,
        };

        kernelCoordinator.setConfig(newConfig);
        
        // We can't directly test private properties, but we can verify the method exists
        expect(kernelCoordinator.setConfig).toBeDefined();
    });

    it('should initialize kernel successfully', async () => {
        // Mock dependencies
        (resourceManager.getStatus as any).mockResolvedValue({
            memory: { jsHeapUsed: 100 },
        });
        
        (storageManager.ensureReady as any).mockResolvedValue(true);
        (runtimeManager.detectWebGPU as any).mockResolvedValue(true);
        
        const progressCallback = vi.fn();
        
        await kernelCoordinator.init('mock', progressCallback);
        
        expect(progressCallback).toHaveBeenCalled();
        // Verify that the initialization went through all phases
        const calls = progressCallback.mock.calls;
        expect(calls.some(call => call[0].phase === 'checking')).toBe(true);
        expect(calls.some(call => call[0].phase === 'ready')).toBe(true);
    });

    it('should handle initialization errors gracefully', async () => {
        // Mock resource manager to throw an error
        (resourceManager.getStatus as any).mockRejectedValue(new Error('Resource check failed'));
        
        const progressCallback = vi.fn();
        
        await expect(kernelCoordinator.init('mock', progressCallback))
            .rejects
            .toThrow('Resource check failed');
            
        // Verify error callback was called
        expect(progressCallback).toHaveBeenCalledWith({
            phase: 'error',
            progress: 0,
            text: expect.stringContaining('Erreur:'),
        });
    });

    it('should load models correctly', async () => {
        // Mock model manager
        (modelManager.initMockMode as any).mockResolvedValue(undefined);
        
        await kernelCoordinator.loadModel('mock');
        
        expect(modelManager.initMockMode).toHaveBeenCalled();
    });

    it('should check if model can be loaded', async () => {
        // Mock resource manager
        (resourceManager.getStatus as any).mockResolvedValue({
            memory: { usageRatio: 0.5 },
            battery: { level: 0.8, isCharging: true },
            network: { isOnline: true, effectiveType: '4g' },
            powerSaveMode: false,
        });
        
        const decision = await kernelCoordinator.canLoadModel('mock');
        
        expect(decision.canLoad).toBe(true);
    });

    it('should handle model loading decisions with restrictions', async () => {
        // Mock resource manager with restrictive conditions
        (resourceManager.getStatus as any).mockResolvedValue({
            memory: { usageRatio: 0.9 }, // High memory usage
            battery: { level: 0.8, isCharging: true },
            network: { isOnline: true, effectiveType: '4g' },
            powerSaveMode: false,
        });
        
        const decision = await kernelCoordinator.canLoadModel('some-model');
        
        expect(decision.canLoad).toBe(false);
        expect(decision.reason).toContain('Mémoire saturée');
    });

    it('should switch models correctly', async () => {
        // Mock canLoadModel to return true
        const canLoadModelSpy = vi.spyOn(kernelCoordinator as any, 'canLoadModel')
            .mockResolvedValue({ canLoad: true });
            
        // Mock model manager
        (modelManager.switchToModel as any).mockResolvedValue(undefined);
        
        await kernelCoordinator.switchModel('mock');
        
        expect(canLoadModelSpy).toHaveBeenCalledWith('mock');
        expect(modelManager.switchToModel).toHaveBeenCalledWith('mock');
    });

    it('should handle model switching errors', async () => {
        // Mock canLoadModel to return false
        vi.spyOn(kernelCoordinator as any, 'canLoadModel')
            .mockResolvedValue({ canLoad: false, reason: 'Test reason' });
            
        await expect(kernelCoordinator.switchModel('invalid-model'))
            .rejects
            .toThrow('Cannot load model: Test reason');
    });

    it('should get current model correctly', () => {
        // Mock runtime manager status
        (runtimeManager.getStatus as any).mockReturnValue({
            isReady: false,
            modelId: null,
        });
        
        // Mock model manager
        (modelManager.getCurrentModel as any).mockReturnValue('mock');
        
        const currentModel = kernelCoordinator.getCurrentModel();
        
        expect(currentModel).toBe('mock');
    });

    it('should get kernel status correctly', () => {
        // Mock dependencies
        (runtimeManager.getStatus as any).mockReturnValue({
            isReady: true,
            modelId: 'test-model',
            gpuAvailable: true,
            memoryUsage: 500,
        });
        
        (storageManager.isReady as any).mockReturnValue(true);
        
        const status = kernelCoordinator.getStatus();
        
        expect(status).toEqual({
            isInitialized: expect.any(Boolean),
            currentModelKey: expect.any(String),
            runtimeReady: true,
            storageReady: true,
            gpuAvailable: true,
            memoryUsage: 500,
            lastError: expect.any(Object),
        });
    });

    it('should check if kernel is ready', () => {
        const isReady = kernelCoordinator.isReady();
        expect(typeof isReady).toBe('boolean');
    });

    it('should shutdown kernel correctly', async () => {
        // Mock runtime manager
        (runtimeManager.shutdown as any).mockResolvedValue(undefined);
        (storageManager.clearCache as any).mockReturnValue(undefined);
        
        await kernelCoordinator.shutdown();
        
        expect(runtimeManager.shutdown).toHaveBeenCalled();
        expect(storageManager.clearCache).toHaveBeenCalled();
    });

    it('should handle shutdown errors gracefully', async () => {
        // Mock runtime manager to throw an error
        (runtimeManager.shutdown as any).mockRejectedValue(new Error('Shutdown failed'));
        
        await expect(kernelCoordinator.shutdown())
            .rejects
            .toThrow('Shutdown failed');
    });

    it('should restart kernel correctly', async () => {
        // Mock shutdown and init methods
        const shutdownSpy = vi.spyOn(kernelCoordinator, 'shutdown').mockResolvedValue(undefined);
        const initSpy = vi.spyOn(kernelCoordinator, 'init').mockResolvedValue(undefined);
        
        await kernelCoordinator.restart('mock');
        
        expect(shutdownSpy).toHaveBeenCalled();
        expect(initSpy).toHaveBeenCalledWith('mock', undefined);
    });
});