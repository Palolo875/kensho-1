import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '../../src/agents/calculator/logic';

describe('CalculatorAgent Logic', () => {
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

    describe('Gestion des erreurs', () => {
        it('devrait lever une erreur pour une expression vide', () => {
            expect(() => evaluateExpression('')).toThrow('expression fournie est vide ou invalide');
        });

        it('devrait lever une erreur pour une chaîne avec seulement des espaces', () => {
            expect(() => evaluateExpression('   ')).toThrow('expression fournie est vide ou invalide');
        });

        it('devrait lever une erreur pour une expression invalide', () => {
            expect(() => evaluateExpression('2 + foo')).toThrow('Impossible d\'évaluer l\'expression');
        });

        it('devrait lever une erreur pour une syntaxe incorrecte', () => {
            expect(() => evaluateExpression('2 + + 3')).toThrow('Impossible d\'évaluer l\'expression');
        });
    });

    describe('Sécurité', () => {
        it('devrait gérer la division par zéro sans planter', () => {
            const result = evaluateExpression('1/0');
            expect(result).toBe(Infinity);
        });

        it('devrait rejeter les expressions qui produisent des fonctions', () => {
            expect(() => evaluateExpression('f(x) = x^2')).toThrow();
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
    });
});
