// src/agents/calculator/manifest.ts

export const calculatorManifest = {
    name: 'CalculatorAgent',
    description: 'Un agent de calcul mathématique. Utilise cet outil pour évaluer des expressions mathématiques complexes.',
    methods: [{
        name: 'calculate',
        description: 'Évalue une expression mathématique et retourne le résultat.',
        args: [
            {
                name: 'expression',
                type: 'string',
                description: 'L\'expression mathématique à évaluer (ex: "2 + 2 * 3").'
            }
        ],
        returns: {
            type: 'object',
            description: 'Le résultat du calcul avec des métadonnées.',
            properties: {
                result: { type: 'number', description: 'Le résultat numérique du calcul.' },
                expression: { type: 'string', description: 'L\'expression originale évaluée.' },
                error: { type: 'string', description: 'Message d\'erreur si le calcul a échoué.' }
            }
        }
    }]
};
