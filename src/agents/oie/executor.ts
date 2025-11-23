/**
 * Task Executor pour l'OIE
 * Exécute un plan d'action généré par le LLMPlanner
 */

import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { Plan, PlanStep } from './types';

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

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const isLastStep = i === plan.steps.length - 1;
            const stepId = step.id || `step${i + 1}`;

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
                    
                    // Envoyer le statut 'completed' avec le résultat à l'UI
                    this.sendStepUpdate(stream, stepId, 'completed', result);
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
                this.runtime.log('error', `[TaskExecutor] L'étape ${i + 1} a échoué: ${errorMessage}`);
                
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
                        onEnd: (final) => stream.end(final),
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
     */
    private interpolateArgs(args: Record<string, any>, results: Map<string, any>): Record<string, any> {
        // Cloner les arguments pour ne pas muter le plan original
        let argsStr = JSON.stringify(args);
        
        for (const [key, value] of results.entries()) {
            // Remplacer les placeholders comme {{step1_result}}
            const quotedPlaceholder = `"{{${key}}}"`;  // Placeholder avec guillemets
            const unquotedPlaceholder = `{{${key}}}`;   // Placeholder sans guillemets
            
            // Si le placeholder est entre guillemets dans le JSON, on remplace par la valeur JSON.stringifiée
            if (argsStr.includes(quotedPlaceholder)) {
                argsStr = argsStr.split(quotedPlaceholder).join(JSON.stringify(value));
            }
            // Sinon, si le placeholder est sans guillemets, on stringify aussi (pour objets/nombres)
            else if (argsStr.includes(unquotedPlaceholder)) {
                argsStr = argsStr.split(unquotedPlaceholder).join(JSON.stringify(value));
            }
        }
        
        return JSON.parse(argsStr);
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
}
