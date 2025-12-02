// src/core/kernel/guardrails/InputFilter.ts
import { createLogger } from '@/lib/logger';
import { auditLogger } from './AuditLogger';

const log = createLogger('InputFilter');

// Enhanced blocked patterns with categories and severity levels
const BLOCKED_PATTERNS = [
  // Instruction override attempts
  { pattern: 'ignore.previous.instruction', category: 'INSTRUCTION_OVERRIDE', severity: 'HIGH' },
  { pattern: 'ignore.all.previous', category: 'INSTRUCTION_OVERRIDE', severity: 'HIGH' },
  { pattern: 'disregard.previous', category: 'INSTRUCTION_OVERRIDE', severity: 'HIGH' },
  
  // Prompt injection patterns
  { pattern: 'dan says', category: 'PROMPT_INJECTION', severity: 'HIGH' },
  { pattern: 'sim says', category: 'PROMPT_INJECTION', severity: 'HIGH' },
  { pattern: 'role-play', category: 'PROMPT_INJECTION', severity: 'MEDIUM' },
  { pattern: 'you are now', category: 'PROMPT_INJECTION', severity: 'MEDIUM' },
  
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
  
  // Jailbreak patterns
  { pattern: 'jailbreak', category: 'JAILBREAK', severity: 'HIGH' },
  { pattern: 'override restrictions', category: 'JAILBREAK', severity: 'HIGH' },
];

interface ValidationResult {
  safe: boolean;
  reason?: string;
  category?: string;
  severity?: string;
  detectedPatterns?: string[];
}

class InputFilter {
  /**
   * Advanced Unicode normalization removing zero-width characters and other invisible characters
   */
  private normalizeTextAdvanced(text: string): string {
    return text
      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Remove other invisible control characters
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      // Normalize Unicode NFD form (decompose accents)
      .normalize('NFD')
      // Remove diacritics
      .replace(/[\u0300-\u036f]/g, '')
      // Replace spaces with dots
      .replace(/\s+/g, '.')
      // Replace hyphens and underscores with dots
      .replace(/[-_]/g, '.')
      // Convert to lowercase
      .toLowerCase()
      // Trim whitespace
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
   * Validates an incoming prompt with advanced checks
   * @returns An object indicating if the prompt is safe and details about any issues found
   */
  public validate(prompt: string): ValidationResult {
    if (!prompt || typeof prompt !== 'string') {
      const result: ValidationResult = { 
        safe: false, 
        reason: 'Invalid prompt format', 
        category: 'MALFORMED_INPUT', 
        severity: 'MEDIUM' 
      };
      log.warn(`[InputFilter] 🚨 ${result.reason}`);
      auditLogger.logSecurityEvent('INPUT_VALIDATION_FAILED', result);
      return result;
    }

    const normalizedPrompt = this.normalizeTextAdvanced(prompt);
    
    // Check for Base64 encoded content
    if (this.detectBase64(prompt)) {
      const result: ValidationResult = { 
        safe: false, 
        reason: 'Prompt contains potentially encoded malicious content', 
        category: 'ENCODED_CONTENT', 
        severity: 'HIGH' 
      };
      log.warn(`[InputFilter] 🚨 ${result.reason}`);
      auditLogger.logSecurityEvent('INPUT_VALIDATION_FAILED', result);
      return result;
    }

    // Check against blocked patterns and collect all matches
    const detectedPatterns: string[] = [];
    let highestSeverity = 'LOW';
    let rejectionReason = '';
    let rejectionCategory = '';

    // Severity hierarchy for determining overall severity
    const severityHierarchy: Record<string, number> = {
      'LOW': 1,
      'MEDIUM': 2,
      'HIGH': 3,
      'CRITICAL': 4
    };

    for (const { pattern, category, severity } of BLOCKED_PATTERNS) {
      if (normalizedPrompt.includes(pattern)) {
        detectedPatterns.push(pattern);
        
        // Update highest severity if this pattern is more severe
        if (severityHierarchy[severity] > severityHierarchy[highestSeverity]) {
          highestSeverity = severity;
        }
        
        // Store the first (most significant) rejection reason
        if (!rejectionReason) {
          rejectionReason = `Rejected: Prompt contains forbidden pattern ("${pattern}")`;
          rejectionCategory = category;
        }
      }
    }

    // If any patterns were detected, reject the prompt
    if (detectedPatterns.length > 0) {
      const result: ValidationResult = { 
        safe: false, 
        reason: rejectionReason,
        category: rejectionCategory,
        severity: highestSeverity,
        detectedPatterns
      };
      log.warn(`[InputFilter] 🚨 ${result.reason}`);
      auditLogger.logSecurityEvent('INPUT_VALIDATION_FAILED', result);
      return result;
    }

    log.info('[InputFilter] ✅ Prompt validated as safe');
    auditLogger.logSecurityEvent('INPUT_VALIDATION_PASSED', { promptLength: prompt.length });
    return { safe: true };
  }
}

export const inputFilter = new InputFilter();