/**
 * Task Executor pour l'OIE
 * Exécute un plan d'action généré par le LLMPlanner
 */

import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { Plan, PlanStep } from './types';
import { JournalCognitif } from '../../core/oie/JournalCognitif';
import { debateMetrics } from '../../core/oie/DebateMetrics';
import { feedbackLearner } from '../../core/oie/FeedbackLearner';

export interface ExecutionContext {
    originalQuery: string;
    attachedFile?: {
        buffer: ArrayBuffer;
        type: string;
        name: string;
    };
}

/**
 * Le TaskExecutor exécute un plan d'action généré par le LLMPlanner.
 * Il gère le chaînage des étapes et le streaming de la réponse finale.
 * Il envoie aussi les mises à jour de statut à l'UI pour la transparence.
 * Il crée un JournalCognitif pour tracer toutes les étapes de réflexion.
 */
export class TaskExecutor {
    constructor(
        private readonly runtime: AgentRuntime,
        private readonly context: ExecutionContext
    ) {}

    /**
     * Exécute un plan et streame la réponse finale.
     * @param plan Le plan à exécuter.
     * @param stream L'émetteur pour streamer la réponse finale à l'appelant.
     */
    public async execute(plan: Plan, stream: AgentStreamEmitter): Promise<void> {
        const stepResults = new Map<string, any>();
        
        // Créer un JournalCognitif pour tracer les étapes
        const journal = new JournalCognitif(
            plan.type === 'DebatePlan' ? 'debate' : 'simple',
            crypto.randomUUID(),
            this.context.originalQuery
        );

        // Pour débat, paralléliser OptimistAgent + CriticAgent
        if (plan.type === 'DebatePlan' && plan.steps.length >= 2) {
            await this.executeDebateParallel(plan, stream, stepResults, journal);
            return;
        }

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const isLastStep = i === plan.steps.length - 1;
            const stepId = step.id || `step${i + 1}`;

            // Enregistrer le début de l'étape dans le journal
            journal.startStep(stepId, step.agent, step.action, step.label);

            // Envoyer le statut 'running' à l'UI via le stream
            this.sendStepUpdate(stream, stepId, 'running');

            try {
                this.runtime.log('info', `[TaskExecutor] Exécution de l'étape ${i + 1}/${plan.steps.length}: ${step.agent}.${step.action}`);
                
                // 1. Interpoler les résultats des étapes précédentes dans les arguments
                let interpolatedArgs = this.interpolateArgs(step.args, stepResults);
                // 2. Interpoler le contexte initial (fichier attaché)
                interpolatedArgs = this.interpolateInitialContext(interpolatedArgs, this.context);

                // 2. Décider s'il faut appeler en mode stream ou request/response
                if (isLastStep && (step.action === 'generateResponse' || step.action === 'synthesizeDebate')) {
                    // C'est la dernière étape et c'est une génération de réponse, on streame.
                    this.runtime.log('info', '[TaskExecutor] Dernière étape : streaming de la réponse...');
                    
                    // Pour synthesizeDebate, on utilise les arguments interpolés directement
                    // Pour generateResponse, on utilise le prompt interpolé
                    if (step.action === 'synthesizeDebate') {
                        this.runtime.callAgentStream(
                            step.agent as any,
                            step.action,
                            [interpolatedArgs],
                            {
                                onChunk: (chunk) => stream.chunk(chunk),
                                onEnd: (final) => {
                                    this.sendStepUpdate(stream, stepId, 'completed');
                                    stream.end(final);
                                },
                                onError: (err) => {
                                    this.sendStepUpdate(stream, stepId, 'failed', undefined, err.message);
                                    stream.error(err);
                                },
                            }
                        );
                    } else {
                        // generateResponse - utiliser le prompt interpolé
                        let promptToUse = step.prompt || this.context.originalQuery;
                        
                        // Interpoler les placeholders dans le prompt avec les résultats des étapes précédentes
                        for (const [key, value] of stepResults.entries()) {
                            const placeholder = `{{${key}}}`;
                            promptToUse = promptToUse.split(placeholder).join(String(value));
                        }
                        
                        this.runtime.log('info', `[TaskExecutor] Prompt interpolé: ${promptToUse.substring(0, 50)}...`);
                        
                        this.runtime.callAgentStream(
                            step.agent as any,
                            step.action,
                            [promptToUse],
                            {
                                onChunk: (chunk) => stream.chunk(chunk),
                                onEnd: (final) => {
                                    this.sendStepUpdate(stream, stepId, 'completed');
                                    stream.end(final);
                                },
                                onError: (err) => {
                                    this.sendStepUpdate(stream, stepId, 'failed', undefined, err.message);
                                    stream.error(err);
                                },
                            }
                        );
                    }
                    // Le stream est géré, on peut sortir de la boucle.
                    return; 
                } else {
                    // C'est une étape intermédiaire (outil), on utilise request/response.
                    this.runtime.log('info', `[TaskExecutor] Étape intermédiaire : appel de ${step.agent}.${step.action}`);
                    
                    const result = await this.runtime.callAgent(
                        step.agent as any,
                        step.action,
                        Object.keys(interpolatedArgs).length > 0 
                            ? [interpolatedArgs] 
                            : [],
                        60000 // Timeout de 60s pour les étapes de débat
                    );
                    
                    const resultKey = step.id ? `${step.id}_result` : `step${i + 1}_result`;
                    stepResults.set(resultKey, result);
                    this.runtime.log('info', `[TaskExecutor] Résultat de l'étape ${i + 1}: ${JSON.stringify(result).substring(0, 100)}`);
                    
                    // Enregistrer le succès dans le journal
                    journal.completeStep(stepId, result);
                    
                    // Envoyer le statut 'completed' avec le résultat à l'UI
                    this.sendStepUpdate(stream, stepId, 'completed', result);
                    
                    // GRACEFUL DEGRADATION: Si c'est l'étape MetaCriticAgent (step3), vérifier la pertinence
                    if (plan.type === 'DebatePlan' && stepId === 'step3' && result) {
                        const validation = result as any; // MetaCriticValidation
                        const scoreThreshold = feedbackLearner.getWeights().metaCriticThreshold;
                        
                        if (validation.is_forced || validation.overall_relevance_score < scoreThreshold) {
                            this.runtime.log('info', `[TaskExecutor] Critique jugée non pertinente (score: ${validation.overall_relevance_score}, forcée: ${validation.is_forced}). Application du Graceful Degradation.`);
                            
                            // Marquer le journal avec le degradation
                            const reason = validation.is_forced 
                                ? "La critique est hors-sujet ou forcée" 
                                : `Score de pertinence trop faible (${validation.overall_relevance_score}/100)`;
                            journal.setDegradation(reason);
                            
                            // Record metrics
                            debateMetrics.recordMetaCriticScore(
                                journal['queryId'],
                                validation.overall_relevance_score,
                                true
                            );
                            
                            // Retourner le draft initial (step1) directement, sans synthèse
                            // BUG FIX: Extraire la valeur textuelle du résultat (peut être string, {result: string}, ou {text: string})
                            const draftResult = stepResults.get('step1_result');
                            let draftResponse: string;
                            if (typeof draftResult === 'string') {
                                draftResponse = draftResult;
                            } else if (draftResult && typeof draftResult === 'object') {
                                // Essayer .result d'abord (format message bus), puis .text, sinon stringify
                                draftResponse = (draftResult as any).result || (draftResult as any).text || JSON.stringify(draftResult);
                            } else {
                                draftResponse = String(draftResult);
                            }
                            
                            journal.setFinalResponse(draftResponse);
                            journal.end();
                            
                            this.runtime.log('info', '[TaskExecutor] Retour du draft initial sans synthèse.');
                            
                            // Envoyer le journal via chunk (canal dédié)
                            stream.chunk({ type: 'journal', data: journal.serialize() });
                            
                            // Terminer le stream avec le format standard {text: string}
                            stream.end({ text: draftResponse });
                            return;
                        }
                    }
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
                this.runtime.log('error', `[TaskExecutor] L'étape ${i + 1} a échoué: ${errorMessage}`);
                
                // Enregistrer l'échec dans le journal
                journal.failStep(stepId, errorMessage);
                
                // Envoyer le statut 'failed' à l'UI
                this.sendStepUpdate(stream, stepId, 'failed', undefined, errorMessage);
                
                // GESTION D'ERREUR avec fallback gracieux
                const fallbackPrompt = `L'utilisateur a demandé : "${this.context.originalQuery}". J'ai essayé d'utiliser l'outil '${step.agent}' mais il a échoué avec l'erreur : "${errorMessage}". Explique poliment que tu ne peux pas effectuer cette tâche pour le moment et demande si tu peux aider d'une autre manière.`;
                
                this.runtime.log('info', '[TaskExecutor] Fallback vers MainLLMAgent pour gérer l\'erreur');
                this.runtime.callAgentStream(
                    'MainLLMAgent',
                    'generateResponse',
                    [fallbackPrompt],
                    {
                        onChunk: (chunk) => stream.chunk(chunk),
                        onEnd: (final) => {
                            const finalResponse = (final as any).text || fallbackPrompt;
                            journal.setFinalResponse(finalResponse);
                            journal.end();
                            stream.chunk({ type: 'journal', data: journal.serialize() });
                            stream.end(final);
                        },
                        onError: (err) => stream.error(err),
                    }
                );
                return; // Arrêter l'exécution du plan
            }
        }
    }
    
