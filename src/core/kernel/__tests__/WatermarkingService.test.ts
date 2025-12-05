/**
 * Tests pour le WatermarkingService
 */

import { watermarkingService } from '../guardrails/WatermarkingService';

describe('WatermarkingService', () => {
  describe('Application de watermark', () => {
    it('devrait appliquer un watermark invisible au texte', () => {
      const text = 'Ceci est une réponse de test';
      const context = {
        modelId: 'test-model',
        sessionId: 'session-123'
      };

      const result = watermarkingService.apply(text, context);
      
      expect(result.watermarkedText).toBeDefined();
      expect(result.contentHash).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.attestation).toBeDefined();
      expect(result.integritySignature).toBeDefined();
    });

    it('devrait générer des métadonnées valides', () => {
      const text = 'Ceci est une réponse de test';
      const context = {
        modelId: 'test-model',
        sessionId: 'session-123',
        securityLevel: 8
      };

      const result = watermarkingService.apply(text, context);
      
      expect(result.metadata.version).toBe('kensho-v2.0');
      expect(result.metadata.modelId).toBe('test-model');
      expect(result.metadata.sessionId).toBe('session-123');
      expect(result.metadata.securityLevel).toBe(8);
    });
  });

  describe('Vérification de watermark', () => {
    it('devrait vérifier un texte watermarked valide', () => {
      const text = 'Ceci est une réponse de test';
      const context = {
        modelId: 'test-model',
        sessionId: 'session-123'
      };

      const watermarked = watermarkingService.apply(text, context);
      const verification = watermarkingService.verify(watermarked.watermarkedText);
      
      expect(verification.valid).toBe(true);
    });

    it('devrait détecter un texte non watermarked', () => {
      const text = 'Ceci est une réponse de test sans watermark';
      const verification = watermarkingService.verify(text);
      
      expect(verification.valid).toBe(false);
    });
  });

  describe('Suppression de watermark', () => {
    it('devrait supprimer le watermark du texte', () => {
      const text = 'Ceci est une réponse de test';
      const context = {
        modelId: 'test-model',
        sessionId: 'session-123'
      };

      const watermarked = watermarkingService.apply(text, context);
      const cleanedText = watermarkingService.removeWatermark(watermarked.watermarkedText);
      
      // Le texte nettoyé ne devrait pas contenir de caractères zero-width
      expect(cleanedText).not.toMatch(/[\u200B-\u200D\uFEFF]/);
    });
  });
});