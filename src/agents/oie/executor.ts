// src/agents/oie/executor.ts
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';

/**
 * Représente un plan d'action généré par le LLMPlanner
 */
export interface Plan {
    thought: string;
    steps: PlanStep[];
}

export interface PlanStep {
    agent: string;
    action: string;
    args: Record<string, any>;
}

/**
 * Contexte d'exécution contenant la requête et les fichiers attachés
 */
export interface ExecutionContext {
    originalQuery: string;
    attachedFile?: {
        buffer: ArrayBuffer;
        type: string;
        name: string;
        size: number;
    };
}

/**
 * Résultat d'exécution d'une étape
 */
interface StepResult {
    stepNumber: number;
    agent: string;
    action: string;
    result: any;
    error?: Error;
}

/**
 * TaskExecutor - Exécute un plan d'action multi-agents
 * Gère l'interpolation des résultats entre les étapes
 */
export class TaskExecutor {
    constructor(
        private readonly runtime: AgentRuntime,
        private readonly context: ExecutionContext
    ) { }

    /**
     * Exécute un plan d'action complet
     */
    public async execute(plan: Plan, stream: AgentStreamEmitter): Promise<void> {
        console.log('[TaskExecutor] 🚀 Début de l\'exécution du plan');
        console.log('[TaskExecutor] 💭 Stratégie:', plan.thought);
        this.runtime.log('info', `Exécution du plan: ${plan.thought}`);

        // Map pour stocker les résultats des étapes précédentes
        const stepResults = new Map<string, any>();

        // Émettre le plan complet au début
        stream.chunk({
            type: 'plan',
            thought: plan.thought,
            totalSteps: plan.steps.length
        });

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const stepNumber = i + 1;
            const stepKey = `step${stepNumber}`;

            console.log(`[TaskExecutor] 📍 Étape ${stepNumber}/${plan.steps.length}: ${step.agent}.${step.action}`);
            this.runtime.log('info', `Étape ${stepNumber}: Appel de ${step.agent}.${step.action}`);

            // Émettre le début de l'étape
            stream.chunk({
                type: 'step_start',
                stepNumber,
                agent: step.agent,
                action: step.action
            });

            try {
                // 1. Interpoler le contexte initial (fichier attaché)
                let interpolatedArgs = this.interpolateInitialContext(step.args, this.context);

                // 2. Interpoler les résultats des étapes précédentes
                interpolatedArgs = this.interpolateStepResults(interpolatedArgs, stepResults);

                console.log(`[TaskExecutor] 📦 Arguments interpolés:`, JSON.stringify(interpolatedArgs).substring(0, 200));

                // 3. Appeler l'agent
                const result = await this.callAgent(step.agent, step.action, interpolatedArgs, stream, stepNumber);

                // 4. Stocker le résultat pour les étapes suivantes
                stepResults.set(stepKey, result);
                stepResults.set(`${stepKey}_result`, result); // Alias pour compatibilité

                console.log(`[TaskExecutor] ✅ Étape ${stepNumber} terminée`);
                this.runtime.log('info', `Étape ${stepNumber} réussie`);

                // Émettre la fin de l'étape
                stream.chunk({
                    type: 'step_end',
                    stepNumber,
                    agent: step.agent,
                    action: step.action,
                    success: true
                });

            } catch (error: any) {
                console.error(`[TaskExecutor] ❌ Erreur à l'étape ${stepNumber}:`, error);
                this.runtime.log('error', `Erreur à l'étape ${stepNumber}: ${error.message}`);

                // Émettre l'erreur de l'étape
                stream.chunk({
                    type: 'step_end',
                    stepNumber,
                    agent: step.agent,
                    action: step.action,
                    success: false,
                    error: error.message
                });

                // Propager l'erreur pour arrêter l'exécution
                throw error;
            }
        }

        console.log('[TaskExecutor] 🎉 Plan exécuté avec succès');
        this.runtime.log('info', 'Plan exécuté avec succès');

