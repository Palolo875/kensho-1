// src/agents/calculator/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../core/agent-system/AgentRuntime';

/**
 * Agent de calcul mathématique simple
 * Évalue des expressions mathématiques de manière sécurisée
 */
runAgent({
    name: 'CalculatorAgent',
    init: (runtime: AgentRuntime) => {
        console.log('[CalculatorAgent] 🔢 Initialisation...');
        runtime.log('info', '[CalculatorAgent] Prêt à calculer.');

        runtime.registerMethod('calculate', (expression: string) => {
            try {
                console.log('[CalculatorAgent] 📊 Calcul de:', expression);

                // Validation de base de l'expression
                if (!expression || typeof expression !== 'string') {
                    throw new Error('Expression invalide');
                }

                // Nettoyage de l'expression (sécurité basique)
                const sanitized = expression.trim();

                // Pour une vraie implémentation, utiliser une bibliothèque comme math.js
                // Ici, on utilise eval de manière sécurisée (seulement pour les nombres et opérateurs)
                if (!/^[0-9+\-*/().\s]+$/.test(sanitized)) {
                    throw new Error('Expression contient des caractères non autorisés');
                }

                const result = eval(sanitized);

                console.log('[CalculatorAgent] ✅ Résultat:', result);
                runtime.log('info', `Calcul effectué: ${expression} = ${result}`);

                return {
                    result,
                    expression,
                    error: null
                };
            } catch (error: any) {
                console.error('[CalculatorAgent] ❌ Erreur:', error);
                runtime.log('error', `Erreur de calcul: ${error.message}`);

                return {
                    result: null,
                    expression,
                    error: error.message
                };
            }
        });
    }
});
