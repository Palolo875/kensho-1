// tests/unit/OIEAgent.test.ts
import { describe, it, expect } from 'vitest';
import { naiveTaskPlanner } from '../../src/agents/oie/planner';
import type { AgentType } from '../../src/agents/oie/planner';

describe('OIE V1 - TaskPlanner Naïf', () => {
    describe('Routage basique', () => {
        it('devrait router vers MainLLMAgent pour une requête générale', () => {
            const query = 'Bonjour, comment vas-tu ?';
            const plan = naiveTaskPlanner(query);
            expect(plan.agent).toBe('MainLLMAgent');
            expect(plan.prompt).toBe(query);
            expect(plan.metadata?.confidence).toBeGreaterThan(0);
        });

        it('devrait router vers CodeAgent pour une requête contenant le mot "code"', () => {
            const query = 'Écris-moi un morceau de code en Python.';
            const plan = naiveTaskPlanner(query);
            expect(plan.agent).toBe('CodeAgent');
            expect(plan.prompt).toBe(query);
            expect(plan.metadata?.detectedKeywords).toContain('code');
            expect(plan.metadata?.detectedKeywords).toContain('python');
        });

        it('devrait router vers VisionAgent pour une requête contenant "image"', () => {
            const query = 'Analyse cette image pour moi.';
            const plan = naiveTaskPlanner(query);
            expect(plan.agent).toBe('VisionAgent');
            expect(plan.metadata?.detectedKeywords).toContain('image');
        });

        it('devrait détecter plusieurs mots-clés de code', () => {
            const query = 'Debug cette fonction JavaScript qui a un bug.';
            const plan = naiveTaskPlanner(query);
            expect(plan.agent).toBe('CodeAgent');
            expect(plan.metadata?.detectedKeywords).toEqual(
                expect.arrayContaining(['debug', 'fonction', 'javascript', 'bug'])
            );
        });
    });

    describe('Edge cases', () => {
        it('devrait préserver la requête exacte dans le prompt', () => {
            const query = 'Ceci est une requête complexe avec plusieurs mots.';
            const plan = naiveTaskPlanner(query);
            expect(plan.prompt).toBe(query);
        });

        it('devrait gérer une query avec seulement des espaces', () => {
            const query = '    ';
            const plan = naiveTaskPlanner(query);
            // Le planner ne valide pas - c'est le rôle de l'OIEAgent
            expect(plan.agent).toBe('MainLLMAgent');
        });

        it('devrait gérer une query très courte', () => {
            const query = 'a';
            const plan = naiveTaskPlanner(query);
            expect(plan.agent).toBe('MainLLMAgent');
        });

        it('devrait être case-insensitive pour la détection de mots-clés', () => {
            const query = 'ÉCRIS DU CODE PYTHON';
            const plan = naiveTaskPlanner(query);
            expect(plan.agent).toBe('CodeAgent');
        });

        it('devrait gérer des queries avec accents et caractères spéciaux', () => {
            const query = 'Crée une function en Python!';
            const plan = naiveTaskPlanner(query);
            expect(plan.agent).toBe('CodeAgent');
            expect(plan.metadata?.detectedKeywords).toContain('function');
            expect(plan.metadata?.detectedKeywords).toContain('python');
        });
    });

    describe('Priorisation des agents', () => {
        it('devrait prioriser VisionAgent sur CodeAgent si "image" est présent', () => {
            const query = 'Analyse cette image de code source';
            const plan = naiveTaskPlanner(query);
            expect(plan.agent).toBe('VisionAgent');
        });

        it('devrait router vers CodeAgent si uniquement mot-clé code', () => {
            const query = 'Explique cette classe Python';
            const plan = naiveTaskPlanner(query);
            expect(plan.agent).toBe('CodeAgent');
        });
    });

    describe('Configuration personnalisée', () => {
        it('devrait respecter defaultAgent si aucun mot-clé détecté', () => {
            const query = 'Parle-moi de la météo';
            const plan = naiveTaskPlanner(query, { defaultAgent: 'MainLLMAgent' });
            expect(plan.agent).toBe('MainLLMAgent');
        });

        it('devrait fallback vers defaultAgent si agent demandé n\'est pas disponible', () => {
            const query = 'Écris du code';
            // Si CodeAgent n'est pas dans la liste des agents disponibles
            const plan = naiveTaskPlanner(query, { 
                availableAgents: ['MainLLMAgent'],
                defaultAgent: 'MainLLMAgent'
            });
            // Le planner suggère toujours l'agent le plus approprié
            // C'est l'OIEAgent qui fait le fallback si l'agent n'est pas dispo
            expect(plan.agent).toBe('MainLLMAgent');
        });

        it('devrait sélectionner l\'agent approprié si dans la liste disponible', () => {
            const query = 'Analyse cette image';
            const plan = naiveTaskPlanner(query, {
                availableAgents: ['VisionAgent', 'MainLLMAgent']
            });
            expect(plan.agent).toBe('VisionAgent');
        });

        it('devrait router vers CodeAgent quand disponible', () => {
            const query = 'Écris du code Python';
            const plan = naiveTaskPlanner(query, {
                availableAgents: ['CodeAgent', 'MainLLMAgent']
            });
            expect(plan.agent).toBe('CodeAgent');
        });
    });

    describe('Metadata', () => {
        it('devrait retourner confidence et keywords détectés', () => {
            const query = 'Debug ce code JavaScript';
            const plan = naiveTaskPlanner(query);
            expect(plan.metadata).toBeDefined();
            expect(plan.metadata?.confidence).toBeGreaterThan(0);
            expect(plan.metadata?.confidence).toBeLessThanOrEqual(1);
            expect(plan.metadata?.detectedKeywords).toBeDefined();
            expect(plan.metadata?.detectedKeywords?.length).toBeGreaterThan(0);
        });

        it('devrait avoir une confidence différente selon le type de requête', () => {
            const codeQuery = 'Écris du code';
            const generalQuery = 'Bonjour';
            
            const codePlan = naiveTaskPlanner(codeQuery);
            const generalPlan = naiveTaskPlanner(generalQuery);
            
            expect(codePlan.metadata?.confidence).toBeGreaterThan(generalPlan.metadata?.confidence || 0);
        });
    });

    describe('Routing Logic Integration', () => {
        it('devrait router correctement avec tous les agents disponibles', () => {
            const config = {
                availableAgents: ['MainLLMAgent', 'CodeAgent', 'VisionAgent'] as AgentType[]
            };

            // Test code routing
            const codePlan = naiveTaskPlanner('Écris du code', config);
            expect(codePlan.agent).toBe('CodeAgent');

            // Test vision routing
            const visionPlan = naiveTaskPlanner('Analyse cette image', config);
            expect(visionPlan.agent).toBe('VisionAgent');

            // Test general routing
            const generalPlan = naiveTaskPlanner('Bonjour', config);
            expect(generalPlan.agent).toBe('MainLLMAgent');
        });

        it('devrait prioriser VisionAgent même si code keywords présents', () => {
            const query = 'Regarde ce code et dis-moi ce que tu vois';
            const plan = naiveTaskPlanner(query);
            // "regarde" et "vois" sont des keywords vision
            // "code" est un keyword code
            // Vision doit avoir priorité
            expect(plan.agent).toBe('VisionAgent');
        });
    });
});
