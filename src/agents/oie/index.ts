// src/agents/oie/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { naiveTaskPlanner } from './planner';

runAgent({
    name: 'OIEAgent',
    init: (runtime: AgentRuntime) => {
        runtime.log('info', '[OIEAgent] Initialisé et prêt à orchestrer.');

        // L'OIE expose une seule méthode de stream : 'executeQuery'
        runtime.registerStreamMethod(
            'executeQuery',
            (payload: any, stream: AgentStreamEmitter) => {
                const { query } = payload;
                runtime.log('info', `Nouvelle requête reçue: "${query}"`);

                // 1. Planification (version naïve)
                runtime.log('info', 'Planification de la tâche...');
                const plan = naiveTaskPlanner(query);
                runtime.log('info', `Plan généré: utiliser ${plan.agent}.`);

                // 2. Exécution
                runtime.log('info', `Exécution du plan: appel de ${plan.agent}...`);
                
                // On appelle l'agent LLM en mode stream et on relaie les chunks.
                runtime.callAgentStream(
                    plan.agent as any,
                    'generateResponse', // La méthode que l'agent LLM exposera
                    [plan.prompt], // Les arguments pour la méthode
                    {
                        onChunk: (chunk: any) => {
                            // Relayer chaque morceau reçu du LLM vers l'UI
                            stream.chunk(chunk);
                        },
                        onEnd: (finalPayload: any) => {
                            // Le stream du LLM est terminé, on termine notre propre stream.
                            runtime.log('info', 'Exécution terminée avec succès.');
                            stream.end(finalPayload);
                        },
                        onError: (error: Error) => {
                            // En cas d'erreur du LLM, on la propage.
                            runtime.log('error', `Erreur durant l'exécution: ${error.message}`);
                            stream.error(error);
                        }
                    }
                );
            }
        );
    }
});
