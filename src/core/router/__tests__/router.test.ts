import { Router } from '../Router';
import { IntentClassifier } from '../IntentClassifier';
import { CapacityEvaluator } from '../CapacityEvaluator';
import { ROUTER_MODEL_CATALOG, validateModelExists, getAllVerifiedModels } from '../ModelCatalog';

describe('Router v2.0 - Anti-Hallucination & Fail-Aware System', () => {

  describe('ModelCatalog - Anti-Hallucination', () => {
    test('Tous les modèles dans le catalogue sont vérifiés', () => {
      const allModels = getAllVerifiedModels();
      expect(allModels.length).toBeGreaterThan(0);
      
      for (const model of allModels) {
        expect(model.verified).toBe(true);
        expect(model.verifiedDate).toBeDefined();
        expect(model.model_id).toBeTruthy();
      }
    });

    test('validateModelExists retourne false pour modèles fictifs', () => {
      expect(validateModelExists('phantom-model')).toBe(false);
      expect(validateModelExists('deepseek-coder')).toBe(false);
      expect(validateModelExists('bge-small-en-v1.5')).toBe(false);
    });

    test('validateModelExists retourne true pour modèles vérifiés', () => {
      expect(validateModelExists('gemma-3-270m')).toBe(true);
      expect(validateModelExists('qwen2.5-coder-1.5b')).toBe(true);
      expect(validateModelExists('qwen2.5-math-1.5b')).toBe(true);
    });
  });

  describe('IntentClassifier - Classification Hybride', () => {
    const classifier = new IntentClassifier();

    test('Classification par mots-clés pour requêtes évidentes', async () => {
      const result = await classifier.classify('Comment faire une boucle en JavaScript?');
      expect(result.intent).toBe('CODE');
      expect(result.method).toBe('keywords');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('Classification par mots-clés pour math', async () => {
      const result = await classifier.classify('Calcule la dérivée de x² + 2x');
      expect(result.intent).toBe('MATH');
      expect(result.method).toBe('keywords');
    });

    test('Classification par mots-clés pour fact-check', async () => {
      const result = await classifier.classify('Vérifie si Paris est la capitale de France');
      expect(result.intent).toBe('FACTCHECK');
      expect(result.method).toBe('keywords');
    });

    test('Fallback à DIALOGUE pour requêtes ambiguës', async () => {
      const result = await classifier.classify('Bonjour');
      expect(['DIALOGUE', 'UNKNOWN'].includes(result.intent)).toBe(true);
    });
  });

  describe('CapacityEvaluator - Score Holistique', () => {
    const evaluator = new CapacityEvaluator();

    test('Score CPU calculé correctement', () => {
      expect(evaluator['evaluateCPU'](8)).toBe(10);
      expect(evaluator['evaluateCPU'](4)).toBe(7);
      expect(evaluator['evaluateCPU'](2)).toBe(5);
      expect(evaluator['evaluateCPU'](1)).toBe(3);
    });

    test('Score Mémoire calculé correctement', () => {
      expect(evaluator['evaluateMemory'](0.2)).toBe(10);
      expect(evaluator['evaluateMemory'](0.5)).toBe(8);
      expect(evaluator['evaluateMemory'](0.7)).toBe(6);
      expect(evaluator['evaluateMemory'](0.85)).toBe(4);
    });

    test('Stratégie SERIAL pour capacité faible', () => {
      expect(evaluator.determineStrategy(4, 'HIGH')).toBe('SERIAL');
      expect(evaluator.determineStrategy(5, 'LOW')).toBe('SERIAL');
    });

    test('Stratégie PARALLEL pour capacité élevée', () => {
      expect(evaluator.determineStrategy(8, 'LOW')).toBe('PARALLEL');
      expect(evaluator.determineStrategy(7, 'HIGH')).toBe('PARALLEL');
    });
  });

  describe('Router - Transparence des Downgrades', () => {
    const router = new Router();

    test('ExecutionPlan inclut downgradedFromIntent quand nécessaire', async () => {
      const plan = await router.createPlan('Explique moi comment ça marche');
      
      expect(plan).toHaveProperty('primaryTask');
      expect(plan).toHaveProperty('fallbackTasks');
      expect(plan).toHaveProperty('strategy');
      expect(plan).toHaveProperty('capacityScore');
      expect(plan).toHaveProperty('estimatedDuration');
      expect(plan).toHaveProperty('downgradedFromIntent');
      expect(plan).toHaveProperty('downgradeReason');
    });

    test('Pas de downgrade pour intentions non spécialisées', async () => {
      const plan = await router.createPlan('Bonjour');
      
      expect(plan.downgradedFromIntent).toBeUndefined();
      expect(plan.downgradeReason).toBeUndefined();
    });
  });

  describe('Router - Fail-Aware Error Handling', () => {
    const router = new Router();

    test('RouterError levé pour modèle inexistant', async () => {
      expect(async () => {
        await router.validatePlan({
          primaryTask: {
            agentName: 'FakeAgent',
            modelKey: 'fake-model',
            priority: 'HIGH',
            timeout: 10000,
            temperature: 0.7
          },
          fallbackTasks: [],
          strategy: 'SERIAL',
          capacityScore: 5,
          estimatedDuration: 10000
        });
      }).rejects.toThrow('RouterError');
    });
  });
});
