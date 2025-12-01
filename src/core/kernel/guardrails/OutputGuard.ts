// src/core/kernel/guardrails/OutputGuard.ts
import { createLogger } from '@/lib/logger';
import { auditLogger } from './AuditLogger';

const log = createLogger('OutputGuard');

// Contextual regex patterns for sensitive data
const SENSITIVE_PATTERNS = [
  // API Keys and tokens (generic patterns)
  { 
    regex: /\b[A-Za-z0-9_]{32,}\b/, 
    replacement: '[API_KEY_REDACTED]', 
    category: 'GENERIC_API_KEY',
    description: 'Generic API key pattern'
  },
  
  // Email addresses
  {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    replacement: '[EMAIL_REDACTED]',
    category: 'PERSONAL_EMAIL',
    description: 'Email address'
  },
  
  // Phone numbers (various formats)
  {
    regex: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    replacement: '[PHONE_REDACTED]',
    category: 'PERSONAL_PHONE',
    description: 'Phone number'
  },
  
  // Credit card numbers (simplified pattern)
  {
    regex: /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/,
    replacement: '[CARD_NUMBER_REDACTED]',
    category: 'FINANCIAL_DATA',
    description: 'Credit card number'
  },
  
  // Social Security Numbers
  {
    regex: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,
    replacement: '[SSN_REDACTED]',
    category: 'PERSONAL_ID',
    description: 'Social Security Number'
  },
  
  // Inappropriate content markers
  {
    regex: /\b(contenu\.inapproprié|information\.sensible)\b/i,
    replacement: '[INAPPROPRIATE_CONTENT_REDACTED]',
    category: 'INAPPROPRIATE_CONTENT',
    description: 'Inappropriate content marker'
  }
];

class OutputGuard {
  /**
   * Sanitizes an outgoing response
   * @returns The sanitized response
   */
  public sanitize(response: string): string {
    if (!response || typeof response !== 'string') {
      log.warn('[OutputGuard] ⚠️ Invalid response format');
      auditLogger.logSecurityEvent('OUTPUT_SANITIZATION_FAILED', { reason: 'Invalid response format' });
      return '';
    }

    let sanitizedResponse = response;
    let modifications: Array<{ pattern: string; original: string; replacement: string }> = [];
    let isModified = false;

    // Apply all sanitization patterns
    for (const { regex, replacement, category, description } of SENSITIVE_PATTERNS) {
      const matches = sanitizedResponse.match(new RegExp(regex, 'g'));
      
      if (matches) {
        matches.forEach(match => {
          // Only replace if it's not a false positive (e.g., looks like a real pattern)
          if (this.isValidMatch(match, category)) {
            const original = match;
            sanitizedResponse = sanitizedResponse.replace(regex, replacement);
            isModified = true;
            modifications.push({ pattern: description, original, replacement });
          }
        });
      }
    }

    if (isModified) {
      log.warn(`[OutputGuard] ⚠️ Response modified to remove sensitive content (${modifications.length} patterns)`);
      auditLogger.logSecurityEvent('OUTPUT_SANITIZED', { 
        modifications: modifications.length,
        patterns: modifications.map(m => m.pattern)
      });
    } else {
      log.info('[OutputGuard] ✅ Response validated as safe');
      auditLogger.logSecurityEvent('OUTPUT_VALIDATION_PASSED', { responseLength: response.length });
    }

    return sanitizedResponse;
  }

  /**
   * Validates if a match is likely to be a real sensitive pattern
   * Reduces false positives
   */
  private isValidMatch(match: string, category: string): boolean {
    // For API keys, check if it looks realistic
    if (category === 'GENERIC_API_KEY') {
      // Must have both letters and numbers, and not be too repetitive
      const hasLetters = /[a-zA-Z]/.test(match);
      const hasNumbers = /[0-9]/.test(match);
      const isRepetitive = /^(.)\1+$/.test(match);
      return hasLetters && hasNumbers && !isRepetitive;
    }
    
    // For other categories, accept the match
    return true;
  }
}

export const outputGuard = new OutputGuard();