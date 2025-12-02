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

describe('Router', () => {
    let router: Router;

    beforeEach(() => {
        router = new Router();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with default configuration', () => {
        expect(router).toBeInstanceOf(Router);
    });

    it('should classify intent and create execution plan', async () => {
        // Mock intent classifier
        (IntentClassifier as jest.Mock).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'CODE',
                    confidence: 0.95,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as jest.Mock).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 8
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator
        (kernelCoordinator.canLoadModel as jest.Mock).mockResolvedValue({
            canLoad: true,
            reason: ''
        });

        // Mock runtime manager
        (runtimeManager.isModelInPool as jest.Mock).mockReturnValue(false);

        const plan = await router.createPlan('Write a function to calculate fibonacci sequence');

        expect(plan.primaryTask.modelKey).toBe('qwen2.5-coder-1.5b');
        expect(plan.strategy).toBe('SERIAL');
    });

    it('should handle model loading failures gracefully', async () => {
        // Mock intent classifier
        (IntentClassifier as jest.Mock).mockImplementation(() => {
            return {
                classify: vi.fn().mockResolvedValue({
                    intent: 'CODE',
                    confidence: 0.95,
                    method: 'llm'
                })
            };
        });

        // Mock capacity evaluator
        (CapacityEvaluator as jest.Mock).mockImplementation(() => {
            return {
                evaluate: vi.fn().mockResolvedValue({
                    overallScore: 8
                }),
                determineStrategy: vi.fn().mockReturnValue('SERIAL')
            };
        });

        // Mock kernel coordinator to simulate failure
        (kernelCoordinator.canLoadModel as jest.Mock).mockResolvedValue({
            canLoad: false,
            reason: 'Insufficient memory'
        });

        // Mock runtime manager to show model not in pool
        (runtimeManager.isModelInPool as jest.Mock).mockReturnValue(false);

        const plan = await router.createPlan('Write a function to calculate fibonacci sequence');

        // Should fall back to general dialogue model
        expect(plan.primaryTask.modelKey).toBe('gemma-3-270m');
        expect(plan.downgradedFromIntent).toBe('CODE');
    });
});