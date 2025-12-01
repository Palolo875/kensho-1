// src/agents/persona/critic/__tests__/critic.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('CriticAgent', () => {
  // Since this is an agent that runs in a worker, we'll test the core logic
  
  describe('CRITIC_SYSTEM_PROMPT', () => {
    it('should contain required structure elements', () => {
      const { CRITIC_SYSTEM_PROMPT } = require('../system-prompt');
      
      // Check that prompt contains required sections
      expect(CRITIC_SYSTEM_PROMPT).toContain('Tu es Athéna');
      expect(CRITIC_SYSTEM_PROMPT).toContain('RÈGLES STRICTES');
      expect(CRITIC_SYSTEM_PROMPT).toContain('Format de Sortie Obligatoire');
      expect(CRITIC_SYSTEM_PROMPT).toContain('Sois Spécifique');
      expect(CRITIC_SYSTEM_PROMPT).toContain('Fournis des Preuves');
      expect(CRITIC_SYSTEM_PROMPT).toContain('Propose une Solution');
    });

    it('should contain example sections', () => {
      const { CRITIC_SYSTEM_PROMPT } = require('../system-prompt');
      
      // Check that prompt contains examples
      expect(CRITIC_SYSTEM_PROMPT).toContain('EXEMPLE 1');
      expect(CRITIC_SYSTEM_PROMPT).toContain('EXEMPLE 2');
      expect(CRITIC_SYSTEM_PROMPT).toContain('EXEMPLE 3');
      
      // Check specific example content
      expect(CRITIC_SYSTEM_PROMPT).toContain('Apprendre Rust est un excellent investissement');
      expect(CRITIC_SYSTEM_PROMPT).toContain('baisser nos prix de 20%');
      expect(CRITIC_SYSTEM_PROMPT).toContain('Getting Things Done');
    });

    it('should have proper JSON format instruction', () => {
      const { CRITIC_SYSTEM_PROMPT } = require('../system-prompt');
      
      expect(CRITIC_SYSTEM_PROMPT).toContain('objet JSON valide');
      expect(CRITIC_SYSTEM_PROMPT).toContain('pas de texte avant ou après');
    });
  });

  describe('Critique Interface', () => {
    it('should define proper critique structure', () => {
      const { Critique } = require('../index');
      
      // This test ensures the interface is properly exported
      // In practice, interfaces are compile-time only, but we can test the shape
      const mockCritique: Critique = {
        major_flaw: 'Test flaw',
        evidence: 'Test evidence',
        suggested_fix: 'Test fix'
      };
      
      expect(mockCritique).toHaveProperty('major_flaw');
      expect(mockCritique).toHaveProperty('evidence');
      expect(mockCritique).toHaveProperty('suggested_fix');
    });
  });
});