/**
 * Types pour le système de planification et d'exécution de l'OIE
 */

/**
 * Une étape individuelle dans un plan d'action
 */
export interface PlanStep {
    /**
     * Identifiant unique de l'étape (ex: "step1", "step2")
     */
    id?: string;
    
    /**
     * Le nom de l'agent à appeler (ex: "CalculatorAgent", "MainLLMAgent")
     */
    agent: string;
    
    /**
     * La méthode ou action à exécuter sur l'agent
     */
    action: string;
    
    /**
     * Arguments à passer à la méthode
     * Peut contenir des placeholders comme {{step1_result}} pour l'interpolation
     */
    args: Record<string, any>;
    
    /**
     * Prompt spécifique pour les agents LLM (optionnel)
     */
    prompt?: string;
    
    /**
     * Label lisible pour l'UI (optionnel)
     */
    label?: string;
}

/**
 * Types de plans supportés
 */
export type PlanType = 'SimplePlan' | 'DebatePlan';

/**
 * Un plan d'action complet généré par le LLMPlanner
 */
export interface Plan {
    /**
     * Le type de plan (SimplePlan ou DebatePlan)
     */
    type?: PlanType;
    
    /**
     * La "pensée" ou raisonnement du planificateur
     * Ce champ explique pourquoi ce plan a été choisi
     */
    thought: string;
    
    /**
     * La séquence d'étapes à exécuter
     */
    steps: PlanStep[];
}

/**
 * Statut d'une étape de pensée pour l'UI
 */
export type ThoughtStepStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Une étape de pensée pour l'affichage dans l'UI
 */
export interface ThoughtStep {
    id: string;
    label: string;
    status: ThoughtStepStatus;
    result?: any;
    error?: string;
}
