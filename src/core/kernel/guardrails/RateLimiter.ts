// src/core/kernel/guardrails/RateLimiter.ts
import { createLogger } from '@/lib/logger';
import { auditLogger } from './AuditLogger';

const log = createLogger('RateLimiter');

// In-memory storage for rate limiting (in production, this would use Redis or similar)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 60000, // 1 minute
  maxRequests: {
    DEFAULT: 10,        // Default limit for public users
    AUTHENTICATED: 50,  // Higher limit for authenticated users
    ADMIN: 1000         // Very high limit for admins
  },
  banThreshold: 50, // Ban after 50 violations
};

// Track banned IPs/users
const bannedEntities = new Set<string>();
const violationCounts = new Map<string, number>();

// User roles for different rate limits
type UserRole = 'PUBLIC' | 'AUTHENTICATED' | 'ADMIN';

interface RateLimitContext {
  ip?: string;
  role?: UserRole;
}

interface RateLimitStatus {
  remaining: number; 
  resetTime: number; 
  isBanned: boolean;
  violations: number;
  limit: number;
}

class RateLimiter {
  /**
   * Creates a composite identifier considering both user ID and IP as fallback
   */
  private createIdentifier(identifier: string, context?: RateLimitContext): string {
    if (context?.ip && identifier === 'anonymous') {
      return `ip:${context.ip}`;
    }
    return identifier;
  }

  /**
   * Gets the request limit based on user role
   */
  private getRequestLimit(role: UserRole = 'PUBLIC'): number {
    return RATE_LIMIT_CONFIG.maxRequests[role] || RATE_LIMIT_CONFIG.maxRequests.DEFAULT;
  }

  /**
   * Checks if an entity (IP/userId) is allowed to make a request
   * @returns Object indicating if request is allowed and reset time if not
   */
  public isAllowed(identifier: string, context?: RateLimitContext): { allowed: boolean; resetTime?: number; reason?: string; status?: RateLimitStatus } {
    const effectiveIdentifier = this.createIdentifier(identifier, context);
    const userRole = context?.role || 'PUBLIC';
    
    // Check if entity is banned
    if (bannedEntities.has(effectiveIdentifier)) {
      const reason = `Entity ${effectiveIdentifier} is banned due to excessive violations`;
      log.warn(`[RateLimiter] 🚫 ${reason}`);
      auditLogger.logSecurityEvent('RATE_LIMIT_BANNED', { identifier: effectiveIdentifier, reason: 'Banned entity' }, 'HIGH');
      return { 
        allowed: false, 
        reason,
        status: this.getStatus(effectiveIdentifier, userRole)
      };
    }

    const now = Date.now();
    const windowStart = now - RATE_LIMIT_CONFIG.windowMs;
    
    // Clean up old request counts
    for (const [key, value] of requestCounts.entries()) {
      if (value.resetTime < windowStart) {
        requestCounts.delete(key);
      }
    }

    const record = requestCounts.get(effectiveIdentifier);
    const limit = this.getRequestLimit(userRole);
    
    // If no record exists or window has expired, create new record
    if (!record || record.resetTime < now) {
      requestCounts.set(effectiveIdentifier, {
        count: 1,
        resetTime: now + RATE_LIMIT_CONFIG.windowMs
      });
      return { 
        allowed: true,
        status: this.getStatus(effectiveIdentifier, userRole)
      };
    }

    // Increment request count
    record.count++;

    // Check if limit exceeded
    if (record.count > limit) {
      const reason = `Rate limit exceeded for ${effectiveIdentifier}: ${record.count} requests in current window (limit: ${limit})`;
      log.warn(`[RateLimiter] ⚠️ ${reason}`);
      
      // Track violations
      const violations = (violationCounts.get(effectiveIdentifier) || 0) + 1;
      violationCounts.set(effectiveIdentifier, violations);
      
      // Ban if too many violations
      if (violations >= RATE_LIMIT_CONFIG.banThreshold) {
        bannedEntities.add(effectiveIdentifier);
        const banReason = `Entity ${effectiveIdentifier} banned after ${violations} violations`;
        log.error(`[RateLimiter] 🚫 ${banReason}`);
        auditLogger.logSecurityEvent('RATE_LIMIT_BANNED', { identifier: effectiveIdentifier, violations }, 'CRITICAL');
        return { 
          allowed: false, 
          reason: banReason,
          status: this.getStatus(effectiveIdentifier, userRole)
        };
      }
      
      auditLogger.logSecurityEvent('RATE_LIMIT_EXCEEDED', { identifier: effectiveIdentifier, count: record.count, limit }, 'MEDIUM');
      return { 
        allowed: false, 
        resetTime: record.resetTime,
        reason,
        status: this.getStatus(effectiveIdentifier, userRole)
      };
    }

    // Update the record
    requestCounts.set(effectiveIdentifier, record);
    return { 
      allowed: true,
      status: this.getStatus(effectiveIdentifier, userRole)
    };
  }

  /**
   * Gets current rate limit status for an entity
   */
  public getStatus(identifier: string, role: UserRole = 'PUBLIC'): RateLimitStatus {
    const record = requestCounts.get(identifier);
    const violations = violationCounts.get(identifier) || 0;
    const isBanned = bannedEntities.has(identifier);
    const limit = this.getRequestLimit(role);
    
    if (!record) {
      return {
        remaining: limit,
        resetTime: Date.now() + RATE_LIMIT_CONFIG.windowMs,
        isBanned,
        violations,
        limit
      };
    }
    
    return {
      remaining: Math.max(0, limit - record.count),
      resetTime: record.resetTime,
      isBanned,
      violations,
      limit
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