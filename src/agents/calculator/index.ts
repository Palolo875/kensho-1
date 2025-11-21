import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { evaluateExpression } from './logic';

runAgent({
    name: 'CalculatorAgent',
    init: (runtime: AgentRuntime) => {
        runtime.log('info', 'CalculatorAgent initialisé et prêt à calculer.');

        runtime.registerMethod(
            'calculate',
            async (payload: { expression: string }) => {
                const { expression } = payload;
                runtime.log('info', `Réception d'une demande de calcul pour: "${expression}"`);

                try {
                    const result = evaluateExpression(expression);
                    runtime.log('info', `Calcul réussi. Résultat: ${result}`);
                    return result;

                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur de calcul inconnue.');
                    runtime.log('error', `Échec du calcul pour "${expression}": ${err.message}`);
                    throw err;
                }
            }
        );
    }
});
