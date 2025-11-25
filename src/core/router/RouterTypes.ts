export type IntentCategory = 'CODE' | 'MATH' | 'DIALOGUE' | 'FACTCHECK' | 'UNKNOWN';

export type ExecutionStrategy = 'SERIAL' | 'PARALLEL';

export type TaskPriority = 'HIGH' | 'LOW';

export interface ClassificationResult {
  intent: IntentCategory;
  confidence: number;
  method: 'keywords' | 'llm' | 'fallback';
}

export interface Task {
  agentName: string;
  modelKey: string;
  priority: TaskPriority;
  timeout: number;
  temperature: number;
}

export interface ExecutionPlan {
  primaryTask: Task;
  fallbackTasks: Task[];
  strategy: ExecutionStrategy;
  capacityScore: number;
  estimatedDuration: number;
  downgradedFromIntent?: IntentCategory;
  downgradeReason?: string;
}

export interface CapacityMetrics {
  cpuScore: number;
  memoryScore: number;
  batteryScore: number;
  networkScore: number;
  overallScore: number;
}

export class ClassificationError extends Error {
  constructor(message: string, public readonly rawResponse?: string) {
    super(message);
    this.name = 'ClassificationError';
  }
}

export class RouterError extends Error {
  constructor(message: string, public readonly reason: string) {
    super(message);
    this.name = 'RouterError';
  }
}
