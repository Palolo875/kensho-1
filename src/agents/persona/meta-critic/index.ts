// src/agents/persona/meta-critic/index.ts
import { runAgent } from '../../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../../core/agent-system/AgentRuntime';
import { META_CRITIC_SYSTEM_PROMPT } from './system-prompt';
import { JSONExtractor } from '../../../core/oie/JSONExtractor';

export interface MetaCriticValidation {
    overall_relevance_score: number;
    most_relevant_point: string;
    is_forced: boolean;
}

runAgent({
    name: 'MetaCriticAgent',
    init: (runtime: AgentRuntime) => {
        runtime.log('info', 'MetaCriticAgent (Arbitre) initialisé et prêt à valider les critiques.');

        runtime.registerMethod(
            'validateCritique',
            async (payload: { draft: string; criticism: string }): Promise<MetaCriticValidation> => {
                runtime.log('info', `[MetaCriticAgent] Validation de la critique...`);
                
                const prompt = META_CRITIC_SYSTEM_PROMPT
                    .replace('{{draft_response}}', payload.draft)
                    .replace('{{criticism}}', payload.criticism);
                
                try {
                    const rawResponse = await runtime.callAgent<string>(
                        'MainLLMAgent', 
                        'generateSingleResponse', 
                        [prompt],
                        30000 // Timeout de 30s
                    );

                    runtime.log('info', `[MetaCriticAgent] Réponse brute reçue: ${rawResponse.substring(0, 100)}...`);

                    // Extraire le JSON de manière robuste
                    const validationJson = JSONExtractor.extract(rawResponse);

                    if (!validationJson || typeof validationJson.overall_relevance_score !== 'number') {
                        throw new Error('N\'a pas pu générer une validation JSON valide.');
                    }

                    runtime.log('info', `[MetaCriticAgent] Validation générée: score=${validationJson.overall_relevance_score}, forcée=${validationJson.is_forced}`);
                    return validationJson as MetaCriticValidation;
                    
                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue');
                    runtime.log('error', `[MetaCriticAgent] Échec de la validation: ${err.message}`);
                    throw err;
                }
            }
        );
    }
});
