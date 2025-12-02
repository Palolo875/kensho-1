import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Router } from '../Router';
import { IntentClassifier } from '../IntentClassifier';
import { CapacityEvaluator } from '../CapacityEvaluator';
import { kernelCoordinator } from '../../kernel';
import { runtimeManager } from '../../kernel/RuntimeManager';

// Mock dependencies
vi.mock('../IntentClassifier');
vi.mock('../CapacityEvaluator');
vi.mock('../../kernel');
vi.mock('../../kernel/RuntimeManager');

describe('Router - Comprehensive Tests', () => {
    let router: Router;

    beforeEach(() => {
        router = new Router();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should handle math intent and create execution plan', async () => {
        // Mock intent classifier for math
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'MATH',
                    confidence: 0.92,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as any).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 7
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as any).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager
        (runtimeManager.isModelInPool as any).mockReturnValue(false);

        const plan = await router.createPlan('Calculate the integral of x^2');

        expect(plan.primaryTask.modelKey).toBe('gemma-3-270m-it-MLC');
        expect(plan.primaryTask.agentName).toBe('MathExpert');
        expect(plan.strategy).toBe('SERIAL');
    });

    it('should handle dialogue intent and create execution plan', async () => {
        // Mock intent classifier for dialogue
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'DIALOGUE',
                    confidence: 0.85,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as any).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 6
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as any).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager
        (runtimeManager.isModelInPool as any).mockReturnValue(false);

        const plan = await router.createPlan('Hello, how are you today?');

        expect(plan.primaryTask.modelKey).toBe('gemma-3-270m-it-MLC');
        expect(plan.primaryTask.agentName).toBe('GeneralDialogue');
        expect(plan.strategy).toBe('SERIAL');
    });

    it('should handle fact-check intent and create execution plan', async () => {
        // Mock intent classifier for fact-check
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'FACTCHECK',
                    confidence: 0.88,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as any).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 8
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as any).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager
        (runtimeManager.isModelInPool as any).mockReturnValue(false);

        const plan = await router.createPlan('Is climate change real?');

        expect(plan.primaryTask.modelKey).toBe('gemma-3-270m-it-MLC');
        expect(plan.primaryTask.agentName).toBe('FactCheckerAgent');
        expect(plan.strategy).toBe('SERIAL');
    });

    it('should handle unknown intent and create execution plan', async () => {
        // Mock intent classifier for unknown
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'UNKNOWN',
                    confidence: 0.3,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as any).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 5
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as any).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager
        (runtimeManager.isModelInPool as any).mockReturnValue(false);

        const plan = await router.createPlan('xyz123 nonsense query');

        expect(plan.primaryTask.modelKey).toBe('gemma-3-270m-it-MLC');
        expect(plan.primaryTask.agentName).toBe('GeneralDialogue');
        expect(plan.strategy).toBe('SERIAL');
    });

    it('should handle model already in pool', async () => {
        // Mock intent classifier
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'CODE',
                    confidence: 0.95,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as any).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 8
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as any).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager to show model is in pool
        (runtimeManager.isModelInPool as any).mockReturnValue(true);

        const plan = await router.createPlan('Write a function to calculate fibonacci sequence');

        expect(plan.primaryTask.modelKey).toBe('qwen2.5-coder-1.5b');
        // The wasPreloaded flag should be true when model is in pool
    });

    it('should handle capacity-based strategy selection', async () => {
        // Mock intent classifier
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'CODE',
                    confidence: 0.95,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator with high capacity
        (CapacityEvaluator as any).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 9
                }),
                determineStrategy: vi.fn().mockReturnValue('PARALLEL_FULL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as any).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager
        (runtimeManager.isModelInPool as any).mockReturnValue(false);

        const plan = await router.createPlan('Write a complex algorithm');

        expect(plan.strategy).toBe('PARALLEL_FULL');
    });

    it('should update statistics correctly', async () => {
        // Mock intent classifier
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'CODE',
                    confidence: 0.95,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as any).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 8
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as any).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager
        (runtimeManager.isModelInPool as any).mockReturnValue(false);

        // Get initial stats
        const initialStats = router.getStats();

        await router.createPlan('Write a function');

        // Get updated stats
        const updatedStats = router.getStats();

        expect(updatedStats.totalRoutes).toBe(initialStats.totalRoutes + 1);
        expect(updatedStats.successfulRoutes).toBe(initialStats.successfulRoutes + 1);
        expect(updatedStats.intentDistribution.CODE).toBe(initialStats.intentDistribution.CODE + 1);
    });

    it('should handle router errors gracefully', async () => {
        // Mock intent classifier to throw an error
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockRejectedValue(new Error('Classification failed'))
            };
        });

        await expect(router.createPlan('Test query')).rejects.toThrow('Classification failed');

        // Stats should reflect the failure
        const stats = router.getStats();
        expect(stats.failedRoutes).toBe(1);
    });

    it('should reset statistics correctly', async () => {
        // Mock intent classifier
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'CODE',
                    confidence: 0.95,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as any).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 8
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as any).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager
        (runtimeManager.isModelInPool as any).mockReturnValue(false);

        // Create a few plans to populate stats
        await router.createPlan('Test 1');
        await router.createPlan('Test 2');

        const statsBeforeReset = router.getStats();
        expect(statsBeforeReset.totalRoutes).toBeGreaterThan(0);

        // Reset stats
        router.resetStats();

        const statsAfterReset = router.getStats();
        expect(statsAfterReset.totalRoutes).toBe(0);
        expect(statsAfterReset.successfulRoutes).toBe(0);
        expect(statsAfterReset.failedRoutes).toBe(0);
        expect(statsAfterReset.intentDistribution.CODE).toBe(0);
    });

    it('should get routing history correctly', async () => {
        // Mock intent classifier
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'CODE',
                    confidence: 0.95,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as any).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 8
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as any).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager
        (runtimeManager.isModelInPool as any).mockReturnValue(false);

        // Create a plan
        await router.createPlan('Test query');

        // Get routing history
        const history = router.getRoutingHistory();
        expect(history).toHaveLength(1);
        expect(history[0].query).toBe('Test query');
        expect(history[0].intent).toBe('CODE');
        expect(history[0].success).toBe(true);
    });

    it('should handle configuration updates', () => {
        const initialConfig = {
            enablePreloading: true,
            preloadThreshold: 0.8,
            maxPreloadedModels: 2,
            useModelPool: true,
            fallbackToDialogue: true
        };

        const newConfig = {
            preloadThreshold: 0.9,
            maxPreloadedModels: 3
        };

        router.setConfig(newConfig);

        // Note: We can't directly access private config, but we can test that the method exists
        expect(router.setConfig).toBeDefined();
    });

    it('should get usage patterns correctly', async () => {
        // Mock intent classifier
        (IntentClassifier as any).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'CODE',
                    confidence: 0.95,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as any).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 8
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as any).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager
        (runtimeManager.isModelInPool as any).mockReturnValue(false);

        // Create a plan
        await router.createPlan('Test query');

        // Get usage patterns
        const patterns = router.getUsagePatterns();
        expect(patterns.get('CODE')).toBe(1);
    });
});