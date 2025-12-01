// src/core/kernel/guardrails/RateLimiter.ts
import { createLogger } from '@/lib/logger';
import { auditLogger } from './AuditLogger';

const log = createLogger('RateLimiter');

// In-memory storage for rate limiting (in production, this would use Redis or similar)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 60000, // 1 minute
  maxRequests: 10,  // 10 requests per window
  banThreshold: 50, // Ban after 50 violations
};

// Track banned IPs/users
const bannedEntities = new Set<string>();
const violationCounts = new Map<string, number>();

class RateLimiter {
  /**
   * Checks if an entity (IP/userId) is allowed to make a request
   * @returns Object indicating if request is allowed and reset time if not
   */
  public isAllowed(identifier: string): { allowed: boolean; resetTime?: number; reason?: string } {
    // Check if entity is banned
    if (bannedEntities.has(identifier)) {
      const reason = `Entity ${identifier} is banned due to excessive violations`;
      log.warn(`[RateLimiter] 🚫 ${reason}`);
      auditLogger.logSecurityEvent('RATE_LIMIT_BANNED', { identifier, reason: 'Banned entity' }, 'HIGH');
      return { allowed: false, reason };
    }

    const now = Date.now();
    const windowStart = now - RATE_LIMIT_CONFIG.windowMs;
    
    // Clean up old request counts
    for (const [key, value] of requestCounts.entries()) {
      if (value.resetTime < windowStart) {
        requestCounts.delete(key);
      }
    }

    const record = requestCounts.get(identifier);
    
    // If no record exists or window has expired, create new record
    if (!record || record.resetTime < now) {
      requestCounts.set(identifier, {
        count: 1,
        resetTime: now + RATE_LIMIT_CONFIG.windowMs
      });
      return { allowed: true };
    }

    // Increment request count
    record.count++;

    // Check if limit exceeded
    if (record.count > RATE_LIMIT_CONFIG.maxRequests) {
      const reason = `Rate limit exceeded for ${identifier}: ${record.count} requests in current window`;
      log.warn(`[RateLimiter] ⚠️ ${reason}`);
      
      // Track violations
      const violations = (violationCounts.get(identifier) || 0) + 1;
      violationCounts.set(identifier, violations);
      
      // Ban if too many violations
      if (violations >= RATE_LIMIT_CONFIG.banThreshold) {
        bannedEntities.add(identifier);
        const banReason = `Entity ${identifier} banned after ${violations} violations`;
        log.error(`[RateLimiter] 🚫 ${banReason}`);
        auditLogger.logSecurityEvent('RATE_LIMIT_BANNED', { identifier, violations }, 'CRITICAL');
        return { allowed: false, reason: banReason };
      }
      
      auditLogger.logSecurityEvent('RATE_LIMIT_EXCEEDED', { identifier, count: record.count }, 'MEDIUM');
      return { 
        allowed: false, 
        resetTime: record.resetTime,
        reason 
      };
    }

    // Update the record
    requestCounts.set(identifier, record);
    return { allowed: true };
  }

  /**
   * Gets current rate limit status for an entity
   */
  public getStatus(identifier: string): { 
    remaining: number; 
    resetTime: number; 
    isBanned: boolean;
    violations: number;
  } {
    const record = requestCounts.get(identifier);
    const violations = violationCounts.get(identifier) || 0;
    const isBanned = bannedEntities.has(identifier);
    
    if (!record) {
      return {
        remaining: RATE_LIMIT_CONFIG.maxRequests,
        resetTime: Date.now() + RATE_LIMIT_CONFIG.windowMs,
        isBanned,
        violations
      };
    }
    
    return {
      remaining: Math.max(0, RATE_LIMIT_CONFIG.maxRequests - record.count),
      resetTime: record.resetTime,
      isBanned,
      violations
    };
  }

  /**
   * Resets rate limit for an entity (for testing/admin purposes)
   */
  public reset(identifier: string): void {
    requestCounts.delete(identifier);
    violationCounts.delete(identifier);
    bannedEntities.delete(identifier);
    log.info(`[RateLimiter] Reset rate limit for ${identifier}`);
  }

  /**
   * Gets statistics about rate limiting
   */
  public getStatistics(): {
    totalTracked: number;
    bannedCount: number;
    violationStats: Record<string, number>;
  } {
    return {
      totalTracked: requestCounts.size,
      bannedCount: bannedEntities.size,
      violationStats: Object.fromEntries(violationCounts)
    };
  }
}

export const rateLimiter = new RateLimiter();