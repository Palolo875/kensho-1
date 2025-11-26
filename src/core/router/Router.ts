import { IntentClassifier } from './IntentClassifier';
import { CapacityEvaluator } from './CapacityEvaluator';
import { ROUTER_MODEL_CATALOG, validateModelExists, getModelBySpecialization } from './ModelCatalog';
import {
  IntentCategory,
  ExecutionPlan,
  ExecutionStrategy,
  Task,
  TaskPriority,
  RouterError
} from './RouterTypes';
import { kernelCoordinator } from '../kernel';
import { createLogger } from '../../lib/logger';

const log = createLogger('Router');

export class Router {
  private intentClassifier: IntentClassifier;
  private capacityEvaluator: CapacityEvaluator;
  
  constructor() {
    this.intentClassifier = new IntentClassifier();
    this.capacityEvaluator = new CapacityEvaluator();
  }
  
  public async createPlan(userQuery: string): Promise<ExecutionPlan> {
    const classificationResult = await this.intentClassifier.classify(userQuery);
    
    log.info(`Intent classifié: ${classificationResult.intent} (conf: ${classificationResult.confidence}, méthode: ${classificationResult.method})`);
    
    const capacityMetrics = await this.capacityEvaluator.evaluate();
    
    log.info(`Capacité système: ${capacityMetrics.overallScore}/10`);
    
    const { primaryTask, fallbackTasks, downgradedFromIntent, downgradeReason } = await this.selectExperts(classificationResult.intent, capacityMetrics.overallScore);
    
    const strategy = this.capacityEvaluator.determineStrategy(
      capacityMetrics.overallScore,
      primaryTask.priority
    );
    
    const estimatedDuration = this.estimateDuration(primaryTask, fallbackTasks, strategy);
    
    const plan: ExecutionPlan = {
      primaryTask,
      fallbackTasks,
      strategy,
      capacityScore: capacityMetrics.overallScore,
      estimatedDuration,
      downgradedFromIntent,
      downgradeReason
    };
    
    if (downgradedFromIntent) {
      log.warn(`Plan dégradé: ${downgradedFromIntent} → ${primaryTask.agentName}. Raison: ${downgradeReason}`);
    }
    
    log.info(`Plan créé: stratégie ${strategy}, durée estimée ${estimatedDuration}ms`);
    
    return plan;
  }
  
  private async selectExperts(intent: IntentCategory, capacityScore: number): Promise<{
    primaryTask: Task;
    fallbackTasks: Task[];
    downgradedFromIntent?: IntentCategory;
    downgradeReason?: string;
  }> {
    switch (intent) {
      case 'CODE': {
        const codeModel = getModelBySpecialization('code');
        if (!codeModel) {
          throw new RouterError(
            'Aucun modèle de code disponible',
            'Model catalog missing code expert'
          );
        }
        
        const decision = await kernelCoordinator.canLoadModel('qwen2.5-coder-1.5b');
        if (!decision.canLoad) {
          const fallbackTask: Task = {
            agentName: 'GeneralDialogue',
            modelKey: 'gemma-3-270m',
            priority: 'HIGH',
            timeout: 20000,
            temperature: 0.7
          };
          return {
            primaryTask: fallbackTask,
            fallbackTasks: [],
            downgradedFromIntent: 'CODE',
            downgradeReason: decision.reason || 'Modèle code spécialisé non chargeable'
          };
        }
        
        const primaryTask: Task = {
          agentName: 'CodeExpert',
          modelKey: 'qwen2.5-coder-1.5b',
          priority: 'HIGH',
          timeout: 30000,
          temperature: 0.2
        };
        
        const fallbackTasks: Task[] = capacityScore >= 6 ? [{
          agentName: 'GeneralDialogue',
          modelKey: 'gemma-3-270m',
          priority: 'LOW',
          timeout: 20000,
          temperature: 0.7
        }] : [];
        
        return { primaryTask, fallbackTasks };
      }
      
      case 'MATH': {
        const mathModel = getModelBySpecialization('math');
        if (!mathModel) {
          throw new RouterError(
            'Aucun modèle mathématique disponible',
            'Model catalog missing math expert'
          );
        }
        
        const decision = await kernelCoordinator.canLoadModel('qwen2.5-math-1.5b');
        if (!decision.canLoad) {
          const fallbackTask: Task = {
            agentName: 'CalculatorAgent',
            modelKey: 'gemma-3-270m',
            priority: 'HIGH',
            timeout: 15000,
            temperature: 0.3
          };
          return {
            primaryTask: fallbackTask,
            fallbackTasks: [],
            downgradedFromIntent: 'MATH',
            downgradeReason: decision.reason || 'Modèle math spécialisé non chargeable'
          };
        }
        
        const primaryTask: Task = {
          agentName: 'MathExpert',
          modelKey: 'qwen2.5-math-1.5b',
          priority: 'HIGH',
          timeout: 25000,
          temperature: 0.1
        };
        
        const fallbackTasks: Task[] = [{
          agentName: 'CalculatorAgent',
          modelKey: 'gemma-3-270m',
          priority: 'LOW',
          timeout: 15000,
          temperature: 0.3
        }];
        
        return { primaryTask, fallbackTasks };
      }
      
      case 'FACTCHECK': {
        const primaryTask: Task = {
          agentName: 'FactCheckerAgent',
          modelKey: 'gemma-3-270m',
          priority: 'HIGH',
          timeout: 35000,
          temperature: 0.3
        };
        
        const fallbackTasks: Task[] = [];
        
        return { primaryTask, fallbackTasks };
      }
      
      case 'DIALOGUE':
      case 'UNKNOWN':
      default: {
        const primaryTask: Task = {
          agentName: 'GeneralDialogue',
          modelKey: 'gemma-3-270m',
          priority: capacityScore >= 7 ? 'HIGH' : 'LOW',
          timeout: 20000,
          temperature: 0.7
        };
        
        const fallbackTasks: Task[] = [];
        
        return { primaryTask, fallbackTasks };
      }
    }
  }
  
  private estimateDuration(primaryTask: Task, fallbackTasks: Task[], strategy: ExecutionStrategy): number {
    const primaryDuration = primaryTask.timeout * 0.6;
    
    if (fallbackTasks.length === 0) {
      return primaryDuration;
    }
    
    const fallbackDuration = fallbackTasks.reduce((sum, task) => sum + (task.timeout * 0.5), 0);
    
    if (strategy === 'PARALLEL_LIMITED' || strategy === 'PARALLEL_FULL') {
      return Math.max(primaryDuration, fallbackDuration);
    }
    
    return primaryDuration + fallbackDuration;
  }
}

export const router = new Router();
