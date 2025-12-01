// src/core/kernel/GuardedTaskExecutor.ts
import { TaskExecutor } from './TaskExecutor';
import { inputFilter } from './guardrails/InputFilter';
import { outputGuard } from './guardrails/OutputGuard';
import { rateLimiter } from './guardrails/RateLimiter';
import { createLogger } from '../../lib/logger';

const log = createLogger('GuardedTaskExecutor');

export class GuardedTaskExecutor {
  private taskExecutor: TaskExecutor;

  constructor(taskExecutor: TaskExecutor) {
    this.taskExecutor = taskExecutor;
  }

  /**
   * Executes a task with guardrails applied
   */
  public async *processStream(
    userPrompt: string,
    clientId: string = 'anonymous'
  ): AsyncGenerator<any> {
    log.info('Processing request with guardrails', { clientId, promptLength: userPrompt.length });

    // Apply rate limiting
    const rateLimitResult = rateLimiter.isAllowed(clientId);
    if (!rateLimitResult.allowed) {
      const error = new Error(rateLimitResult.reason || 'Rate limit exceeded');
      log.warn('Rate limit exceeded for client:', clientId);
      throw error;
    }

    // Apply input filtering
    const inputValidation = inputFilter.validate(userPrompt);
    if (!inputValidation.safe) {
      const error = new Error(inputValidation.reason || 'Input validation failed');
      log.warn('Input validation failed:', inputValidation.reason);
      throw error;
    }

    // Process the stream with the underlying TaskExecutor
    for await (const chunk of this.taskExecutor.processStream(userPrompt)) {
      // Apply output guarding to text content
      if (chunk.type === 'primary' || chunk.type === 'fusion') {
        if (typeof chunk.content === 'string') {
          chunk.content = outputGuard.sanitize(chunk.content);
        }
      }
      
      yield chunk;
    }
  }

  /**
   * Gets statistics from the underlying TaskExecutor
   */
  public getStats() {
    return this.taskExecutor.getStats();
  }
}