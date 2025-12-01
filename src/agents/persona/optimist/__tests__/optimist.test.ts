// src/agents/persona/optimist/__tests__/optimist.test.ts
import { describe, it, expect } from 'vitest';

describe('OptimistAgent', () => {
  describe('OPTIMIST_SYSTEM_PROMPT', () => {
    it('should contain required structure elements', () => {
      const { OPTIMIST_SYSTEM_PROMPT } = require('../system-prompt');
      
      // Check that prompt contains required sections
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('Tu es Léo');
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('RÈGLES');
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('STRUCTURE DE TA RÉPONSE');
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('Exemples de Réponses');
    });

    it('should contain example sections', () => {
      const { OPTIMIST_SYSTEM_PROMPT } = require('../system-prompt');
      
      // Check that prompt contains examples
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('EXEMPLE 1');
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('EXEMPLE 2');
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('EXEMPLE 3');
      
      // Check specific example content
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('comment devenir expert en JavaScript');
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('stratégie de contenu pour mon blog');
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('améliorer ma productivité');
    });

    it('should have proper response structure instruction', () => {
      const { OPTIMIST_SYSTEM_PROMPT } = require('../system-prompt');
      
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('Réponse Directe');
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('Analyse des Opportunités');
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('Plan d\'Action Concret');
      expect(OPTIMIST_SYSTEM_PROMPT).toContain('Encouragement Final');
    });
  });
});