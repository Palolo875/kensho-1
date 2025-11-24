/**
 * Web Worker pour CalculatorAgent
 * Permet d'interrompre les évaluations mathématiques longues sans bloquer le thread principal
 */

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

interface WorkerMessage {
    id: string;
    expression: string;
    timeout?: number;
}

interface WorkerResponse {
    id: string;
    result?: number;
    error?: string;
}

// Écoute les messages du thread principal
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const { id, expression, timeout = 5000 } = event.data;

    try {
        // Valider expression
        if (typeof expression !== 'string' || expression.trim() === '') {
            self.postMessage({
                id,
                error: 'Expression invalide. Veuillez fournir une expression mathématique valide.'
            } as WorkerResponse);
            return;
        }

        // Évaluer avec timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout: L\'évaluation a pris trop de temps.')), timeout);
        });

        const evaluatePromise = Promise.resolve(math.evaluate(expression));

        Promise.race([evaluatePromise, timeoutPromise])
            .then((result) => {
                // Valider le résultat
                if (typeof result === 'function' || (typeof result === 'object' && result?.isFunction)) {
                    throw new Error('Expression invalide. Les définitions de fonctions ne sont pas supportées.');
                }

                if (typeof result === 'object' && result !== null) {
                    if (result.isMatrix) {
                        throw new Error('Expression invalide. Les matrices ne sont pas supportées.');
                    }
                    if (result.isComplex || result.im !== undefined) {
                        throw new Error('Expression invalide. Les nombres complexes ne sont pas supportés.');
                    }
                    if (result.isUnit) {
                        throw new Error('Expression invalide. Les conversions d\'unités ne sont pas supportées.');
                    }
                    throw new Error('Expression invalide. Le résultat doit être un nombre.');
                }

                if (typeof result === 'number') {
                    self.postMessage({
                        id,
                        result
                    } as WorkerResponse);
                    return;
                }

                if (typeof result === 'string') {
                    const numResult = parseFloat(result);
                    if (isNaN(numResult)) {
                        throw new Error('Expression invalide. Le résultat doit être un nombre.');
                    }
                    self.postMessage({
                        id,
                        result: numResult
                    } as WorkerResponse);
                    return;
                }

                throw new Error('Expression invalide. Le résultat doit être un nombre.');
            })
            .catch((error: Error) => {
                self.postMessage({
                    id,
                    error: error.message
                } as WorkerResponse);
            });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Expression invalide.';
        self.postMessage({
            id,
            error: message
        } as WorkerResponse);
    }
};

export type {};
