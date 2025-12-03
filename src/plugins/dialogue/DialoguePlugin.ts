import { taskExecutor } from '../../core/kernel/TaskExecutor';
import { eventBus } from '../../core/eventbus/EventBus';
import { createLogger } from '../../lib/logger';

const log = createLogger('DialoguePlugin');

export class DialoguePlugin {
  private defaultModelKey: string = 'gemma-2-2b';

  /**
   * Process a user prompt through the complete pipeline
   * This is the main entry point that delegates to the TaskExecutor
   */
  public async process(userPrompt: string): Promise<void> {
    log.info(`[DialoguePlugin] Processing prompt: "${userPrompt.substring(0, 50)}..."`);
    
    try {
      // Delegate entirely to the TaskExecutor
      const response = await taskExecutor.process(userPrompt);
      
      // Emit the final response through the event bus
      eventBus.streamComplete(response);
    } catch (error) {
      log.error('[DialoguePlugin] Error processing prompt:', error);
      if (error instanceof Error) {
        eventBus.streamError(error);
      } else {
        eventBus.streamError(new Error('Unknown error occurred'));
      }
    }
  }
}

// Export singleton instance
export const dialoguePlugin = new DialoguePlugin();