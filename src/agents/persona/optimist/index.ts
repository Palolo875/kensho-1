// src/agents/persona/optimist/index.ts
import { runAgent } from '../../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../../core/agent-system/AgentRuntime';
import { OPTIMIST_SYSTEM_PROMPT } from './system-prompt';

runAgent({
    name: 'OptimistAgent',
    init: (runtime: AgentRuntime) => {
        runtime.log('info', 'OptimistAgent (Léo) initialisé et prêt à analyser les opportunités.');

        runtime.registerMethod(
            'generateInitialResponse',
            async (payload: { query: string }): Promise<string> => {
                runtime.log('info', `[OptimistAgent] Génération d'une analyse optimiste pour: "${payload.query?.substring(0, 50) || 'vide'}..."`);
                
                const prompt = OPTIMIST_SYSTEM_PROMPT.replace('{{user_query}}', payload.query);
                
                try {
                    // Appel du MainLLMAgent pour l'inférence
                    const response = await runtime.callAgent<string>(
                        'MainLLMAgent', 
                        'generateSingleResponse', 
                        [prompt],
                        30000 // Timeout de 30s
                    ) as Promise<string>;
                    
                    runtime.log('info', '[OptimistAgent] Analyse optimiste générée avec succès');
                    return response as string;
                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue');
                    runtime.log('error', `[OptimistAgent] Échec de la génération: ${err.message}`);
                    throw err;
                }
            }
        );
    }
});
