// src/agents/persona/critic/index.ts
import { runAgent } from '../../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../../core/agent-system/AgentRuntime';
import { CRITIC_SYSTEM_PROMPT } from './system-prompt';
import { JSONExtractor } from '../../../core/oie/JSONExtractor';

export interface Critique {
    major_flaw: string;
    evidence: string;
    suggested_fix: string;
}

runAgent({
    name: 'CriticAgent',
    init: (runtime: AgentRuntime) => {
        runtime.log('info', 'CriticAgent (Athéna) initialisé et prêt à identifier les risques.');

        runtime.registerMethod(
            'critique',
            async (payload: { text: string }): Promise<Critique> => {
                runtime.log('info', `[CriticAgent] Analyse critique du texte: "${payload.text.substring(0, 50)}..."`);
                
                const prompt = CRITIC_SYSTEM_PROMPT.replace('{{text_to_critique}}', payload.text);
                
                try {
                    const rawResponse = await runtime.callAgent<string>(
                        'MainLLMAgent', 
                        'generateSingleResponse', 
                        [prompt],
                        30000 // Timeout de 30s
                    );

                    runtime.log('info', `[CriticAgent] Réponse brute reçue: ${rawResponse.substring(0, 100)}...`);

                    // Utiliser notre extracteur JSON robuste pour garantir un output valide
                    const critiqueJson = JSONExtractor.extract(rawResponse);

                    if (!critiqueJson || !critiqueJson.major_flaw) {
                        throw new Error('N\'a pas pu générer une critique JSON valide.');
                    }

                    runtime.log('info', `[CriticAgent] Critique générée avec succès: ${critiqueJson.major_flaw}`);
                    return critiqueJson as Critique;
                    
                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue');
                    runtime.log('error', `[CriticAgent] Échec de la génération: ${err.message}`);
                    throw err;
                }
            }
        );
    }
});
