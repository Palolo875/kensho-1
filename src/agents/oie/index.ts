// src/agents/oie/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { LLMPlanner } from './planner';
import { TaskExecutor } from './executor';
import { GraphWorker } from '../graph';
import { MemoryRetriever } from '../graph/MemoryRetriever';
import type { Intent } from '../intent-classifier';
import { createLogger } from '../../lib/logger';

const log = createLogger('OIEAgent');

runAgent({
    name: 'OIEAgent',
    config: { useNoOpStorage: true },
    init: (runtime: AgentRuntime) => {
        log.info('Initialisation...');
        runtime.log('info', '[OIEAgent] Initialisé et prêt à orchestrer avec LLMPlanner.');
        log.info('Prêt à recevoir des requêtes');

        const planner = new LLMPlanner(runtime);
        const graphWorker = new GraphWorker();
        let memoryRetriever: MemoryRetriever | null = null;
        let isReady = false;

        // Initialisation avec barrier pour éviter les race conditions
        graphWorker.ensureReady().then(() => {
            log.info('GraphWorker initialisé');
            const sqliteManager = graphWorker.getSQLiteManager();
            const hnswManager = graphWorker.getHNSWManager();
            memoryRetriever = new MemoryRetriever(runtime, sqliteManager, hnswManager);
            log.info('MemoryRetriever initialisé');
            isReady = true;
            log.info('Système prêt à traiter les requêtes');
        }).catch(err => {
            log.error('Échec de l\'initialisation du GraphWorker:', err as Error);
            isReady = false;
        });

        // L'OIE expose une seule méthode de stream : 'executeQuery'
        runtime.registerStreamMethod(
            'executeQuery',
            async (payload: any, stream: AgentStreamEmitter) => {
                try {
                    log.debug('Requête reçue:', { payload });
                    
                    // Barrier: Attendre que le système soit prêt avant de traiter
                    if (!isReady) {
                        log.warn('Système en cours d\'initialisation, requête mise en attente');
                        let retries = 0;
                        while (!isReady && retries < 100) {
                            await new Promise(resolve => setTimeout(resolve, 50));
                            retries++;
                        }
                        if (!isReady) {
                            const error = new Error('OIEAgent not ready after initialization timeout');
                            log.error('Timeout d\'initialisation', error);
                            stream.error(error);
                            return;
                        }
                    }
                    
                    // Validation du payload
                    if (!payload || typeof payload.query !== 'string') {
                        const error = new Error('Invalid payload: query must be a non-empty string');
                        log.error('Payload invalide:', { payload });
                        runtime.log('error', error.message);
                        stream.error(error);
                        return;
                    }

                    const { query, attachedFile } = payload;
                    
                    // Rejeter les queries vides ou trop courtes
                    if (query.trim().length === 0) {
                        const error = new Error('Query cannot be empty');
                        log.error('Query vide', error);
                        runtime.log('error', error.message);
                        stream.error(error);
                        return;
                    }

                    if (query.trim().length < 2) {
                        const error = new Error('Query is too short (minimum 2 characters)');
                        log.error('Query trop courte', error);
                        runtime.log('error', error.message);
                        stream.error(error);
                        return;
                    }

                    log.info(`Query valide: ${query}`);
                    runtime.log('info', `Nouvelle requête reçue: "${query}"`);

                    log.info('Classification de l\'intention...');
                    const intent = await runtime.callAgent<Intent>(
                        'IntentClassifierAgent', 'classify', [{ text: query }]
                    );
                    log.info(`Intent détecté: ${intent.type}`);

                    if (intent.type === 'MEMORIZE') {
                        log.info('Intention MEMORIZE détectée');
                        try {
                            await graphWorker.ensureReady();
                            const embedding = await runtime.callAgent<number[]>(
                                'EmbeddingAgent', 'embed', [{ text: intent.content }]
                            );
                            
                            await graphWorker.atomicAddNode({
                                id: crypto.randomUUID(),
                                content: intent.content,
                                embedding: new Float32Array(embedding),
                                type: 'user.stated',
                                provenanceId: crypto.randomUUID(),
                                version: 1,
                                importance: 0.8,
                                createdAt: Date.now(),
                                lastAccessedAt: Date.now(),
                            });
                            
                            stream.chunk({ type: 'text', data: "C'est noté. Je m'en souviendrai." });
                            stream.end();
                            return;
                        } catch (error) {
                            const err = error instanceof Error ? error : new Error(String(error));
                            log.error('Erreur lors de la mémorisation:', err);
                            stream.chunk({ type: 'text', data: "Désolé, je n'ai pas pu enregistrer cette information." });
                            stream.end();
                            return;
                        }
                    }

                    if (intent.type === 'FORGET') {
                        log.info('Intention FORGET détectée');
                        try {
                            await graphWorker.ensureReady();
                            const deletedCount = await graphWorker.deleteNodesByTopic(intent.content);
                            const msg = deletedCount > 0 
                                ? `D'accord, j'ai oublié ${deletedCount} information(s) sur ce sujet.`
                                : "D'accord, j'ai oublié cette information.";
                            stream.chunk({ type: 'text', data: msg });
                            stream.end();
                            return;
                        } catch (error) {
                            const err = error instanceof Error ? error : new Error(String(error));
                            log.error('Erreur lors de l\'oubli:', err);
                            stream.chunk({ type: 'text', data: "Désolé, je n'ai pas pu oublier cette information." });
                            stream.end();
                            return;
                        }
                    }

                    if (memoryRetriever) {
                        log.info('Récupération des souvenirs pertinents...');
                        const memories = await memoryRetriever.retrieve(query);
                        log.debug(`${memories.length} souvenirs récupérés`);
                        if (memories.length > 0) {
                            log.debug('Souvenirs:', { count: memories.length });
                        }
                    }

                    log.info('Début de la planification...');
                    runtime.log('info', 'Planification de la tâche avec LLMPlanner...');
                    
                    const plannerContext = {
                        ...(attachedFile ? {
                            attachedFile: {
                                name: attachedFile.name,
                                type: attachedFile.type,
                            }
                        } : {}),
                        debateModeEnabled: payload.debateModeEnabled !== false
                    };
                    
                    const plan = await planner.generatePlan(query, plannerContext);
                    
                    log.info(`Plan généré`, { steps: plan.steps.length });
                    runtime.log('info', `Plan généré: "${plan.thought}"`);
                    runtime.log('info', `Plan contient ${plan.steps.length} étape(s)`);

                    stream.chunk({ type: 'plan', data: plan });
                    log.info('Plan envoyé à l\'UI');
                    
                    if (plan.type === 'DebatePlan' && plan.steps) {
                        const thoughtSteps = plan.steps.map(step => ({
                            id: step.id || 'unknown',
                            label: step.label || `${step.agent}.${step.action}`,
                            status: 'pending' as const
                        }));
                        stream.chunk({ type: 'thought_process_start', data: { steps: thoughtSteps } });
                        log.info('Structure du processus de pensée envoyée à l\'UI');
                    }

                    log.info('Début de l\'exécution du plan...');
                    runtime.log('info', 'Exécution du plan avec TaskExecutor...');
                    
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
                    
                    log.info('Exécution terminée');
                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue');
                    log.error('Erreur durant l\'orchestration:', err);
                    runtime.log('error', `Erreur durant l'orchestration: ${err.message}`);
                    stream.error(err);
                }
            }
        );

        runtime.registerMethod('getAvailableAgents', () => {
            return {
                available: ['MainLLMAgent', 'CalculatorAgent', 'UniversalReaderAgent'],
                default: 'MainLLMAgent',
            };
        });
    }
});
