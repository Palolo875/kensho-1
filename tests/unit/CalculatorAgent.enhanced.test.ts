/**
 * Tests améliorés pour CalculatorAgent avec les nouvelles fonctionnalités:
 * - Scopes limités dans mathjs (seulement les fonctions nécessaires)
 * - Validation stricte des résultats
 */
import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '../../src/agents/calculator/logic';

describe('CalculatorAgent - Enhanced Features', () => {
    describe('Scopes limités - Fonctions supportées', () => {
        it('should support basic arithmetic operations', () => {
            expect(evaluateExpression('2 + 2')).toBe(4);
            expect(evaluateExpression('10 - 3')).toBe(7);
            expect(evaluateExpression('4 * 5')).toBe(20);
            expect(evaluateExpression('20 / 4')).toBe(5);
        });

        it('should support power operations', () => {
            expect(evaluateExpression('2^3')).toBe(8);
            expect(evaluateExpression('pow(2, 3)')).toBe(8);
        });

        it('should support mathematical functions', () => {
            expect(evaluateExpression('sqrt(16)')).toBe(4);
            expect(evaluateExpression('abs(-5)')).toBe(5);
            expect(evaluateExpression('round(3.7)')).toBe(4);
            expect(evaluateExpression('ceil(3.2)')).toBe(4);
            expect(evaluateExpression('floor(3.8)')).toBe(3);
        });

        it('should support trigonometric functions', () => {
            expect(evaluateExpression('sin(0)')).toBe(0);
            expect(evaluateExpression('cos(0)')).toBe(1);
            expect(evaluateExpression('tan(0)')).toBe(0);
        });

        it('should support logarithmic functions', () => {
            expect(evaluateExpression('log(e)')).toBeCloseTo(1, 5);
            expect(evaluateExpression('log10(100)')).toBe(2);
            expect(evaluateExpression('exp(0)')).toBe(1);
        });

        it('should support constants', () => {
            expect(evaluateExpression('pi')).toBeCloseTo(3.14159, 5);
            expect(evaluateExpression('e')).toBeCloseTo(2.71828, 5);
        });

        it('should support min/max functions', () => {
            expect(evaluateExpression('min(3, 7, 2)')).toBe(2);
            expect(evaluateExpression('max(3, 7, 2)')).toBe(7);
        });

        it('should support modulo operation', () => {
            expect(evaluateExpression('10 mod 3')).toBe(1);
        });
    });

    describe('Complex expressions', () => {
        it('should handle simple expressions', () => {
            const result = evaluateExpression('2 + 2');
            expect(result).toBe(4);
        });

        it('should handle complex expressions', () => {
            const result = evaluateExpression('sqrt(16) + sin(0) * cos(0) + pow(2, 3)');
            expect(result).toBe(12); // sqrt(16) = 4, sin(0)*cos(0) = 0, pow(2,3) = 8
        });

        it('should handle multiple operations', () => {
            const result = evaluateExpression('10 + 5');
            expect(result).toBe(15);
        });

        it('should handle errors properly', () => {
            expect(() => evaluateExpression('invalid expression')).toThrow('Expression invalide');
        });

        it('should reject empty expressions', () => {
            expect(() => evaluateExpression('')).toThrow('Expression invalide');
        });
    });

    describe('Security - Limited scopes', () => {
        it('should reject function definitions', () => {
            expect(() => evaluateExpression('f(x) = x^2')).toThrow('Expression invalide');
        });

        it('should reject matrix operations', () => {
            expect(() => evaluateExpression('[1, 2; 3, 4]')).toThrow('Expression invalide');
        });

        it('should reject complex numbers', () => {
            expect(() => evaluateExpression('sqrt(-1)')).toThrow('Expression invalide');
        });

        it('should reject unit conversions', () => {
            expect(() => evaluateExpression('5 cm to inch')).toThrow('Expression invalide');
        });
    });

    describe('Performance and edge cases', () => {
        it('should handle very large numbers', () => {
            const result = evaluateExpression('999999 * 999999');
            expect(result).toBeGreaterThan(0);
            expect(typeof result).toBe('number');
        });

        it('should handle very small numbers', () => {
            const result = evaluateExpression('0.0000001 * 0.0000001');
            expect(result).toBeGreaterThan(0);
            expect(typeof result).toBe('number');
        });

        it('should handle division by zero appropriately', () => {
            const result = evaluateExpression('1/0');
            expect(result).toBe(Infinity);
        });

        it('should handle 0/0 as NaN', () => {
            const result = evaluateExpression('0/0');
            expect(isNaN(result)).toBe(true);
        });

        it('should handle negative numbers', () => {
            expect(evaluateExpression('-5 + 3')).toBe(-2);
            expect(evaluateExpression('-5 * -3')).toBe(15);
        });

        it('should handle nested parentheses', () => {
            expect(evaluateExpression('((2 + 3) * (4 + 5))')).toBe(45);
        });
    });

    describe('Expression validation', () => {
        it('should evaluate correctly with operator precedence', () => {
            const expression = '2 + 2 * 3';
            const result = evaluateExpression(expression);
            expect(result).toBe(8); // 2 + (2 * 3) = 2 + 6 = 8
        });

        it('should reject invalid syntax', () => {
            const invalidExpression = '2 + + 3';
            expect(() => evaluateExpression(invalidExpression)).toThrow();
        });

        it('should handle whitespace correctly', () => {
            expect(evaluateExpression('  2  +  3  ')).toBe(5);
        });
    });

    describe('Pathological expressions (regression tests)', () => {
        it('should reject recursive function definitions', () => {
            expect(() => evaluateExpression('f(x) = f(x-1)')).toThrow();
        });

        it('should handle deeply nested expressions', () => {
            const deepExpr = '((((((((((1 + 1)))))))))';
            expect(evaluateExpression(deepExpr)).toBe(2);
        });

        it('should handle very long expression chains', () => {
            let expr = '1';
            for (let i = 0; i < 100; i++) {
                expr += ' + 1';
            }
            expect(evaluateExpression(expr)).toBe(101);
        });

        it('should reject expressions trying to access globals', () => {
            expect(() => evaluateExpression('this')).toThrow('Expression invalide');
        });

        it('should reject expressions with eval-like patterns', () => {
            expect(() => evaluateExpression('eval("2+2")')).toThrow();
        });

        it('should handle very large numbers gracefully', () => {
            const result = evaluateExpression('999999999999 * 999999999999');
            expect(typeof result).toBe('number');
            expect(isFinite(result)).toBe(true);
        });

        it('should reject expressions with variable assignments', () => {
            expect(() => evaluateExpression('x = 5; x + 3')).toThrow();
        });

        it('should handle null/undefined operations', () => {
            expect(() => evaluateExpression('null + 5')).toThrow('Expression invalide');
        });
    });
});
