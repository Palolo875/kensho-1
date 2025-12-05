// src/core/kernel/guardrails/OutputGuard.ts
import { createLogger } from '@/lib/logger';
import { auditLogger } from './AuditLogger';
import { GuardrailService } from './GuardrailServiceInterface';

// Export interfaces for external use
export type { SanitizationResult };

const log = createLogger('OutputGuard');

// Policy types for different sanitization levels
export type SanitizationPolicy = 'DEVELOPMENT' | 'PRODUCTION_STRICT' | 'GDPR_ANONYMIZATION';

// Contextual regex patterns for sensitive data
const SENSITIVE_PATTERNS = [
  // API Keys and tokens (generic patterns)
  { 
    regex: /\b[A-Za-z0-9_]{32,}\b/, 
    replacement: '[API_KEY_REDACTED]', 
    category: 'GENERIC_API_KEY',
    description: 'Generic API key pattern',
    policies: ['DEVELOPMENT', 'PRODUCTION_STRICT', 'GDPR_ANONYMIZATION']
  },
  
  // Email addresses
  {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    replacement: '[EMAIL_REDACTED]',
    category: 'PERSONAL_EMAIL',
    description: 'Email address',
    policies: ['DEVELOPMENT', 'PRODUCTION_STRICT', 'GDPR_ANONYMIZATION']
  },
  
  // Phone numbers (various formats)
  {
    regex: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    replacement: '[PHONE_REDACTED]',
    category: 'PERSONAL_PHONE',
    description: 'Phone number',
    policies: ['PRODUCTION_STRICT', 'GDPR_ANONYMIZATION']
  },
  
  // Credit card numbers (simplified pattern)
  {
    regex: /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/,
    replacement: '[CARD_NUMBER_REDACTED]',
    category: 'FINANCIAL_DATA',
    description: 'Credit card number',
    policies: ['PRODUCTION_STRICT', 'GDPR_ANONYMIZATION']
  },
  
  // Social Security Numbers
  {
    regex: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,
    replacement: '[SSN_REDACTED]',
    category: 'PERSONAL_ID',
    description: 'Social Security Number',
    policies: ['GDPR_ANONYMIZATION']
  },
  
  // Inappropriate content markers
  {
    regex: /\b(contenu\.inapproprié|information\.sensible)\b/i,
    replacement: '[INAPPROPRIATE_CONTENT_REDACTED]',
    category: 'INAPPROPRIATE_CONTENT',
    description: 'Inappropriate content marker',
    policies: ['DEVELOPMENT', 'PRODUCTION_STRICT', 'GDPR_ANONYMIZATION']
  }
];

interface SanitizationResult {
  sanitized: string;
  modified: boolean;
  removedCount: number;
  detectedTypes: string[];
}

class OutputGuard implements GuardrailService {
  readonly serviceName = 'OutputGuard';
  readonly version = '1.0.0';
  
  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    log.info(`${this.serviceName} v${this.version} initialized`);
  }
  
  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    log.info(`${this.serviceName} shutdown completed`);
  }
  
  /**
   * Get service statistics/metrics
   */
  getStats(): Record<string, any> {
    // Stats are tracked in the auditLogger
    return {};
  }
  
  /**
   * Reset service statistics
   */
  resetStats(): void {
    // Stats are tracked in the auditLogger
  }

  /**
   * Sanitizes an outgoing response based on a specific policy
   * @param response The response to sanitize
   * @param policy The sanitization policy to apply
   * @returns The sanitized response and metadata about the sanitization
   */
  public sanitize(response: string, policy: SanitizationPolicy = 'PRODUCTION_STRICT'): SanitizationResult {
    if (!response || typeof response !== 'string') {
      log.warn('[OutputGuard] ⚠️ Invalid response format');
      auditLogger.logSecurityEvent('OUTPUT_SANITIZATION_FAILED', { reason: 'Invalid response format' });
      return {
        sanitized: '',
        modified: false,
        removedCount: 0,
        detectedTypes: []
      };
    }

    let sanitizedResponse = response;
    let modifications: Array<{ pattern: string; original: string; replacement: string }> = [];
    let isModified = false;
    const detectedTypes = new Set<string>();

    // Apply all sanitization patterns that match the current policy
    for (const { regex, replacement, category, description, policies } of SENSITIVE_PATTERNS) {
      // Skip patterns that don't apply to the current policy
      if (!policies.includes(policy)) {
        continue;
      }

      const globalRegex = new RegExp(regex, 'g');
      const matches = sanitizedResponse.match(globalRegex);
      
      if (matches) {
        matches.forEach(match => {
          // Only replace if it's not a false positive (e.g., looks like a real pattern)
          if (this.isValidMatch(match, category)) {
            const original = match;
            sanitizedResponse = sanitizedResponse.replace(regex, replacement);
            isModified = true;
            modifications.push({ pattern: description, original, replacement });
            detectedTypes.add(category);
          }
        });
      }
    }

    if (isModified) {
      log.warn(`[OutputGuard] ⚠️ Response modified to remove sensitive content (${modifications.length} patterns)`);
      auditLogger.logSecurityEvent('OUTPUT_SANITIZED', { 
        modifications: modifications.length,
        patterns: modifications.map(m => m.pattern),
        policy,
        detectedTypes: Array.from(detectedTypes)
      });
    } else {
      log.info('[OutputGuard] ✅ Response validated as safe');
      auditLogger.logSecurityEvent('OUTPUT_VALIDATION_PASSED', { responseLength: response.length, policy });
    }

    return {
      sanitized: sanitizedResponse,
      modified: isModified,
      removedCount: modifications.length,
      detectedTypes: Array.from(detectedTypes)
    };
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