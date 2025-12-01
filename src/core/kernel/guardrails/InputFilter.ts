// src/core/kernel/guardrails/InputFilter.ts
import { createLogger } from '@/lib/logger';
import { auditLogger } from './AuditLogger';

const log = createLogger('InputFilter');

// Enhanced blocked patterns with categories
const BLOCKED_PATTERNS = [
  // Instruction override attempts
  { pattern: 'ignore.previous.instruction', category: 'INSTRUCTION_OVERRIDE', severity: 'HIGH' },
  { pattern: 'ignore.all.previous', category: 'INSTRUCTION_OVERRIDE', severity: 'HIGH' },
  { pattern: 'disregard.previous', category: 'INSTRUCTION_OVERRIDE', severity: 'HIGH' },
  
  // API keys and secrets
  { pattern: 'api.key', category: 'SECRET_LEAK', severity: 'CRITICAL' },
  { pattern: 'secret.key', category: 'SECRET_LEAK', severity: 'CRITICAL' },
  { pattern: 'auth.token', category: 'SECRET_LEAK', severity: 'CRITICAL' },
  { pattern: 'password', category: 'SECRET_LEAK', severity: 'HIGH' },
  
  // System commands
  { pattern: 'system.exec', category: 'COMMAND_INJECTION', severity: 'CRITICAL' },
  { pattern: 'eval(', category: 'CODE_INJECTION', severity: 'HIGH' },
  
  // Data exfiltration
  { pattern: 'send.data', category: 'DATA_EXFILTRATION', severity: 'HIGH' },
  { pattern: 'upload.file', category: 'DATA_EXFILTRATION', severity: 'MEDIUM' },
];

class InputFilter {
  /**
   * Normalizes text for consistent pattern matching
   * Removes accents, extra spaces, and converts to lowercase
   */
  private normalizeText(text: string): string {
    return text
      .normalize('NFD') // Decompose accents
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/\s+/g, '.') // Replace spaces with dots
      .replace(/[-_]/g, '.') // Replace hyphens and underscores
      .toLowerCase()
      .trim();
  }

  /**
   * Detects potential Base64 encoded content
   */
  private detectBase64(text: string): boolean {
    const base64Regex = /[A-Za-z0-9+/]{20,}={0,2}/g;
    const matches = text.match(base64Regex);
    return !!matches && matches.some(match => {
      try {
        atob(match);
        return true;
      } catch {
        return false;
      }
    });
  }

  /**
   * Validates an incoming prompt
   * @returns An object indicating if the prompt is safe and a reason if rejected
   */
  public validate(prompt: string): { safe: boolean; reason?: string; category?: string; severity?: string } {
    if (!prompt || typeof prompt !== 'string') {
      const result = { 
        safe: false, 
        reason: 'Invalid prompt format', 
        category: 'MALFORMED_INPUT', 
        severity: 'MEDIUM' 
      };
      log.warn(`[InputFilter] 🚨 ${result.reason}`);
      auditLogger.logSecurityEvent('INPUT_VALIDATION_FAILED', result);
      return result;
    }

    const normalizedPrompt = this.normalizeText(prompt);
    
    // Check for Base64 encoded content
    if (this.detectBase64(prompt)) {
      const result = { 
        safe: false, 
        reason: 'Prompt contains potentially encoded malicious content', 
        category: 'ENCODED_CONTENT', 
        severity: 'HIGH' 
      };
      log.warn(`[InputFilter] 🚨 ${result.reason}`);
      auditLogger.logSecurityEvent('INPUT_VALIDATION_FAILED', result);
      return result;
    }

    // Check against blocked patterns
    for (const { pattern, category, severity } of BLOCKED_PATTERNS) {
      if (normalizedPrompt.includes(pattern)) {
        const result = { 
          safe: false, 
          reason: `Rejected: Prompt contains forbidden pattern ("${pattern}")`, 
          category, 
          severity 
        };
        log.warn(`[InputFilter] 🚨 ${result.reason}`);
        auditLogger.logSecurityEvent('INPUT_VALIDATION_FAILED', result);
        return result;
      }
    }

    log.info('[InputFilter] ✅ Prompt validated as safe');
    auditLogger.logSecurityEvent('INPUT_VALIDATION_PASSED', { promptLength: prompt.length });
    return { safe: true };
  }
}

export const inputFilter = new InputFilter();