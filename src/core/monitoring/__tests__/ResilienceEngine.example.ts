// src/core/monitoring/__tests__/ResilienceEngine.example.ts
// Example of how to integrate ResilienceEngine with TaskExecutor

import { AgentRuntime } from '../../agent-system/AgentRuntime';
import { ResilienceEngine, Task } from '../ResilienceEngine';

/**
 * Example of how to integrate ResilienceEngine with the existing TaskExecutor
 * This would be used in the execute method of TaskExecutor.ts
 */
export class ResilientTaskExecutor {
  private resilienceEngine: ResilienceEngine;

  constructor(private runtime: AgentRuntime) {
    this.resilienceEngine = new ResilienceEngine();
  }

  /**
   * Example of how to wrap existing calls with resilience patterns
   */
  async executeWithResilience(agent: string, method: string, args: any[]): Promise<any> {
    const task: Task = {
      model: `${agent}.${method}`,
      prompt: '', // Not used when args are provided
      args: args
    };

    const result = await this.resilienceEngine.executeTask(task, this.runtime);
    
    if (result.status === 'success') {
      return result.result;
    } else {
      throw new Error(`Task failed: ${result.error}`);
    }
  }

  /**
   * Get resilience metrics for monitoring
   */
  getResilienceMetrics() {
    return this.resilienceEngine.getMetrics();
  }
}

// Example usage:
/*
const executor = new ResilientTaskExecutor(runtime);
try {
  const result = await executor.executeWithResilience('MathAgent', 'calculate', [{ expression: '2+2' }]);
  console.log('Result:', result);
} catch (error) {
  console.error('Execution failed:', error);
}

// Monitor resilience
const metrics = executor.getResilienceMetrics();
console.log('Resilience metrics:', metrics);
*/