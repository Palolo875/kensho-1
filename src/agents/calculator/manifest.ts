/**
 * Le manifeste décrit les capacités du CalculatorAgent au reste du système,
 * en particulier au LLMPlanner.
 */
export const calculatorManifest = {
    name: 'CalculatorAgent',
    description: 'Un expert en calculs numériques purs. Utilise cet outil pour toute requête nécessitant une évaluation mathématique précise (opérations arithmétiques, fonctions mathématiques comme sqrt, sin, cos, etc.). Ne supporte PAS les conversions d\'unités.',
    methods: [
        {
            name: 'calculate',
            description: 'Évalue une expression mathématique et retourne un nombre. Supporte les opérations de base (+, -, *, /, ^), les fonctions mathématiques (sqrt, sin, cos, tan, abs, min, max, log, etc.) et les parenthèses.',
            args: [
                { 
                    name: 'expression', 
                    type: 'string', 
                    description: 'L\'expression mathématique à évaluer. Exemples valides: "2 * (3 + 4)^2", "sqrt(16) + 5", "sin(pi/2)". Ne pas inclure d\'unités (cm, kg, etc.).' 
                }
            ]
        }
    ]
};
