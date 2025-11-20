/**
 * Planificateur de tâches pour l'OIE
 * Route les requêtes vers les agents appropriés selon leur contenu
 */

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
 * Dans les sprints futurs, cela utilisera un LLM pour classifier les requêtes
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
