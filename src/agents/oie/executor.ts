/**
 * Task Executor pour l'OIE
 * Exécute un plan d'action généré par le LLMPlanner
 */

import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { Plan, PlanStep } from './types';

/**
 * Le TaskExecutor exécute un plan d'action généré par le LLMPlanner.
 * Il gère le chaînage des étapes et le streaming de la réponse finale.
 */
export class TaskExecutor {
    constructor(
        private readonly runtime: AgentRuntime,
        private readonly originalQuery: string
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

            try {
                this.runtime.log('info', `[TaskExecutor] Exécution de l'étape ${i + 1}/${plan.steps.length}: ${step.agent}.${step.action}`);
                
                // 1. Interpoler les résultats des étapes précédentes dans les arguments
                const interpolatedArgs = this.interpolateArgs(step.args, stepResults);

                // 2. Décider s'il faut appeler en mode stream ou request/response
                if (isLastStep && step.action === 'generateResponse') {
                    // C'est la dernière étape et c'est une génération de réponse, on streame.
                    this.runtime.log('info', '[TaskExecutor] Dernière étape : streaming de la réponse...');
                    
                    // Utiliser le champ prompt et l'interpoler avec les résultats précédents
                    let promptToUse = step.prompt || this.originalQuery;
                    
                    // Interpoler les placeholders dans le prompt avec les résultats des étapes précédentes
                    for (const [key, value] of stepResults.entries()) {
                        const placeholder = `{{${key}}}`;
                        // Remplacer les placeholders dans le prompt
                        promptToUse = promptToUse.split(placeholder).join(String(value));
                    }
                    
                    this.runtime.log('info', `[TaskExecutor] Prompt interpolé: ${promptToUse.substring(0, 50)}...`);
                    
                    this.runtime.callAgentStream(
                        step.agent as any,
                        step.action,
                        [promptToUse],
                        {
                            onChunk: (chunk) => stream.chunk(chunk),
                            onEnd: (final) => stream.end(final),
                            onError: (err) => stream.error(err),
                        }
                    );
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
                        30000 // Timeout de 30s pour les outils
                    );
                    
                    stepResults.set(`step${i + 1}_result`, result);
                    this.runtime.log('info', `[TaskExecutor] Résultat de l'étape ${i + 1}: ${JSON.stringify(result).substring(0, 100)}`);
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
                this.runtime.log('error', `[TaskExecutor] L'étape ${i + 1} a échoué: ${errorMessage}`);
                
                // GESTION D'ERREUR avec fallback gracieux
                const fallbackPrompt = `L'utilisateur a demandé : "${this.originalQuery}". J'ai essayé d'utiliser l'outil '${step.agent}' mais il a échoué avec l'erreur : "${errorMessage}". Explique poliment que tu ne peux pas effectuer cette tâche pour le moment et demande si tu peux aider d'une autre manière.`;
                
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
     * Interpole les placeholders dans les arguments avec les résultats des étapes précédentes.
     * Exemple: {{step1_result}} sera remplacé par la valeur de stepResults.get('step1_result')
     */
    private interpolateArgs(args: Record<string, any>, results: Map<string, any>): Record<string, any> {
        // Cloner les arguments pour ne pas muter le plan original
        let argsStr = JSON.stringify(args);
        
        for (const [key, value] of results.entries()) {
            // Remplacer les placeholders comme {{step1_result}}
            const placeholder = `{{${key}}}`;
            // Important: On remplace le placeholder par la valeur JSON.stringifiée
            // pour gérer correctement les chaînes, nombres, etc.
            argsStr = argsStr.split(placeholder).join(JSON.stringify(value));
        }
        
        return JSON.parse(argsStr);
    }
}
