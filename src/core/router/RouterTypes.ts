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

/**
 * Type-safe error types (remplace any)
 */
export type SystemErrorType =
  | { type: 'ModelNotFound'; modelKey: string; availableModels: string[] }
  | { type: 'InsufficientMemory'; required: number; available: number }
  | { type: 'TimeoutError'; duration: number; component: string }
  | { type: 'ClassificationFailed'; reason: string; userInput: string }
  | { type: 'NetworkError'; detail: string }
  | { type: 'ParseError'; format: string; rawData: string }
  | { type: 'UnknownError'; message: string };

export interface TaskResult {
  agentName: string;
  modelKey: string;
  result?: string;
  error?: SystemErrorType;
  status: 'success' | 'error' | 'timeout';
  duration?: number;
  confidence?: number;
  sources?: string[];
}

export interface StreamChunk {
  type: 'primary' | 'expert' | 'fusion' | 'status';
  content?: string;
  expertResults?: TaskResult[];
  status?: string;
  metadata?: {
    chunkIndex?: number;
    totalChunks?: number;
  };
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
  constructor(
    message: string,
    public readonly rawResponse?: string,
    public readonly errorType: SystemErrorType = { type: 'ClassificationFailed', reason: message, userInput: '' }
  ) {
    super(message);
    this.name = 'ClassificationError';
  }
}

export class RouterError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly errorType: SystemErrorType = { type: 'UnknownError', message }
  ) {
    super(message);
    this.name = 'RouterError';
  }
}

export class SystemError extends Error {
  constructor(
    message: string,
    public readonly errorType: SystemErrorType
  ) {
    super(message);
    this.name = 'SystemError';
  }
}
