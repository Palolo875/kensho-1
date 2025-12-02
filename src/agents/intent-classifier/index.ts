import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { createLogger } from '../../lib/logger';

const log = createLogger('IntentClassifier');

export type Intent = 
  | { type: 'MEMORIZE', content: string, confidence: number }
  | { type: 'FORGET', content: string, scope: 'ALL' | 'NODE', confidence: number }
  | { type: 'CHAT', confidence: number };

interface ClassifyRequest {
  text: string;
}

interface IntentRule {
  pattern: RegExp;
  extract: string;
  confidence: number;
  scope?: 'ALL' | 'NODE';
}

const INTENT_PATTERNS: Record<string, IntentRule[]> = {
  FORGET: [
    { pattern: /oublie tout sur (.+)/i, extract: '$1', scope: 'ALL', confidence: 0.99 },
    { pattern: /supprime (.+) de ta mémoire/i, extract: '$1', scope: 'NODE', confidence: 0.98 },
    { pattern: /efface (.+)/i, extract: '$1', scope: 'NODE', confidence: 0.95 },
  ],
  MEMORIZE: [
    { pattern: /retiens que (.+)/i, extract: '$1', confidence: 0.99 },
    { pattern: /souviens-toi que (.+)/i, extract: '$1', confidence: 0.99 },
    { pattern: /note que (.+)/i, extract: '$1', confidence: 0.95 },
    { pattern: /mon (.+) est (.+)/i, extract: '$1 est $2', confidence: 0.90 },
  ],
};

runAgent({
  name: 'IntentClassifierAgent',
  init: (runtime: AgentRuntime) => {
    runtime.registerMethod(
      'classify',
      async (payload: unknown): Promise<Intent> => {
        const request = payload as ClassifyRequest;
        const text = request.text.trim();

        for (const [intentType, rules] of Object.entries(INTENT_PATTERNS)) {
          for (const rule of rules) {
            const match = text.match(rule.pattern);
            if (match) {
              const content = rule.extract.replace(/\$(\d+)/g, (_, n) => match[parseInt(n)]);
              log.info(`Intent détecté par Regex: ${intentType}`);
              return {
                type: intentType as 'MEMORIZE' | 'FORGET',
                content: content.trim(),
                scope: rule.scope || 'NODE',
                confidence: rule.confidence,
              } as Intent;
            }
          }
        }

        log.info('Aucune intention spécifique détectée. Type: CHAT.');
        return { type: 'CHAT', confidence: 0.5 };
      }
    );

    runtime.log('info', '[IntentClassifierAgent] Initialisé et prêt.');
  }
});
