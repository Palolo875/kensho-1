// tests/unit/OIEAgent.test.ts
import { describe, it, expect } from 'vitest';
import { naiveTaskPlanner } from '../../src/agents/oie/planner';

describe('OIE V1 - TaskPlanner Naïf', () => {
    it('devrait router vers MainLLMAgent pour une requête générale', () => {
        const query = 'Bonjour, comment vas-tu ?';
        const plan = naiveTaskPlanner(query);
        expect(plan.agent).toBe('MainLLMAgent');
        expect(plan.prompt).toBe(query);
    });

    it('devrait router vers MainLLMAgent pour une requête contenant le mot "code"', () => {
        const query = 'Écris-moi un morceau de code en Python.';
        const plan = naiveTaskPlanner(query);
        // Pour ce sprint, même les requêtes "code" vont à MainLLMAgent
        expect(plan.agent).toBe('MainLLMAgent');
        expect(plan.prompt).toBe(query);
    });

    it('devrait préserver la requête exacte dans le prompt', () => {
        const query = 'Ceci est une requête complexe avec plusieurs mots.';
        const plan = naiveTaskPlanner(query);
        expect(plan.prompt).toBe(query);
    });
});
