// src/core/kernel/guardrails/__tests__/OutputGuard.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { outputGuard } from '../OutputGuard';

describe('OutputGuard', () => {
  beforeEach(() => {
    // Reset any state if needed
  });

  describe('sanitize', () => {
    it('should allow safe responses', () => {
      const response = 'The weather today is sunny and warm.';
      const result = outputGuard.sanitize(response);
      expect(result).toBe(response);
    });

    it('should redact API keys', () => {
      const response = 'Your API key is abc123xyz789def456ghi';
      const result = outputGuard.sanitize(response);
      expect(result).toContain('[API_KEY_REDACTED]');
      expect(result).not.toContain('abc123xyz789def456ghi');
    });

    it('should redact email addresses', () => {
      const response = 'Please contact john.doe@example.com for more information.';
      const result = outputGuard.sanitize(response);
      expect(result).toContain('[EMAIL_REDACTED]');
      expect(result).not.toContain('john.doe@example.com');
    });

    it('should redact phone numbers', () => {
      const response = 'Call me at 555-123-4567 tomorrow.';
      const result = outputGuard.sanitize(response);
      expect(result).toContain('[PHONE_REDACTED]');
      expect(result).not.toContain('555-123-4567');
    });

    it('should redact credit card numbers', () => {
      const response = 'My card number is 1234-5678-9012-3456.';
      const result = outputGuard.sanitize(response);
      expect(result).toContain('[CARD_NUMBER_REDACTED]');
      expect(result).not.toContain('1234-5678-9012-3456');
    });

    it('should handle inappropriate content markers', () => {
      const response = 'This contains contenu inapproprié that should be removed.';
      const result = outputGuard.sanitize(response);
      expect(result).toContain('[INAPPROPRIATE_CONTENT_REDACTED]');
      expect(result).not.toContain('contenu inapproprié');
    });

    it('should reduce false positives', () => {
      // This looks like an API key but is just a random string
      const response = 'The code is abcdefghijklmnopqrstuvwxyz';
      const result = outputGuard.sanitize(response);
      // Should not be redacted because it's all letters
      expect(result).toBe(response);
    });

    it('should handle edge cases', () => {
      // Empty string
      expect(outputGuard.sanitize('')).toBe('');
      
      // Null/undefined
      expect(outputGuard.sanitize(null as any)).toBe('');
      expect(outputGuard.sanitize(undefined as any)).toBe('');
      
      // Non-string
      expect(outputGuard.sanitize(123 as any)).toBe('');
    });

    it('should handle multiple sensitive patterns', () => {
      const response = 'Contact john.doe@example.com or call 555-123-4567. My API key is abc123xyz789def456.';
      const result = outputGuard.sanitize(response);
      
      expect(result).toContain('[EMAIL_REDACTED]');
      expect(result).toContain('[PHONE_REDACTED]');
      expect(result).toContain('[API_KEY_REDACTED]');
      expect(result).not.toContain('john.doe@example.com');
      expect(result).not.toContain('555-123-4567');
      expect(result).not.toContain('abc123xyz789def456');
    });
  });
});