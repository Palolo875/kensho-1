// src/core/oie/__tests__/QueryClassifier.test.ts
import { describe, it, expect } from 'vitest';
import { QueryClassifier } from '../QueryClassifier';

describe('QueryClassifier', () => {
  let classifier: QueryClassifier;

  beforeEach(() => {
    classifier = new QueryClassifier();
  });

  describe('normalizeString', () => {
    it('should normalize strings by removing accents and converting to lowercase', () => {
      expect(classifier['normalizeString']('ÉVALUER')).toBe('evaluer');
      expect(classifier['normalizeString']('AVANTAGES')).toBe('avantages');
      expect(classifier['normalizeString']('DÉCISION')).toBe('decision');
    });

    it('should handle mixed case and accents', () => {
      expect(classifier['normalizeString']('QuelS SONT les Avantages')).toBe('quels sont les avantages');
    });
  });

  describe('classify', () => {
    it('should classify simple factual questions as simple', () => {
      expect(classifier.classify('Quelle est la capitale de la France ?')).toBe('simple');
      expect(classifier.classify('Combien font 2+2 ?')).toBe('simple');
      expect(classifier.classify('Qui est le président des USA ?')).toBe('simple');
    });

    it('should classify complex analytical questions as complex', () => {
      expect(classifier.classify('Quels sont les avantages et inconvénients du télétravail ?')).toBe('complex');
      expect(classifier.classify('Devrais-je investir dans les cryptomonnaies ?')).toBe('complex');
      expect(classifier.classify('Comment choisir la meilleure stratégie marketing pour mon entreprise ?')).toBe('complex');
    });

    it('should handle long questions appropriately', () => {
      const longSimpleQuestion = 'Quelle est la capitale de la France métropolitaine en Europe continentale ?';
      expect(classifier.classify(longSimpleQuestion)).toBe('simple'); // Still simple despite length
      
      const longComplexQuestion = 'Devrais-je investir dans les cryptomonnaies ou plutôt dans l\'immobilier locatif en zone tendue, et quelles sont les implications fiscales de chaque choix à court et long terme ?';
      expect(classifier.classify(longComplexQuestion)).toBe('complex'); // Complex due to keywords + length
    });

    it('should handle edge cases gracefully', () => {
      expect(classifier.classify('')).toBe('simple'); // Empty string
      expect(classifier.classify('???')).toBe('simple'); // No meaningful keywords
      expect(classifier.classify('Pourquoi')).toBe('simple'); // Single keyword with low weight
    });

    it('should be case and accent insensitive', () => {
      expect(classifier.classify('DEVRAIS-JE')).toBe('complex');
      expect(classifier.classify('ÉVALUER les options')).toBe('complex');
      expect(classifier.classify('Quelle est la CAPITALE')).toBe('simple');
    });
  });
});