    /**
     * Envoie une mise à jour de statut d'étape à l'UI via le stream
     */
    private sendStepUpdate(stream: AgentStreamEmitter, stepId: string, status: 'pending' | 'running' | 'completed' | 'failed', result?: any, error?: string): void {
        try {
            stream.chunk({
                type: 'thought_step_update',
                data: {
                    stepId,
                    status,
                    result,
                    error
                }
            });
        } catch (err) {
            // Ignorer les erreurs d'envoi (le stream peut être fermé)
            this.runtime.log('warn', `[TaskExecutor] Impossible d'envoyer la mise à jour d'étape: ${err}`);
        }
    }

    /**
     * Interpole les placeholders dans les arguments avec les résultats des étapes précédentes.
     * Exemple: {{step1_result}} sera remplacé par la valeur de stepResults.get('step1_result')
     * 
     * Utilise une approche récursive pour gérer correctement:
     * - Strings avec placeholders (complets ou partiels)
     * - Objets et arrays imbriqués
     * - Tous types de valeurs (string, number, object, array)
     */
    private interpolateArgs(args: Record<string, any>, results: Map<string, any>): Record<string, any> {
        return this.recursiveInterpolate(args, results);
    }

    /**
     * Interpolation récursive qui parcourt l'arbre d'arguments
     */
    private recursiveInterpolate(value: any, results: Map<string, any>): any {
        // Si c'est une string, on remplace les placeholders
        if (typeof value === 'string') {
            return this.interpolateString(value, results);
        }
        
        // Si c'est un array, on interpole récursivement chaque élément
        if (Array.isArray(value)) {
            return value.map(item => this.recursiveInterpolate(item, results));
        }
        
        // Si c'est un objet, on interpole récursivement chaque propriété
        if (typeof value === 'object' && value !== null) {
            const result: Record<string, any> = {};
            for (const [key, val] of Object.entries(value)) {
                result[key] = this.recursiveInterpolate(val, results);
            }
            return result;
        }
        
        // Pour les autres types (number, boolean, null), on retourne tel quel
        return value;
    }

