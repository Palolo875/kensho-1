/**
 * Planificateur de tâches pour l'OIE
 * Route les requêtes vers les agents appropriés selon leur contenu
 */

import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { JSONExtractor } from '../../core/oie/JSONExtractor';
import { QueryClassifier } from '../../core/oie/QueryClassifier';
import { getPlannerPrompt, getFallbackPlannerPrompt } from './prompts';
import { Plan } from './types';

/**
 * Le LLMPlanner est responsable de la génération d'un plan d'action
 * structuré en réponse à une requête utilisateur.
 * 
 * Il utilise un LLM pour générer le plan et le JSONExtractor pour
 * extraire et valider le JSON de la réponse.
 * 
 * Il utilise aussi le QueryClassifier pour déterminer si la question
 * nécessite un débat interne (DebatePlan) ou une réponse simple.
 */
export class LLMPlanner {
    private queryClassifier = new QueryClassifier();

    constructor(private readonly runtime: AgentRuntime) {}

    /**
     * Génère un plan d'action pour une requête donnée.
     * @param userQuery La requête de l'utilisateur.
     * @param context Le contexte de la requête (fichier attaché, mode débat activé, etc.)
     * @returns Un plan d'action structuré.
     */
    public async generatePlan(userQuery: string, context: { attachedFile?: any; debateModeEnabled?: boolean } = {}): Promise<Plan> {
        const startTime = performance.now();
        this.runtime.log('info', '[LLMPlanner] Génération du plan...');
        
        // Par défaut, le mode débat est activé
        const debateModeEnabled = context.debateModeEnabled !== false;
        
        try {
            // 1. Classifier la question
            const classification = this.queryClassifier.classify(userQuery);
            this.runtime.log('info', `[LLMPlanner] Classification: ${classification}`);
            
            // 2. Si la question est complexe ET que le mode débat est activé,
            //    générer un DebatePlan sans appeler le LLM (le plan est fixe)
            if (classification === 'complex' && debateModeEnabled) {
                this.runtime.log('info', '[LLMPlanner] Question complexe détectée. Génération d\'un DebatePlan.');
                const debatePlan = this.createDebatePlan(userQuery);
                
                // Envoyer les métriques
                const planningTime = performance.now() - startTime;
                this.trackMetrics(planningTime, true, true);
                
                return debatePlan;
            }
            
            // 3. Pour les questions simples, utiliser le LLM pour générer un plan
            const prompt = getPlannerPrompt(userQuery, context);

            // 4. Appeler le LLM principal pour obtenir la réponse brute
            this.runtime.log('info', '[LLMPlanner] Appel du MainLLMAgent pour générer le plan...');
            const llmResponse: string = await this.runtime.callAgent(
                'MainLLMAgent',
                'generateSingleResponse',
                [prompt],
                30000 // Timeout de 30s pour la génération du plan
            ) as string;
            
            this.runtime.log('info', `[LLMPlanner] Réponse brute du LLM reçue (${llmResponse.length} caractères)`);

            // 5. Extraire et valider le JSON
            const planJSON = JSONExtractor.extract(llmResponse);

            // 6. Gérer les échecs et créer un plan de secours
            if (!planJSON || !this.isValidPlan(planJSON)) {
                this.runtime.log('warn', '[LLMPlanner] Échec de l\'extraction d\'un plan JSON valide. Création d\'un plan de secours.');
                
                // Envoyer les métriques d'échec
                const planningTime = performance.now() - startTime;
                this.trackMetrics(planningTime, false, false);
                
                return this.createFallbackPlan(userQuery);
            }

            this.runtime.log('info', `[LLMPlanner] Plan valide extrait. Pensée: "${planJSON.thought}"`);
            
            // 7. Ajouter le type SimplePlan
            planJSON.type = 'SimplePlan';
            
            // 8. Envoyer les métriques de succès
            const planningTime = performance.now() - startTime;
            const usedTool = (planJSON as Plan).steps.some(s => s.agent !== 'MainLLMAgent');
            this.trackMetrics(planningTime, true, usedTool);
            
            return planJSON as Plan;
            
        } catch (error) {
            this.runtime.log('error', `[LLMPlanner] Erreur durant la génération du plan: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
            
            // Envoyer les métriques d'échec
            const planningTime = performance.now() - startTime;
            this.trackMetrics(planningTime, false, false);
            
            // En cas d'erreur, retourner un plan de secours
            return this.createFallbackPlan(userQuery);
        }
    }
    
    /**
     * Crée un DebatePlan V2 fixe pour les questions complexes
     * Le plan inclut maintenant une étape de méta-critique pour valider la pertinence
     * Plan : Optimiste -> Critique -> Méta-Critique -> Synthèse (avec Graceful Degradation)
     */
    private createDebatePlan(userQuery: string): Plan {
        return {
            type: 'DebatePlan',
            thought: 'Cette question nécessite une réflexion approfondie. Je vais procéder par débat interne avec validation de pertinence.',
            steps: [
                {
                    id: 'step1',
                    agent: 'OptimistAgent',
                    action: 'generateInitialResponse',
                    args: { query: userQuery },
                    label: 'Réflexion initiale (Léo)'
                },
                {
                    id: 'step2',
                    agent: 'CriticAgent',
                    action: 'critique',
                    args: { text: '{{step1_result}}' },
                    label: 'Examen critique (Athéna)'
                },
                {
                    id: 'step3',
                    agent: 'MetaCriticAgent',
                    action: 'validateCritique',
                    args: {
                        draft: '{{step1_result}}',
                        criticism: '{{step2_result}}'
                    },
                    label: 'Validation de la critique (Arbitre)'
                },
                {
                    id: 'step4',
                    agent: 'MainLLMAgent',
                    action: 'synthesizeDebate',
                    args: {
                        originalQuery: userQuery,
                        draftResponse: '{{step1_result}}',
                        critique: '{{step2_result}}',
                        validation: '{{step3_result}}'
                    },
                    label: 'Synthèse finale'
                }
            ]
        };
    }

    /**
     * Valide qu'un objet est bien un Plan valide
     */
    private isValidPlan(plan: any): plan is Plan {
        return (
            plan && 
            typeof plan.thought === 'string' && 
            Array.isArray(plan.steps) &&
            plan.steps.length > 0 &&
            plan.steps.every((step: any) => 
                step && 
                typeof step.agent === 'string' &&
                typeof step.action === 'string'
            )
        );
    }

    /**
     * Crée un plan de secours simple qui redirige vers MainLLMAgent
     */
    private createFallbackPlan(userQuery: string): Plan {
        this.runtime.log('info', '[LLMPlanner] Utilisation du plan de secours (fallback vers MainLLMAgent)');
        return {
            thought: "Le plan a échoué, je vais répondre directement.",
            steps: [{
                agent: 'MainLLMAgent',
                action: 'generateResponse',
                args: {},
                prompt: userQuery
            }]
        };
    }

    /**
     * Envoie les métriques au TelemetryWorker (fire-and-forget)
     */
    private trackMetrics(planningTime: number, wasValid: boolean, usedTool: boolean): void {
        this.runtime.callAgent('TelemetryWorker', 'trackPlannerMetric', [{
            planningTime,
            wasValid,
            usedTool,
        }], 1000).catch(() => {
            // Ignorer les erreurs si le TelemetryWorker n'est pas disponible
        });
    }
}

// ============================================================================
// ANCIEN CODE - Planificateur naïf basé sur mots-clés (conservé pour référence)
// ============================================================================

export type AgentType = 'MainLLMAgent' | 'CodeAgent' | 'VisionAgent';

export interface TaskPlan {
    agent: AgentType;
    prompt: string;
    metadata?: {
        detectedKeywords?: string[];
        confidence?: number;
    };
}

export interface PlannerConfig {
    availableAgents?: AgentType[];
    defaultAgent?: AgentType;
}

const DEFAULT_CONFIG: Required<PlannerConfig> = {
    availableAgents: ['MainLLMAgent', 'CodeAgent', 'VisionAgent'],
    defaultAgent: 'MainLLMAgent',
};

/**
 * Normalise une chaîne pour la comparaison (retire les accents)
 */
function normalizeString(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Planificateur de tâches naïf basé sur des mots-clés
 * OBSOLÈTE : Remplacé par LLMPlanner mais conservé pour compatibilité
 */
export function naiveTaskPlanner(query: string, config: PlannerConfig = {}): TaskPlan {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const normalizedQuery = normalizeString(query);
    const detectedKeywords: string[] = [];

    // Règles de routage basées sur mots-clés
    const codeKeywords = ['code', 'fonction', 'function', 'class', 'programmation', 'script', 'debug', 'erreur', 'bug', 'python', 'javascript', 'typescript', 'java', 'c++'];
    const imageKeywords = ['image', 'photo', 'picture', 'vision', 'voir', 'regarde', 'analyse', 'screenshot', 'visuel'];

    // Check pour CodeAgent - on collecte TOUS les mots-clés trouvés
    let hasCodeKeyword = false;
    for (const keyword of codeKeywords) {
        if (normalizedQuery.includes(keyword)) {
            if (!detectedKeywords.includes(keyword)) {
                detectedKeywords.push(keyword);
            }
            hasCodeKeyword = true;
        }
    }

    // Check pour VisionAgent - on collecte TOUS les mots-clés trouvés
    let hasImageKeyword = false;
    for (const keyword of imageKeywords) {
        if (normalizedQuery.includes(keyword)) {
            if (!detectedKeywords.includes(keyword)) {
                detectedKeywords.push(keyword);
            }
            hasImageKeyword = true;
        }
    }

    // Déterminer l'agent cible
    let targetAgent: AgentType = finalConfig.defaultAgent;
    let confidence = 0.5;

    if (hasImageKeyword && finalConfig.availableAgents.includes('VisionAgent')) {
        targetAgent = 'VisionAgent';
        confidence = 0.8;
    } else if (hasCodeKeyword && finalConfig.availableAgents.includes('CodeAgent')) {
        targetAgent = 'CodeAgent';
        confidence = 0.7;
    } else {
        targetAgent = finalConfig.defaultAgent;
        confidence = 0.6;
    }

    return {
        agent: targetAgent,
        prompt: query,
        metadata: {
            detectedKeywords,
            confidence,
        },
    };
}