        // La dernière étape a normalement déjà émis sa réponse en streaming
        // On termine proprement le stream
        stream.end({
            type: 'plan_complete',
            totalSteps: plan.steps.length
        });
    }

    /**
     * Interpole le contexte initial (fichiers attachés) dans les arguments
     */
    private interpolateInitialContext(
        args: Record<string, any>,
        context: ExecutionContext
    ): Record<string, any> {
        if (!context.attachedFile) {
            return args;
        }

        // Cloner pour éviter la mutation
        const clonedArgs = { ...args };

        // Remplacer les placeholders liés au fichier
        for (const [key, value] of Object.entries(clonedArgs)) {
            if (typeof value === 'string') {
                // Cas spécial pour le buffer qui ne peut pas être stringifié
                if (value === '{{attached_file_buffer}}') {
                    clonedArgs[key] = context.attachedFile.buffer;
                } else if (value.includes('{{attached_file_type}}')) {
                    clonedArgs[key] = value.replace(/\{\{attached_file_type\}\}/g, context.attachedFile.type);
                } else if (value.includes('{{attached_file_name}}')) {
                    clonedArgs[key] = value.replace(/\{\{attached_file_name\}\}/g, context.attachedFile.name);
                } else if (value.includes('{{attached_file_size}}')) {
                    clonedArgs[key] = value.replace(/\{\{attached_file_size\}\}/g, String(context.attachedFile.size));
                }
            }
        }

        return clonedArgs;
    }

    /**
     * Interpole les résultats des étapes précédentes dans les arguments
     * Supporte les notations:
     * - {{step1_result}} -> résultat complet de l'étape 1
     * - {{step1_result.property}} -> propriété spécifique
     * - {{step1_result.a ?? step1_result.b}} -> fallback (si a existe, utilise a, sinon b)
     */
    private interpolateStepResults(
        args: Record<string, any>,
        results: Map<string, any>
    ): Record<string, any> {
        if (results.size === 0) {
            return args;
        }

        // Convertir en JSON pour faire le remplacement de texte
        let argsStr = JSON.stringify(args);

        // Pattern pour capturer les interpolations
        // Supporte: {{stepX_result}}, {{stepX_result.prop}}, {{stepX_result.a ?? stepX_result.b}}
        const pattern = /\{\{([^}]+)\}\}/g;

        argsStr = argsStr.replace(pattern, (match, expression) => {
            try {
                // Gérer le fallback (operator ??)
                if (expression.includes('??')) {
                    const parts = expression.split('??').map(p => p.trim());
                    for (const part of parts) {
                        const value = this.evaluateExpression(part, results);
                        if (value !== undefined && value !== null && value !== '') {
                            return JSON.stringify(value);
                        }
                    }
                    return 'null';
                }

                // Expression simple
                const value = this.evaluateExpression(expression, results);
                return JSON.stringify(value);
            } catch (error) {
                console.warn(`[TaskExecutor] ⚠️ Impossible d'interpoler "${expression}":`, error);
                return match; // Garder le placeholder original
            }
        });

        return JSON.parse(argsStr);
    }

    /**
     * Évalue une expression d'interpolation
     * Ex: "step1_result.summary" -> récupère results.get('step1').summary
     */
    private evaluateExpression(expression: string, results: Map<string, any>): any {
        const parts = expression.split('.');
        const stepKey = parts[0].trim();

        let value = results.get(stepKey);
        if (value === undefined) {
            throw new Error(`Résultat "${stepKey}" non trouvé`);
        }

        // Naviguer dans les propriétés
        for (let i = 1; i < parts.length; i++) {
            const prop = parts[i].trim();
            value = value[prop];
            if (value === undefined) {
                throw new Error(`Propriété "${prop}" non trouvée dans ${parts.slice(0, i).join('.')}`);
            }
        }

        return value;
    }

    /**
     * Appelle un agent avec les arguments interpolés
     */
    private async callAgent(
        agentName: string,
        methodName: string,
        args: Record<string, any>,
        stream: AgentStreamEmitter,
        stepNumber: number
    ): Promise<any> {
        // Déterminer si la méthode est en streaming
        const isStreamingMethod = methodName === 'generateResponse';

        if (isStreamingMethod) {
            // Appel en mode streaming
            return new Promise((resolve, reject) => {
                let fullResponse = '';

                const streamId = this.runtime.callAgentStream(
                    agentName as any,
                    methodName,
                    Object.values(args),
                    {
                        onChunk: (chunk: any) => {
                            // Relayer le chunk avec le numéro d'étape
                            stream.chunk({
                                type: 'agent_chunk',
                                stepNumber,
                                agent: agentName,
                                chunk
                            });

                            // Accumuler pour le résultat final
                            if (typeof chunk === 'string') {
                                fullResponse += chunk;
                            } else if (chunk?.content) {
                                fullResponse += chunk.content;
                            }
                        },
                        onEnd: (finalPayload: any) => {
                            resolve(fullResponse || finalPayload);
                        },
                        onError: (error: Error) => {
                            reject(error);
                        }
                    }
                );

                console.log(`[TaskExecutor] 🆔 Stream créé pour ${agentName}:`, streamId);
            });
        } else {
            // Appel synchrone (méthode régulière)
            const argsArray = Object.values(args);
            const result = await this.runtime.callAgent(agentName as any, methodName, argsArray);
            return result;
        }
    }
}
