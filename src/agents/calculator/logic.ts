import { create, all } from 'mathjs';

/**
 * Créer une instance de mathjs avec une configuration sécurisée
 */
const math = create(all, {
    epsilon: 1e-12,
    matrix: 'Matrix',
    number: 'number',
    precision: 64,
    predictable: false,
    randomSeed: null
});

/**
 * Évalue une expression mathématique de manière sécurisée.
 * Cette fonction est extraite pour faciliter les tests unitaires.
 * 
 * @param expression - L'expression mathématique à évaluer (ex: "2 + 2", "sqrt(16)")
 * @returns Le résultat du calcul (nombre ou string)
 * @throws Error si l'expression est invalide ou produit un type non supporté
 */
export function evaluateExpression(expression: string): number {
    if (typeof expression !== 'string' || expression.trim() === '') {
        throw new Error('Expression invalide. Veuillez fournir une expression mathématique valide.');
    }

    try {
        const result = math.evaluate(expression);
        
        if (typeof result === 'function' || (typeof result === 'object' && result.isFunction)) {
            throw new Error('Expression invalide. Les définitions de fonctions ne sont pas supportées.');
        }
        
        if (typeof result === 'object') {
            if (result.isMatrix) {
                throw new Error('Expression invalide. Les matrices ne sont pas supportées. Utilisez des opérations scalaires.');
            }
            if (result.isComplex || result.im !== undefined) {
                throw new Error('Expression invalide. Les nombres complexes ne sont pas supportés.');
            }
            if (result.isUnit) {
                throw new Error('Expression invalide. Les conversions d\'unités ne sont pas supportées. Utilisez uniquement des valeurs numériques.');
            }
            throw new Error('Expression invalide. Le résultat doit être un nombre.');
        }
        
        if (typeof result === 'number') {
            return result;
        }
        
        if (typeof result === 'string') {
            const numResult = parseFloat(result);
            if (isNaN(numResult)) {
                throw new Error('Expression invalide. Le résultat doit être un nombre.');
            }
            return numResult;
        }
        
        throw new Error('Expression invalide. Le résultat doit être un nombre.');

    } catch (error) {
        if (error instanceof Error && error.message.startsWith('Expression invalide')) {
            throw error;
        }
        
        throw new Error('Expression invalide. Vérifiez la syntaxe de votre expression mathématique.');
    }
}
