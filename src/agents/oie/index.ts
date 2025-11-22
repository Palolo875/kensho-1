// src/agents/oie/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { LLMPlanner } from './planner';
import { TaskExecutor } from './executor';

runAgent({
    name: 'OIEAgent',
    init: (runtime: AgentRuntime) => {
        console.log('[OIEAgent] 🚀 Initialisation...');
        runtime.log('info', '[OIEAgent] Initialisé et prêt à orchestrer avec LLMPlanner.');
        console.log('[OIEAgent] ✅ Prêt à recevoir des requêtes');

        // Instancier le planificateur
        const planner = new LLMPlanner(runtime);

        // L'OIE expose une seule méthode de stream : 'executeQuery'
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

                try {
                    // 1. Planification avec le LLMPlanner
                    console.log('[OIEAgent] 🧠 Début de la planification...');
                    runtime.log('info', 'Planification de la tâche avec LLMPlanner...');
                    
                    // Préparer le contexte pour le planificateur
                    const plannerContext = attachedFile ? {
                        attachedFile: {
                            name: attachedFile.name,
                            type: attachedFile.type,
                        }
                    } : {};
                    
                    const plan = await planner.generatePlan(query, plannerContext);
                    
                    console.log('[OIEAgent] 📋 Plan généré:', plan);
                    runtime.log('info', `Plan généré: "${plan.thought}"`);
                    runtime.log('info', `Plan contient ${plan.steps.length} étape(s)`);

                    // Envoyer le plan à l'UI pour affichage
                    stream.chunk({ type: 'plan', data: plan });
                    console.log('[OIEAgent] 📤 Plan envoyé à l\'UI');

                    // 2. Exécution avec le TaskExecutor
                    console.log('[OIEAgent] ⚙️ Début de l\'exécution du plan...');
                    runtime.log('info', 'Exécution du plan avec TaskExecutor...');
                    
                    // Préparer le contexte d'exécution
                    const executionContext = {
                        originalQuery: query,
                        attachedFile: attachedFile ? {
                            buffer: attachedFile.buffer,
                            type: attachedFile.type,
                            name: attachedFile.name,
                        } : undefined
                    };
                    
                    const executor = new TaskExecutor(runtime, executionContext);
                    await executor.execute(plan, stream);
                    
                    console.log('[OIEAgent] ✅ Exécution terminée');
                    
                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue');
                    console.error('[OIEAgent] ❌ Erreur durant l\'orchestration:', err);
                    runtime.log('error', `Erreur durant l'orchestration: ${err.message}`);
                    stream.error(err);
                }
            }
        );

        // Méthode pour obtenir la liste des agents disponibles
        runtime.registerMethod('getAvailableAgents', () => {
            return {
                available: ['MainLLMAgent', 'CalculatorAgent', 'UniversalReaderAgent'],
                default: 'MainLLMAgent',
            };
        });
    }
});
