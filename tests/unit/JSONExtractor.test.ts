// tests/unit/JSONExtractor.test.ts
import { describe, it, expect } from 'vitest';
import { JSONExtractor } from '../../src/core/oie/JSONExtractor';

describe('JSONExtractor', () => {
    const validPlan = { steps: [{ agent: 'TestAgent' }] };
    const validPlanString = JSON.stringify(validPlan);

    const testCases = [
        { 
            name: 'Cas parfait', 
            input: validPlanString, 
            expected: validPlan 
        },
        { 
            name: 'Texte avant', 
            input: `Voici mon plan:\n${validPlanString}`, 
            expected: validPlan 
        },
        { 
            name: 'Texte après', 
            input: `${validPlanString}\nJ'espère que c'est bon.`, 
            expected: validPlan 
        },
        { 
            name: 'Commentaires de ligne', 
            input: `{\n  "steps": [\n    // Première étape\n    { "agent": "TestAgent" }\n  ]\n}`, 
            expected: validPlan 
        },
        { 
            name: 'Commentaires de bloc', 
            input: `{\n  "steps": [/* Details */{ "agent": "TestAgent" }]\n}`, 
            expected: validPlan 
        },
        { 
            name: 'Bloc de code Markdown', 
            input: "```json\n" + validPlanString + "\n```", 
            expected: validPlan 
        },
        { 
            name: 'Virgule finale', 
            input: `{"steps":[{"agent":"TestAgent"}],}`, 
            expected: validPlan 
        },
        { 
            name: 'Guillemets simples (doit échouer)', 
            input: `{'steps':[{'agent':'TestAgent'}]}`, 
            expected: null 
        },
        { 
            name: 'Pas de JSON', 
            input: 'Bonjour, comment vas-tu ?', 
            expected: null 
        },
    ];

    testCases.forEach(({ name, input, expected }) => {
        it(`devrait gérer le cas : ${name}`, () => {
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(expected);
        });
    });

    // Tests supplémentaires pour assurer une couverture complète
    describe('Cas limites supplémentaires', () => {
        it('devrait extraire JSON avec espaces multiples', () => {
            const input = `   \n\n   ${validPlanString}   \n\n   `;
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(validPlan);
        });

        it('devrait gérer JSON complexe avec objets imbriqués', () => {
            const complexPlan = {
                thought: "Analyse de la requête",
                steps: [
                    { 
                        agent: "CalculatorAgent", 
                        method: "calculate",
                        args: { expression: "2 + 2" }
                    },
                    { 
                        agent: "MainLLMAgent", 
                        prompt: "Formule une réponse"
                    }
                ]
            };
            const input = JSON.stringify(complexPlan);
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(complexPlan);
        });

        it('devrait gérer JSON avec commentaires multiples', () => {
            const input = `{
                // Commentaire 1
                "steps": [
                    /* Commentaire bloc 1 */
                    { "agent": "TestAgent" } // Commentaire 2
                    /* Commentaire bloc 2 */
                ]
            }`;
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(validPlan);
        });

        it('devrait retourner null pour JSON incomplet', () => {
            const input = `{"steps": [{"agent": "TestAgent"`;
            const result = JSONExtractor.extract(input);
            expect(result).toBeNull();
        });

        it('devrait retourner null pour texte sans accolades', () => {
            const input = 'Ceci est un texte simple sans JSON';
            const result = JSONExtractor.extract(input);
            expect(result).toBeNull();
        });

        // Tests critiques pour les chaînes contenant des tokens ressemblant à des commentaires
        it('devrait préserver les URLs dans les chaînes JSON', () => {
            const dataWithUrl = {
                steps: [
                    {
                        agent: "TestAgent",
                        url: "https://example.com/api/endpoint"
                    }
                ]
            };
            const input = JSON.stringify(dataWithUrl);
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(dataWithUrl);
        });

        it('devrait préserver les URLs avec commentaires dans le même JSON', () => {
            const input = `{
                // Commentaire avant l'URL
                "steps": [
                    {
                        "agent": "TestAgent",
                        "url": "https://example.com/api/endpoint" // URL importante
                    }
                ]
            }`;
            const expected = {
                steps: [
                    {
                        agent: "TestAgent",
                        url: "https://example.com/api/endpoint"
                    }
                ]
            };
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(expected);
        });

        it('devrait préserver les tokens /* */ dans les chaînes JSON', () => {
            const dataWithCommentLike = {
                steps: [
                    {
                        agent: "TestAgent",
                        note: "Ce texte contient /* du texte */ qui ressemble à des commentaires"
                    }
                ]
            };
            const input = JSON.stringify(dataWithCommentLike);
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(dataWithCommentLike);
        });

        it('devrait préserver les doubles slashes dans les chemins Windows', () => {
            const dataWithPath = {
                steps: [
                    {
                        agent: "TestAgent",
                        path: "C:\\\\Users\\\\Example\\\\file.txt"
                    }
                ]
            };
            const input = JSON.stringify(dataWithPath);
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(dataWithPath);
        });

        it('devrait gérer JSON avec URLs ET commentaires externes', () => {
            const input = `Voici le plan avec une URL:
            {
                "thought": "Utiliser l'API",
                "steps": [
                    {
                        "agent": "APIAgent",
                        "endpoint": "https://api.example.com/v1/data",
                        "method": "GET"
                    }
                ]
            }
            Fin du plan.`;
            const expected = {
                thought: "Utiliser l'API",
                steps: [
                    {
                        agent: "APIAgent",
                        endpoint: "https://api.example.com/v1/data",
                        method: "GET"
                    }
                ]
            };
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(expected);
        });

        it('devrait gérer les chaînes échappées avec guillemets', () => {
            const dataWithEscaped = {
                steps: [
                    {
                        agent: "TestAgent",
                        message: "Il a dit: \"Bonjour\" // avec un commentaire"
                    }
                ]
            };
            const input = JSON.stringify(dataWithEscaped);
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(dataWithEscaped);
        });

        it('devrait gérer JSON complexe avec URLs, commentaires et virgules finales', () => {
            const input = `\`\`\`json
{
    // Configuration du plan
    "thought": "Appel API externe",
    "steps": [
        /* Étape 1 */
        {
            "agent": "APIAgent",
            "url": "https://api.example.com/calculate",
            "params": {
                "expression": "2 + 2" // Expression simple
            }
        },
        // Étape 2
        {
            "agent": "MainLLMAgent",
            "prompt": "Format the response"
        }, // Virgule finale ici
    ]
}
\`\`\``;
            const expected = {
                thought: "Appel API externe",
                steps: [
                    {
                        agent: "APIAgent",
                        url: "https://api.example.com/calculate",
                        params: {
                            expression: "2 + 2"
                        }
                    },
                    {
                        agent: "MainLLMAgent",
                        prompt: "Format the response"
                    }
                ]
            };
            const result = JSONExtractor.extract(input);
            expect(result).toEqual(expected);
        });
    });
});
