// src/core/kernel/guardrails/__tests__/RateLimiter.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimiter } from '../RateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    // Reset rate limiter state before each test
    rateLimiter.reset('test-user-123');
    rateLimiter.reset('admin-user-456');
    rateLimiter.reset('ip:192.168.1.1');
  });

  describe('isAllowed', () => {
    it('should allow requests within the limit', () => {
      const clientId = 'test-user-123';
      
      // Make 5 requests, all should be allowed
      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.isAllowed(clientId);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests exceeding the limit', () => {
      const clientId = 'test-user-123';
      
      // Use up all allowed requests
      for (let i = 0; i < 10; i++) {
        rateLimiter.isAllowed(clientId);
      }
      
      // Next request should be blocked
      const result = rateLimiter.isAllowed(clientId);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit exceeded');
    });

    it('should allow higher limits for authenticated users', () => {
      const clientId = 'authenticated-user-789';
      const context = { role: 'AUTHENTICATED' as const };
      
      // Make 20 requests, all should be allowed (limit is 50 for authenticated users)
      for (let i = 0; i < 20; i++) {
        const result = rateLimiter.isAllowed(clientId, context);
        expect(result.allowed).toBe(true);
      }
    });

    it('should allow very high limits for admin users', () => {
      const clientId = 'admin-user-456';
      const context = { role: 'ADMIN' as const };
      
      // Make 150 requests, all should be allowed (limit is 1000 for admin users)
      for (let i = 0; i < 150; i++) {
        const result = rateLimiter.isAllowed(clientId, context);
        expect(result.allowed).toBe(true);
      }
    });

    it('should handle IP fallback for anonymous users', () => {
      const clientId = 'anonymous';
      const context = { ip: '192.168.1.1' };
      
      // Make 5 requests, all should be allowed
      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.isAllowed(clientId, context);
        expect(result.allowed).toBe(true);
      }
    });

    it('should ban entities after too many violations', () => {
      const clientId = 'bad-user-999';
      
      // Exceed rate limit multiple times to trigger ban
      for (let j = 0; j < 6; j++) {
        // Use up all allowed requests
        for (let i = 0; i < 10; i++) {
          rateLimiter.isAllowed(clientId);
        }
        
        // Try one more request to trigger violation counting
        rateLimiter.isAllowed(clientId);
      }
      
      // Entity should now be banned
      const result = rateLimiter.isAllowed(clientId);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('banned');
    });
  });

  describe('getStatus', () => {
    it('should return correct status information', () => {
      const clientId = 'test-user-123';
      
      // Make a few requests
      rateLimiter.isAllowed(clientId);
      rateLimiter.isAllowed(clientId);
      
      const status = rateLimiter.getStatus(clientId);
      expect(status.remaining).toBe(8); // 10 - 2 = 8
      expect(status.isBanned).toBe(false);
      expect(status.violations).toBe(0);
      expect(status.limit).toBe(10);
    });

    it('should return correct status for different user roles', () => {
      const adminId = 'admin-user-456';
      const adminContext = { role: 'ADMIN' as const };
      
      const status = rateLimiter.getStatus(adminId, 'ADMIN');
      expect(status.limit).toBe(1000);
      
      const authStatus = rateLimiter.getStatus(adminId, 'AUTHENTICATED');
      expect(authStatus.limit).toBe(50);
      
      const defaultStatus = rateLimiter.getStatus(adminId, 'PUBLIC');
      expect(defaultStatus.limit).toBe(10);
    });
  });

  describe('reset', () => {
    it('should reset rate limit for an entity', () => {
      const clientId = 'test-user-123';
      
      // Use up some requests
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed(clientId);
      }
      
      // Reset the rate limit
      rateLimiter.reset(clientId);
      
      // Check that status is reset
      const status = rateLimiter.getStatus(clientId);
      expect(status.remaining).toBe(10);
      expect(status.violations).toBe(0);
    });
  });
});