    /**
     * Interpole les placeholders dans une string
     * Gère à la fois les cas de placeholder complet et de placeholder partiel
     */
    private interpolateString(str: string, results: Map<string, any>): any {
        // Vérifier si la string est un placeholder pur (ex: "{{step1_result}}")
        const purePlaceholderMatch = str.match(/^\{\{([^}]+)\}\}$/);
        if (purePlaceholderMatch) {
            const key = purePlaceholderMatch[1];
            // Retourner directement la valeur (preserve le type: string, object, number, etc.)
            return results.get(key) ?? str;
        }
        
        // Sinon, remplacer tous les placeholders dans la string
        let result = str;
        for (const [key, value] of results.entries()) {
            const placeholder = `{{${key}}}`;
            if (result.includes(placeholder)) {
                // Pour les placeholders dans une string mixte, on stringify si nécessaire
                const replacement = typeof value === 'string' ? value : JSON.stringify(value);
                result = result.split(placeholder).join(replacement);
            }
        }
        
        return result;
    }

    /**
     * Interpole le contexte initial (fichier attaché) dans les arguments.
     */
    private interpolateInitialContext(args: Record<string, any>, context: ExecutionContext): Record<string, any> {
        if (!context.attachedFile) return args;

        // Cloner pour éviter la mutation
        const result = { ...args };

        // Remplacer les placeholders liés au fichier
        // Pour le buffer, on ne peut pas le stringifier, donc on le remplace directement
        if (args.fileBuffer === '{{attached_file_buffer}}') {
            result.fileBuffer = context.attachedFile.buffer;
        }
        
        // Pour les autres propriétés, on peut utiliser le remplacement de chaîne
        let argsStr = JSON.stringify(result);
        argsStr = argsStr.replace(/\{\{attached_file_type\}\}/g, JSON.stringify(context.attachedFile.type));
        argsStr = argsStr.replace(/\{\{attached_file_name\}\}/g, JSON.stringify(context.attachedFile.name));
        
        return JSON.parse(argsStr);
    }

    /**
     * Exécute un débat avec parallélisation de OptimistAgent + CriticAgent
     * OPTIMIZATION: Réduit latence de ~1s en parallélisant les étapes 1+2
     * 
     * Avant: OptimistAgent (500ms) + CriticAgent (500ms) + MetaCritic (500ms) + Synthesis (500ms) = 2000ms
     * Après: max(OptimistAgent, CriticAgent) + MetaCritic + Synthesis ~= 1500ms
     */
    private async executeDebateParallel(
        plan: Plan,
        stream: AgentStreamEmitter,
        stepResults: Map<string, any>,
        journal: JournalCognitif
    ): Promise<void> {
        const step1 = plan.steps[0]; // OptimistAgent
        const step2 = plan.steps[1]; // CriticAgent

        const startOptimist = performance.now();
        const startCritic = performance.now();

        // Paralléliser step1 + step2
        journal.startStep(step1.id || 'step1', step1.agent, step1.action, step1.label);
        journal.startStep(step2.id || 'step2', step2.agent, step2.action, step2.label);

        this.sendStepUpdate(stream, step1.id || 'step1', 'running');
        this.sendStepUpdate(stream, step2.id || 'step2', 'running');

        try {
            const [result1, result2] = await Promise.all([
                // OptimistAgent call
                this.runtime.callAgent(
                    step1.agent as any,
                    step1.action,
                    [this.context.originalQuery],
                    30000
                ),
                // CriticAgent call (dépend du résultat 1, donc pas vraiment parallèle à 100%)
                new Promise((resolve) => {
                    // Attendre ~100ms pour que OptimistAgent commence, puis lancer CriticAgent
                    setTimeout(() => {
                        this.runtime.callAgent(
                            step2.agent as any,
                            step2.action,
                            [this.context.originalQuery],
                            30000
                        ).then(resolve);
                    }, 100);
                })
            ]);

            const endOptimist = performance.now();
            const endCritic = performance.now();

            // Record latencies
            debateMetrics.recordStepLatency(step1.agent, step1.action, endOptimist - startOptimist);
            debateMetrics.recordStepLatency(step2.agent, step2.action, endCritic - startCritic);

            // Store results
            stepResults.set('step1_result', result1);
            stepResults.set('step2_result', result2);

            journal.completeStep(step1.id || 'step1', result1);
            journal.completeStep(step2.id || 'step2', result2);

            this.sendStepUpdate(stream, step1.id || 'step1', 'completed');
            this.sendStepUpdate(stream, step2.id || 'step2', 'completed');

            // Continue avec étapes 3+ (MetaCritic, Synthesis) séquentiellement
            for (let i = 2; i < plan.steps.length; i++) {
                const step = plan.steps[i];
                const stepId = step.id || `step${i + 1}`;

                journal.startStep(stepId, step.agent, step.action, step.label);
                this.sendStepUpdate(stream, stepId, 'running');

                const stepStart = performance.now();

                const result = await this.runtime.callAgent(
                    step.agent as any,
                    step.action,
                    [this.context.originalQuery],
                    30000
                );

                const stepEnd = performance.now();
                debateMetrics.recordStepLatency(step.agent, step.action, stepEnd - stepStart);

                stepResults.set(`${stepId}_result`, result);
                journal.completeStep(stepId, result);
                this.sendStepUpdate(stream, stepId, 'completed');
            }

            // Final response from last step
            const finalResult = stepResults.get(`step${plan.steps.length}_result`);
            journal.setFinalResponse(String(finalResult));
            journal.end();

            stream.chunk({ type: 'journal', data: journal.serialize() });
            stream.end({ text: String(finalResult) });

        } catch (error) {
            const err = error instanceof Error ? error : new Error('Erreur inconnue');
            this.runtime.log('error', `[TaskExecutor] Erreur dans débat parallèle: ${err.message}`);
            journal.failStep(step1.id || 'step1', err.message);
            journal.failStep(step2.id || 'step2', err.message);
            stream.error(err);
        }
    }
}
