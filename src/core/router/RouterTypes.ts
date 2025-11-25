export type IntentCategory = 'CODE' | 'MATH' | 'DIALOGUE' | 'FACTCHECK' | 'UNKNOWN';

export type ExecutionStrategy = 'SERIAL' | 'PARALLEL_LIMITED' | 'PARALLEL_FULL';

export type TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW';

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
  prompt?: string;
}

export interface TaskResult {
  agentName: string;
  modelKey: string;
  result?: string;
  error?: any;
  status: 'success' | 'error' | 'timeout';
  duration?: number;
}

export interface StreamChunk {
  type: 'primary' | 'expert' | 'fusion' | 'status';
  content?: string;
  expertResults?: TaskResult[];
  status?: string;
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
