// src/agents/oie/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { naiveTaskPlanner, AgentType } from './planner';

// Configuration des agents disponibles pour ce sprint
// À mesure que de nouveaux agents sont implémentés, ajoutez-les ici
const AVAILABLE_AGENTS: Set<AgentType> = new Set([
    'MainLLMAgent',
    // 'CodeAgent',     // Sprint futur
    // 'VisionAgent',   // Sprint futur
]);

const DEFAULT_FALLBACK_AGENT: AgentType = 'MainLLMAgent';

runAgent({
    name: 'OIEAgent',
    init: (runtime: AgentRuntime) => {
        runtime.log('info', '[OIEAgent] Initialisé et prêt à orchestrer.');
        runtime.log('info', `[OIEAgent] Agents disponibles: ${Array.from(AVAILABLE_AGENTS).join(', ')}`);

        // L'OIE expose une seule méthode de stream : 'executeQuery'
        runtime.registerStreamMethod(
            'executeQuery',
            (payload: any, stream: AgentStreamEmitter) => {
                // Validation du payload
                if (!payload || typeof payload.query !== 'string') {
                    const error = new Error('Invalid payload: query must be a non-empty string');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                const { query } = payload;
                
                // Rejeter les queries vides ou trop courtes
                if (query.trim().length === 0) {
                    const error = new Error('Query cannot be empty');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                if (query.trim().length < 2) {
                    const error = new Error('Query is too short (minimum 2 characters)');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                runtime.log('info', `Nouvelle requête reçue: "${query}"`);

                // 1. Planification
                runtime.log('info', 'Planification de la tâche...');
                const plan = naiveTaskPlanner(query, {
                    availableAgents: Array.from(AVAILABLE_AGENTS),
                    defaultAgent: DEFAULT_FALLBACK_AGENT,
                });
                
                runtime.log('info', `Plan généré: utiliser ${plan.agent} (confidence: ${plan.metadata?.confidence}, keywords: ${plan.metadata?.detectedKeywords?.join(', ') || 'none'})`);

                // Vérifier si l'agent choisi est disponible
                let targetAgent = plan.agent;
                if (!AVAILABLE_AGENTS.has(targetAgent)) {
                    runtime.log('warn', `Agent ${targetAgent} n'est pas encore implémenté, fallback vers ${DEFAULT_FALLBACK_AGENT}`);
                    targetAgent = DEFAULT_FALLBACK_AGENT;
                } else {
                    runtime.log('info', `Agent ${targetAgent} est disponible et sera utilisé`);
                }

                // 2. Exécution
                runtime.log('info', `Exécution du plan: appel de ${targetAgent}...`);
                
                // On appelle l'agent en mode stream et on relaie les chunks.
                runtime.callAgentStream(
                    targetAgent as any,
                    'generateResponse',
                    [plan.prompt],
                    {
                        onChunk: (chunk: any) => {
                            // Relayer chaque morceau reçu de l'agent vers l'UI
                            stream.chunk(chunk);
                        },
                        onEnd: (finalPayload: any) => {
                            // Le stream de l'agent est terminé, on termine notre propre stream.
                            runtime.log('info', 'Exécution terminée avec succès.');
                            stream.end(finalPayload);
                        },
                        onError: (error: Error) => {
                            // En cas d'erreur de l'agent, on la propage.
                            runtime.log('error', `Erreur durant l'exécution: ${error.message}`);
                            stream.error(error);
                        }
                    }
                );
            }
        );

        // Méthode pour obtenir la liste des agents disponibles
        runtime.registerMethod('getAvailableAgents', () => {
            return {
                available: Array.from(AVAILABLE_AGENTS),
                default: DEFAULT_FALLBACK_AGENT,
            };
        });
    }
});
