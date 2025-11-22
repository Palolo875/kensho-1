// src/agents/oie/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { TaskExecutor, ExecutionContext, Plan } from './executor';
import { getPlannerPrompt, PromptContext } from './prompts';

/**
 * OIE Sprint 4 - Orchestrateur Intelligent d'Exécution
 * Utilise un LLM pour planifier et un TaskExecutor pour exécuter
 */

// Configuration: Activer le planificateur intelligent
const USE_LLM_PLANNER = true; // Mettre à false pour utiliser le planificateur naïf

runAgent({
    name: 'OIEAgent',
    init: (runtime: AgentRuntime) => {
        console.log('[OIEAgent] 🚀 Initialisation Sprint 4...');
        runtime.log('info', '[OIEAgent] Orchestrateur Intelligent avec support multi-agents');
        runtime.log('info', `[OIEAgent] Mode planification: ${USE_LLM_PLANNER ? 'LLM Intelligent' : 'Naïf (mots-clés)'}`);
        console.log('[OIEAgent] ✅ Prêt à orchestrer avec TaskExecutor');

        /**
         * Méthode principale: executeQuery
         * Accepte une requête utilisateur et optionnellement un fichier attaché
         */
        runtime.registerStreamMethod(
            'executeQuery',
            async (payload: any, stream: AgentStreamEmitter) => {
                console.log('[OIEAgent] 📨 Requête reçue:', payload);

                // Validation du payload
                if (!payload || typeof payload.query !== 'string') {
                    const error = new Error('Invalid payload: query must be a non-empty string');
                    console.error('[OIEAgent] ❌ Payload invalide:', payload);
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                const { query, attachedFile } = payload;

                // Validation de la query
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
                runtime.log('info', `Nouvelle requête: "${query}"`);

                if (attachedFile) {
                    console.log('[OIEAgent] 📎 Fichier attaché:', attachedFile.name, `(${attachedFile.size} bytes)`);
                    runtime.log('info', `Fichier attaché: ${attachedFile.name} (${attachedFile.type})`);
                }

                try {
                    // 1. PLANIFICATION
                    runtime.log('info', 'Génération du plan d\'action...');
                    stream.chunk({ type: 'planning', status: 'started' });

                    const plan = await this.generatePlan(runtime, query, attachedFile);

                    console.log('[OIEAgent] 📋 Plan généré:', plan);
                    runtime.log('info', `Plan: ${plan.thought}`);
                    stream.chunk({
                        type: 'planning',
                        status: 'completed',
                        plan: plan.thought,
                        steps: plan.steps.length
                    });

                    // 2. EXÉCUTION
                    runtime.log('info', 'Exécution du plan...');

                    // Créer le contexte d'exécution
                    const context: ExecutionContext = {
                        originalQuery: query,
                        attachedFile: attachedFile ? {
                            buffer: attachedFile.buffer,
                            type: attachedFile.type,
                            name: attachedFile.name,
                            size: attachedFile.size
                        } : undefined
                    };

                    // Créer et exécuter le TaskExecutor
                    const executor = new TaskExecutor(runtime, context);
                    await executor.execute(plan, stream);

                    console.log('[OIEAgent] 🎉 Exécution terminée avec succès');

                } catch (error: any) {
                    console.error('[OIEAgent] ❌ Erreur:', error);
                    runtime.log('error', `Erreur: ${error.message}`);
                    stream.error(error);
                }
            }
        );

        /**
         * Méthode helper: génère un plan d'action
         */
        this.generatePlan = async (
            runtime: AgentRuntime,
            query: string,
            attachedFile?: any
        ): Promise<Plan> => {
            if (!USE_LLM_PLANNER) {
                // Fallback: plan simple pour tests
                return {
                    thought: "Mode fallback: route directement vers MainLLMAgent",
                    steps: [{
                        agent: 'MainLLMAgent',
                        action: 'generateResponse',
                        args: { prompt: query }
                    }]
                };
            }

            // Construire le contexte pour le prompt
            const context: PromptContext = attachedFile ? {
                attachedFile: {
                    name: attachedFile.name,
                    type: attachedFile.type,
                    size: attachedFile.size
                }
            } : {};

            // Générer le prompt système
            const systemPrompt = getPlannerPrompt(query, context);

            console.log('[OIEAgent] 🤖 Appel du LLM pour planification...');

            // Appeler le MainLLMAgent pour générer le plan
            return new Promise((resolve, reject) => {
                let planText = '';

                const streamId = runtime.callAgentStream(
                    'MainLLMAgent',
                    'generateResponse',
                    [systemPrompt],
                    {
                        onChunk: (chunk: any) => {
                            const content = typeof chunk === 'string' ? chunk : chunk?.content || '';
                            planText += content;
                        },
                        onEnd: () => {
                            try {
                                console.log('[OIEAgent] 📄 Plan brut reçu:', planText.substring(0, 200));

                                // Extraire le JSON du plan
                                // Le LLM peut retourner du texte avec des balises markdown
                                let jsonText = planText.trim();

                                // Retirer les balises de code markdown si présentes
                                if (jsonText.startsWith('```')) {
                                    jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
                                }

                                const plan = JSON.parse(jsonText);

                                // Validation basique du plan
                                if (!plan.steps || !Array.isArray(plan.steps)) {
                                    throw new Error('Plan invalide: propriété "steps" manquante ou invalide');
                                }

                                console.log('[OIEAgent] ✅ Plan parsé avec succès');
                                resolve(plan);
                            } catch (error: any) {
                                console.error('[OIEAgent] ❌ Erreur de parsing du plan:', error);
                                console.error('[OIEAgent] Plan reçu:', planText);

                                // Fallback: créer un plan simple
                                resolve({
                                    thought: 'Fallback car erreur de parsing',
                                    steps: [{
                                        agent: 'MainLLMAgent',
                                        action: 'generateResponse',
                                        args: { prompt: query }
                                    }]
                                });
                            }
                        },
                        onError: (error: Error) => {
                            console.error('[OIEAgent] ❌ Erreur LLM:', error);

                            // Fallback: plan simple
                            resolve({
                                thought: 'Fallback car erreur LLM',
                                steps: [{
                                    agent: 'MainLLMAgent',
                                    action: 'generateResponse',
                                    args: { prompt: query }
                                }]
                            });
                        }
                    }
                );
            });
        };

        /**
         * Méthode utilitaire: obtenir la liste des agents disponibles
         */
        runtime.registerMethod('getCapabilities', () => {
            return {
                supportsMultiAgent: true,
                supportsFileAttachments: true,
                supportsLLMPlanning: USE_LLM_PLANNER,
                availableAgents: [
                    'MainLLMAgent',
                    'CalculatorAgent',
                    'UniversalReaderAgent'
                ]
            };
        });
    }
});
