// src/core/kernel/guardrails/__tests__/OutputGuard.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { outputGuard } from '../OutputGuard';

// Test the GuardrailService interface compliance
it('should comply with GuardrailService interface', () => {
  // Check properties
  expect(outputGuard).toHaveProperty('serviceName');
  expect(outputGuard).toHaveProperty('version');
  expect(typeof outputGuard.serviceName).toBe('string');
  expect(typeof outputGuard.version).toBe('string');
  
  // Check methods
  expect(outputGuard).toHaveProperty('initialize');
  expect(outputGuard).toHaveProperty('shutdown');
  expect(outputGuard).toHaveProperty('getStats');
  expect(outputGuard).toHaveProperty('resetStats');
  
  // Check that methods are functions
  expect(typeof outputGuard.initialize).toBe('function');
  expect(typeof outputGuard.shutdown).toBe('function');
  expect(typeof outputGuard.getStats).toBe('function');
  expect(typeof outputGuard.resetStats).toBe('function');
});

describe('OutputGuard', () => {
  beforeEach(() => {
    // Reset any state if needed
  });

  describe('sanitize', () => {
    it('should allow safe responses', () => {
      const response = 'The weather today is sunny and warm.';
      const result = outputGuard.sanitize(response);
      expect(result.sanitized).toBe(response);
      expect(result.modified).toBe(false);
      expect(result.removedCount).toBe(0);
      expect(result.detectedTypes).toEqual([]);
    });

    it('should redact API keys', () => {
      const response = 'Your API key is abc123xyz789def456ghi';
      const result = outputGuard.sanitize(response);
      expect(result.sanitized).toContain('[API_KEY_REDACTED]');
      expect(result.sanitized).not.toContain('abc123xyz789def456ghi');
      expect(result.modified).toBe(true);
      expect(result.removedCount).toBeGreaterThan(0);
      expect(result.detectedTypes).toContain('GENERIC_API_KEY');
    });

    it('should redact email addresses', () => {
      const response = 'Please contact john.doe@example.com for more information.';
      const result = outputGuard.sanitize(response);
      expect(result.sanitized).toContain('[EMAIL_REDACTED]');
      expect(result.sanitized).not.toContain('john.doe@example.com');
      expect(result.modified).toBe(true);
      expect(result.removedCount).toBeGreaterThan(0);
      expect(result.detectedTypes).toContain('PERSONAL_EMAIL');
    });

    it('should redact phone numbers with production strict policy', () => {
      const response = 'Call me at 555-123-4567 tomorrow.';
      const result = outputGuard.sanitize(response, 'PRODUCTION_STRICT');
      expect(result.sanitized).toContain('[PHONE_REDACTED]');
      expect(result.sanitized).not.toContain('555-123-4567');
      expect(result.modified).toBe(true);
      expect(result.removedCount).toBeGreaterThan(0);
      expect(result.detectedTypes).toContain('PERSONAL_PHONE');
    });

    it('should not redact phone numbers with development policy', () => {
      const response = 'Call me at 555-123-4567 tomorrow.';
      const result = outputGuard.sanitize(response, 'DEVELOPMENT');
      expect(result.sanitized).toBe(response);
      expect(result.modified).toBe(false);
      expect(result.removedCount).toBe(0);
    });

    it('should redact credit card numbers', () => {
      const response = 'My card number is 1234-5678-9012-3456.';
      const result = outputGuard.sanitize(response);
      expect(result.sanitized).toContain('[CARD_NUMBER_REDACTED]');
      expect(result.sanitized).not.toContain('1234-5678-9012-3456');
      expect(result.modified).toBe(true);
      expect(result.removedCount).toBeGreaterThan(0);
      expect(result.detectedTypes).toContain('FINANCIAL_DATA');
    });

    it('should redact SSN with GDPR policy', () => {
      const response = 'My SSN is 123-45-6789.';
      const result = outputGuard.sanitize(response, 'GDPR_ANONYMIZATION');
      expect(result.sanitized).toContain('[SSN_REDACTED]');
      expect(result.sanitized).not.toContain('123-45-6789');
      expect(result.modified).toBe(true);
      expect(result.removedCount).toBeGreaterThan(0);
      expect(result.detectedTypes).toContain('PERSONAL_ID');
    });

    it('should handle inappropriate content markers', () => {
      const response = 'This contains contenu inapproprié that should be removed.';
      const result = outputGuard.sanitize(response);
      expect(result.sanitized).toContain('[INAPPROPRIATE_CONTENT_REDACTED]');
      expect(result.sanitized).not.toContain('contenu inapproprié');
      expect(result.modified).toBe(true);
      expect(result.removedCount).toBeGreaterThan(0);
      expect(result.detectedTypes).toContain('INAPPROPRIATE_CONTENT');
    });

    it('should reduce false positives', () => {
      // This looks like an API key but is just a random string
      const response = 'The code is abcdefghijklmnopqrstuvwxyz';
      const result = outputGuard.sanitize(response);
      // Should not be redacted because it's all letters
      expect(result.sanitized).toBe(response);
      expect(result.modified).toBe(false);
    });

    it('should handle edge cases', () => {
      // Empty string
      expect(outputGuard.sanitize('').sanitized).toBe('');
      
      // Null/undefined
      expect(outputGuard.sanitize(null as any).sanitized).toBe('');
      expect(outputGuard.sanitize(undefined as any).sanitized).toBe('');
      
      // Non-string
      expect(outputGuard.sanitize(123 as any).sanitized).toBe('');
    });

    it('should handle multiple sensitive patterns', () => {
      const response = 'Contact john.doe@example.com or call 555-123-4567. My API key is abc123xyz789def456.';
      const result = outputGuard.sanitize(response);
      
      expect(result.sanitized).toContain('[EMAIL_REDACTED]');
      expect(result.sanitized).toContain('[PHONE_REDACTED]');
      expect(result.sanitized).toContain('[API_KEY_REDACTED]');
      expect(result.sanitized).not.toContain('john.doe@example.com');
      expect(result.sanitized).not.toContain('555-123-4567');
      expect(result.sanitized).not.toContain('abc123xyz789def456');
      expect(result.modified).toBe(true);
      expect(result.removedCount).toBe(3);
      expect(result.detectedTypes).toContain('PERSONAL_EMAIL');
      expect(result.detectedTypes).toContain('PERSONAL_PHONE');
      expect(result.detectedTypes).toContain('GENERIC_API_KEY');
    });
  });
});