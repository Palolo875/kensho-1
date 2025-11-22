/**
 * Planificateur de tâches pour l'OIE
 * Route les requêtes vers les agents appropriés selon leur contenu
 */

import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { JSONExtractor } from '../../core/oie/JSONExtractor';
import { getPlannerPrompt, getFallbackPlannerPrompt } from './prompts';
import { Plan } from './types';

/**
 * Le LLMPlanner est responsable de la génération d'un plan d'action
 * structuré en réponse à une requête utilisateur.
 * 
 * Il utilise un LLM pour générer le plan et le JSONExtractor pour
 * extraire et valider le JSON de la réponse.
 */
export class LLMPlanner {
    constructor(private readonly runtime: AgentRuntime) {}

    /**
     * Génère un plan d'action pour une requête donnée.
     * @param userQuery La requête de l'utilisateur.
     * @returns Un plan d'action structuré.
     */
    public async generatePlan(userQuery: string): Promise<Plan> {
        const startTime = performance.now();
        this.runtime.log('info', '[LLMPlanner] Génération du plan...');
        
        try {
            // 1. Construire le prompt pour le LLM planificateur
            const prompt = getPlannerPrompt(userQuery);

            // 2. Appeler le LLM principal pour obtenir la réponse brute
            // Note: C'est un appel request/response, pas un stream.
            this.runtime.log('info', '[LLMPlanner] Appel du MainLLMAgent pour générer le plan...');
            const llmResponse: string = await this.runtime.callAgent(
                'MainLLMAgent',
                'generateSingleResponse',
                [prompt],
                30000 // Timeout de 30s pour la génération du plan
            ) as string;
            
            this.runtime.log('info', `[LLMPlanner] Réponse brute du LLM reçue (${llmResponse.length} caractères)`);

            // 3. Extraire et valider le JSON
            const planJSON = JSONExtractor.extract(llmResponse);

            // 4. Gérer les échecs et créer un plan de secours
            if (!planJSON || !this.isValidPlan(planJSON)) {
                this.runtime.log('warn', '[LLMPlanner] Échec de l\'extraction d\'un plan JSON valide. Création d\'un plan de secours.');
                
                // Envoyer les métriques d'échec
                const planningTime = performance.now() - startTime;
                this.trackMetrics(planningTime, false, false);
                
                return this.createFallbackPlan(userQuery);
            }

            this.runtime.log('info', `[LLMPlanner] Plan valide extrait. Pensée: "${planJSON.thought}"`);
            
            // 5. Envoyer les métriques de succès
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
