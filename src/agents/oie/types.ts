/**
 * Types pour le système de planification et d'exécution de l'OIE
 */

/**
 * Une étape individuelle dans un plan d'action
 */
export interface PlanStep {
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
}

/**
 * Un plan d'action complet généré par le LLMPlanner
 */
export interface Plan {
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
