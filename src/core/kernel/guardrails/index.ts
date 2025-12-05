// src/core/kernel/guardrails/index.ts
// Export all guardrail components

export { inputFilter } from './InputFilter';
export { outputGuard } from './OutputGuard';
export { auditLogger } from './AuditLogger';
export { rateLimiter } from './RateLimiter';
export { watermarkingService } from './WatermarkingService';

// Export types
export type { ValidationResult } from './InputFilter';
export type { SanitizationResult, SanitizationPolicy } from './OutputGuard';
export type { RateLimitStatus, UserRole } from './RateLimiter';
export type { WatermarkingResult, WatermarkMetadata } from './WatermarkingService';