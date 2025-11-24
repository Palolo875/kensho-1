import { 
    create,
    addDependencies,
    subtractDependencies,
    multiplyDependencies,
    divideDependencies,
    powDependencies,
    sqrtDependencies,
    absDependencies,
    roundDependencies,
    ceilDependencies,
    floorDependencies,
    minDependencies,
    maxDependencies,
    modDependencies,
    logDependencies,
    log10Dependencies,
    expDependencies,
    sinDependencies,
    cosDependencies,
    tanDependencies,
    asinDependencies,
    acosDependencies,
    atanDependencies,
    piDependencies,
    eDependencies,
    evaluateDependencies
} from 'mathjs';

/**
 * Créer une instance de mathjs avec des scopes limités pour la sécurité.
 * Importe uniquement les fonctions nécessaires au lieu de toutes les fonctions disponibles.
 * Cela réduit la surface d'attaque et le bundle size.
 * 
 * Note: Les scopes limités aident à prévenir:
 * - L'exécution de code arbitraire via des fonctions non autorisées
 * - L'utilisation de fonctionnalités complexes non nécessaires (matrices, unités, etc.)
 * - L'augmentation inutile du bundle size
 */
const math = create({
    addDependencies,
    subtractDependencies,
    multiplyDependencies,
    divideDependencies,
    powDependencies,
    sqrtDependencies,
    absDependencies,
    roundDependencies,
    ceilDependencies,
    floorDependencies,
    minDependencies,
    maxDependencies,
    modDependencies,
    logDependencies,
    log10Dependencies,
    expDependencies,
    sinDependencies,
    cosDependencies,
    tanDependencies,
    asinDependencies,
    acosDependencies,
    atanDependencies,
    piDependencies,
    eDependencies,
    evaluateDependencies
}, {
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
 * La sécurité est assurée par:
 * - Scopes limités dans mathjs (seulement les fonctions mathématiques de base)
 * - Validation stricte du résultat (pas de matrices, nombres complexes, unités)
 * - Rejet des définitions de fonctions
 * 
 * Note: Cette fonction est synchrone et ne peut pas être interrompue.
 * Pour une protection contre les expressions infinies, il faudrait utiliser
 * un Web Worker ou un subprocess, ce qui sera implémenté dans une version future.
 * 
 * @param expression - L'expression mathématique à évaluer (ex: "2 + 2", "sqrt(16)")
 * @returns Le résultat du calcul (nombre)
 * @throws Error si l'expression est invalide ou produit un type non supporté
 */
/**
 * Évalue une expression mathématique de manière sécurisée (version synchrone).
 * Cette fonction bloque le thread - utiliser evaluateExpressionWithWorker() pour
 * les expressions potentiellement longues.
 */
export function evaluateExpression(expression: string): number {
    if (typeof expression !== 'string' || expression.trim() === '') {
        throw new Error('Expression invalide. Veuillez fournir une expression mathématique valide.');
    }

    try {
        const result = math.evaluate(expression);
        
        // Validation du type de résultat
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

/**
 * Évalue une expression avec timeout via Web Worker.
 * Utiliser cette fonction pour les expressions potentiellement infinies ou très coûteuses.
 * 
 * @param expression - L'expression mathématique à évaluer
 * @param timeoutMs - Timeout en millisecondes (défaut: 5000ms)
 * @returns Promesse résolvant le résultat du calcul
 * @throws Error si l'expression est invalide ou dépasse le timeout
 */
export async function evaluateExpressionWithWorker(expression: string, timeoutMs: number = 5000): Promise<number> {
    // Vérifier que Web Workers sont disponibles
    if (typeof Worker === 'undefined') {
        console.warn('[CalculatorAgent] Web Workers non disponibles, utilisation version synchrone');
        return evaluateExpression(expression);
    }

    return new Promise((resolve, reject) => {
        // Créer un worker à la volée
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        const msgId = crypto.randomUUID();
        let timedOut = false;

        // Timeout global
        const globalTimeout = setTimeout(() => {
            timedOut = true;
            worker.terminate();
            reject(new Error(`Timeout: L'évaluation de "${expression}" a pris trop de temps (>${timeoutMs}ms)`));
        }, timeoutMs);

        // Répondre aux messages du worker
        const messageHandler = (event: MessageEvent) => {
            if (event.data.id !== msgId) return;

            clearTimeout(globalTimeout);
            worker.removeEventListener('message', messageHandler);
            worker.terminate();

            if (timedOut) return;

            if (event.data.error) {
                reject(new Error(event.data.error));
            } else {
                resolve(event.data.result);
            }
        };

        worker.addEventListener('message', messageHandler);
        worker.addEventListener('error', (error) => {
            clearTimeout(globalTimeout);
            worker.terminate();
            reject(new Error(`Worker error: ${error.message}`));
        });

        // Envoyer la requête au worker
        worker.postMessage({
            id: msgId,
            expression,
            timeout: timeoutMs
        });
    });
}
