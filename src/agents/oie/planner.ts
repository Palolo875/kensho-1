/**
 * Planificateur de tâches naïf pour l'OIE V1
 * Pour l'instant, envoie tout au LLM principal.
 * Dans les sprints futurs, cela contiendra la logique pour choisir entre CodeAgent, VisionAgent, etc.
 */

export function naiveTaskPlanner(query: string): { agent: 'MainLLMAgent'; prompt: string } {
    // Logique "naïve" : pour l'instant, on envoie tout au LLM principal.
    return {
        agent: 'MainLLMAgent',
        prompt: query, // On transmet la requête brute pour l'instant.
    };
}
