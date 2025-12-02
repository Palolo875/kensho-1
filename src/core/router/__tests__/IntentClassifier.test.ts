import { describe, it, expect } from 'vitest';
import { IntentClassifier } from '../IntentClassifier';

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;

  beforeEach(() => {
    classifier = new IntentClassifier();
  });

  it('should classify coding questions', () => {
    const codingQuestions = [
      'How do I write a function in Python?',
      'Can you help me debug this JavaScript code?',
      'What is the syntax for a for loop in Java?',
      'How do I fix this React component?',
      'Can you explain async/await in TypeScript?',
    ];

    codingQuestions.forEach(question => {
      const intent = classifier.classifyIntent(question);
      expect(intent.primaryDomain).toBe('coding');
      expect(intent.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  it('should classify math questions', () => {
    const mathQuestions = [
      'What is the integral of x^2?',
      'Can you solve this equation: 2x + 5 = 15?',
      'How do I calculate the area of a circle?',
      'What is the derivative of sin(x)?',
      'Can you help with this statistics problem?',
    ];

    mathQuestions.forEach(question => {
      const intent = classifier.classifyIntent(question);
      expect(intent.primaryDomain).toBe('math');
      expect(intent.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  it('should classify general questions', () => {
    const generalQuestions = [
      'What is the weather today?',
      'Tell me a joke',
      'How do I cook pasta?',
      'What are the benefits of exercise?',
      'Can you recommend a good book?',
    ];

    generalQuestions.forEach(question => {
      const intent = classifier.classifyIntent(question);
      expect(intent.primaryDomain).toBe('general');
      expect(intent.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  it('should extract entities from questions', () => {
    const question = 'How do I sort an array in JavaScript?';
    const entities = classifier.extractEntities(question);
    
    expect(entities).toContain('JavaScript');
    expect(entities).toContain('array');
    expect(entities).toContain('sort');
  });

  it('should handle edge cases', () => {
    // Very short question
    const shortIntent = classifier.classifyIntent('Hi');
    expect(shortIntent.primaryDomain).toBe('general');
    
    // Empty question
    const emptyIntent = classifier.classifyIntent('');
    expect(emptyIntent.primaryDomain).toBe('general');
    
    // Question with special characters
    const specialIntent = classifier.classifyIntent('How do I fix this @#$% error?');
    expect(specialIntent.primaryDomain).toBe('coding'); // Likely coding due to "fix" and "error"
  });

  it('should rank candidate models', () => {
    const question = 'How do I create a React component?';
    const intent = classifier.classifyIntent(question);
    const candidates = ['gemma-3-270m-it-MLC', 'qwen2.5-coder-1.5b'];
    
    const ranked = classifier.rankCandidateModels(intent, candidates);
    
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toBeDefined();
    expect(ranked[1]).toBeDefined();
  });

  it('should detect follow-up questions', () => {
    const followUpQuestions = [
      'Can you explain that again?',
      'What about the second method?',
      'How does that work exactly?',
      'Could you show me an example?',
    ];

    followUpQuestions.forEach(question => {
      const isFollowUp = classifier.isFollowUpQuestion(question);
      expect(isFollowUp).toBe(true);
    });

    const nonFollowUpQuestions = [
      'How do I write a function?',
      'What is React?',
      'Can you help me with math?',
    ];

    nonFollowUpQuestions.forEach(question => {
      const isFollowUp = classifier.isFollowUpQuestion(question);
      expect(isFollowUp).toBe(false);
    });
  });
});