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
        console.log('[OIEAgent] 🚀 Initialisation...');
        runtime.log('info', '[OIEAgent] Initialisé et prêt à orchestrer.');
        runtime.log('info', `[OIEAgent] Agents disponibles: ${Array.from(AVAILABLE_AGENTS).join(', ')}`);
        console.log('[OIEAgent] ✅ Prêt à recevoir des requêtes');

        // L'OIE expose une seule méthode de stream : 'executeQuery'
        runtime.registerStreamMethod(
            'executeQuery',
            (payload: any, stream: AgentStreamEmitter) => {
                console.log('[OIEAgent] 📨 Requête reçue:', payload);
                
                // Validation du payload
                if (!payload || typeof payload.query !== 'string') {
                    const error = new Error('Invalid payload: query must be a non-empty string');
                    console.error('[OIEAgent] ❌ Payload invalide:', payload);
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                const { query } = payload;
                
                // Rejeter les queries vides ou trop courtes
                if (query.trim().length === 0) {
                    const error = new Error('Query cannot be empty');
                    console.error('[OIEAgent] ❌ Query vide');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                if (query.trim().length < 2) {
                    const error = new Error('Query is too short (minimum 2 characters)');
                    console.error('[OIEAgent] ❌ Query trop courte');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                console.log('[OIEAgent] 🎯 Query valide:', query);
                runtime.log('info', `Nouvelle requête reçue: "${query}"`);

                // 1. Planification
                runtime.log('info', 'Planification de la tâche...');
                const plan = naiveTaskPlanner(query, {
                    availableAgents: Array.from(AVAILABLE_AGENTS),
                    defaultAgent: DEFAULT_FALLBACK_AGENT,
                });
                
                console.log('[OIEAgent] 📋 Plan généré:', plan);
                runtime.log('info', `Plan généré: utiliser ${plan.agent} (confidence: ${plan.metadata?.confidence}, keywords: ${plan.metadata?.detectedKeywords?.join(', ') || 'none'})`);

                // Vérifier si l'agent choisi est disponible
                let targetAgent = plan.agent;
                if (!AVAILABLE_AGENTS.has(targetAgent)) {
                    console.warn('[OIEAgent] ⚠️ Agent non disponible:', targetAgent, '→ fallback vers', DEFAULT_FALLBACK_AGENT);
                    runtime.log('warn', `Agent ${targetAgent} n'est pas encore implémenté, fallback vers ${DEFAULT_FALLBACK_AGENT}`);
                    targetAgent = DEFAULT_FALLBACK_AGENT;
                } else {
                    console.log('[OIEAgent] ✅ Agent disponible:', targetAgent);
                    runtime.log('info', `Agent ${targetAgent} est disponible et sera utilisé`);
                }

                // 2. Exécution
                console.log('[OIEAgent] 🔄 Appel de', targetAgent, 'avec prompt:', plan.prompt.substring(0, 50) + '...');
                runtime.log('info', `Exécution du plan: appel de ${targetAgent}...`);
                
                // On appelle l'agent en mode stream et on relaie les chunks.
                const streamId = runtime.callAgentStream(
                    targetAgent as any,
                    'generateResponse',
                    [plan.prompt],
                    {
                        onChunk: (chunk: any) => {
                            console.log('[OIEAgent] 📦 Chunk reçu de', targetAgent, '→ relay');
                            // Relayer chaque morceau reçu de l'agent vers l'UI
                            stream.chunk(chunk);
                        },
                        onEnd: (finalPayload: any) => {
                            console.log('[OIEAgent] ✅ Stream terminé de', targetAgent);
                            // Le stream de l'agent est terminé, on termine notre propre stream.
                            runtime.log('info', 'Exécution terminée avec succès.');
                            stream.end(finalPayload);
                        },
                        onError: (error: Error) => {
                            console.error('[OIEAgent] ❌ Erreur de', targetAgent, ':', error);
                            // En cas d'erreur de l'agent, on la propage.
                            runtime.log('error', `Erreur durant l'exécution: ${error.message}`);
                            stream.error(error);
                        }
                    }
                );
                
                console.log('[OIEAgent] 🆔 Stream créé:', streamId);
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
