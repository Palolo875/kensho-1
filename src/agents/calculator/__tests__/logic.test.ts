/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '../logic';

describe('CalculatorAgent - evaluateExpression (Node Environment)', () => {
    describe('Calculs de base', () => {
        it('devrait calculer une addition simple', () => {
            expect(evaluateExpression('2+2')).toBe(4);
        });

        it('devrait calculer une multiplication', () => {
            expect(evaluateExpression('3 * 4')).toBe(12);
        });

        it('devrait calculer une soustraction', () => {
            expect(evaluateExpression('10 - 7')).toBe(3);
        });

        it('devrait calculer une division', () => {
            expect(evaluateExpression('15 / 3')).toBe(5);
        });
    });

    describe('Calculs avancés', () => {
        it('devrait calculer une expression avec parenthèses', () => {
            expect(evaluateExpression('2 * (3 + 4)')).toBe(14);
        });

        it('devrait calculer une puissance', () => {
            expect(evaluateExpression('2^3')).toBe(8);
        });

        it('devrait calculer une racine carrée', () => {
            expect(evaluateExpression('sqrt(16)')).toBe(4);
        });

        it('devrait calculer une expression complexe', () => {
            expect(evaluateExpression('2 * (3 + 4)^2')).toBe(98);
        });

        it('devrait gérer les nombres décimaux', () => {
            expect(evaluateExpression('3.14 * 2')).toBeCloseTo(6.28, 2);
        });
    });

    describe('Gestion des erreurs standardisée', () => {
        it('devrait lever une erreur standardisée pour une expression vide', () => {
            expect(() => evaluateExpression('')).toThrow('Expression invalide');
        });

        it('devrait lever une erreur standardisée pour des espaces', () => {
            expect(() => evaluateExpression('   ')).toThrow('Expression invalide');
        });

        it('devrait lever une erreur standardisée pour une variable inconnue', () => {
            expect(() => evaluateExpression('2 + foo')).toThrow('Expression invalide');
        });

        it('devrait lever une erreur standardisée pour une syntaxe incorrecte', () => {
            expect(() => evaluateExpression('2 + + 3')).toThrow('Expression invalide');
        });
    });

    describe('Sécurité et types supportés', () => {
        it('devrait gérer la division par zéro', () => {
            const result = evaluateExpression('1/0');
            expect(result).toBe(Infinity);
        });

        it('devrait rejeter les définitions de fonctions', () => {
            expect(() => evaluateExpression('f(x) = x^2')).toThrow('Expression invalide');
        });

        it('devrait rejeter les matrices', () => {
            expect(() => evaluateExpression('[1, 2; 3, 4]')).toThrow('Expression invalide');
        });

        it('devrait rejeter les nombres complexes', () => {
            expect(() => evaluateExpression('sqrt(-1)')).toThrow('Expression invalide');
        });
    });

    describe('Fonctions mathématiques', () => {
        it('devrait calculer le sinus', () => {
            expect(evaluateExpression('sin(0)')).toBe(0);
        });

        it('devrait calculer le cosinus', () => {
            expect(evaluateExpression('cos(0)')).toBe(1);
        });

        it('devrait calculer la valeur absolue', () => {
            expect(evaluateExpression('abs(-5)')).toBe(5);
        });

        it('devrait calculer le minimum', () => {
            expect(evaluateExpression('min(3, 7, 2)')).toBe(2);
        });

        it('devrait calculer le maximum', () => {
            expect(evaluateExpression('max(3, 7, 2)')).toBe(7);
        });

        it('devrait calculer un logarithme', () => {
            expect(evaluateExpression('log(10)')).toBeCloseTo(2.302585, 5);
        });

        it('devrait calculer une tangente', () => {
            expect(evaluateExpression('tan(0)')).toBe(0);
        });
    });

    describe('Types de retour', () => {
        it('devrait toujours retourner un nombre', () => {
            const result = evaluateExpression('5 + 5');
            expect(typeof result).toBe('number');
            expect(result).toBe(10);
        });

        it('devrait gérer les résultats infinis', () => {
            const result = evaluateExpression('1/0');
            expect(result).toBe(Infinity);
        });

        it('devrait gérer les résultats NaN', () => {
            const result = evaluateExpression('0/0');
            expect(result).toBeNaN();
        });
    });

    describe('Edge cases', () => {
        it('devrait gérer de très grands nombres', () => {
            const result = evaluateExpression('999999999999 * 999999999999');
            expect(typeof result).toBe('number');
        });

        it('devrait gérer de très petits nombres', () => {
            const result = evaluateExpression('0.0000000001 * 0.0000000001');
            expect(typeof result).toBe('number');
        });

        it('devrait gérer les nombres négatifs', () => {
            expect(evaluateExpression('-5 + 3')).toBe(-2);
        });

        it('devrait gérer les doubles parenthèses', () => {
            expect(evaluateExpression('((2 + 3) * (4 + 5))')).toBe(45);
        });

        it('devrait gérer les pourcentages', () => {
            expect(evaluateExpression('50% of 100')).toBe(50);
        });
    });
});
