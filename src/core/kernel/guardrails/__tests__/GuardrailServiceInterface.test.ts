// src/core/kernel/guardrails/__tests__/GuardrailServiceInterface.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inputFilter } from '../InputFilter';
import { outputGuard } from '../OutputGuard';
import { rateLimiter } from '../RateLimiter';
import { auditLogger } from '../AuditLogger';
import { watermarkingService } from '../WatermarkingService';

describe('GuardrailServiceInterface', () => {
  describe('Common Interface Compliance', () => {
    const services = [
      { name: 'InputFilter', service: inputFilter },
      { name: 'OutputGuard', service: outputGuard },
      { name: 'RateLimiter', service: rateLimiter },
      { name: 'AuditLogger', service: auditLogger },
      { name: 'WatermarkingService', service: watermarkingService }
    ];

    services.forEach(({ name, service }) => {
      it(`should have required properties for ${name}`, () => {
        expect(service).toHaveProperty('serviceName');
        expect(service).toHaveProperty('version');
        expect(typeof service.serviceName).toBe('string');
        expect(typeof service.version).toBe('string');
      });

      it(`should have required methods for ${name}`, () => {
        expect(service).toHaveProperty('initialize');
        expect(service).toHaveProperty('shutdown');
        expect(service).toHaveProperty('getStats');
        expect(service).toHaveProperty('resetStats');
        
        // Check that methods are functions
        expect(typeof service.initialize).toBe('function');
        expect(typeof service.shutdown).toBe('function');
        expect(typeof service.getStats).toBe('function');
        expect(typeof service.resetStats).toBe('function');
      });

      it(`should have non-empty service name and version for ${name}`, () => {
        expect(service.serviceName).not.toBe('');
        expect(service.version).not.toBe('');
      });
    });
  });

  describe('Service Initialization', () => {
    const services = [
      { name: 'InputFilter', service: inputFilter },
      { name: 'OutputGuard', service: outputGuard },
      { name: 'RateLimiter', service: rateLimiter },
      { name: 'AuditLogger', service: auditLogger },
      { name: 'WatermarkingService', service: watermarkingService }
    ];

    services.forEach(({ name, service }) => {
      it(`should initialize ${name} service`, async () => {
        // Mock console.log to avoid noise in tests
        const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        
        await expect(service.initialize()).resolves.not.toThrow();
        
        // Restore console.log
        consoleSpy.mockRestore();
      });

      it(`should shutdown ${name} service`, async () => {
        // Mock console.log to avoid noise in tests
        const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        
        await expect(service.shutdown()).resolves.not.toThrow();
        
        // Restore console.log
        consoleSpy.mockRestore();
      });
    });
  });

  describe('Service Statistics', () => {
    beforeEach(() => {
      // Reset all services before each test
      inputFilter.resetStats();
      outputGuard.resetStats();
      rateLimiter.resetStats();
      auditLogger.resetStats();
      watermarkingService.resetStats();
    });

    it('should get stats from all services', () => {
      const services = [
        { name: 'InputFilter', service: inputFilter },
        { name: 'OutputGuard', service: outputGuard },
        { name: 'RateLimiter', service: rateLimiter },
        { name: 'AuditLogger', service: auditLogger },
        { name: 'WatermarkingService', service: watermarkingService }
      ];

      services.forEach(({ name, service }) => {
        const stats = service.getStats();
        expect(stats).toBeDefined();
        expect(typeof stats).toBe('object');
      });
    });

    it('should reset stats for all services', () => {
      // Perform some operations to generate stats
      rateLimiter.isAllowed('test-user');
      auditLogger.logSecurityEvent('TEST_EVENT', { test: 'data' });
      
      // Reset stats
      inputFilter.resetStats();
      outputGuard.resetStats();
      rateLimiter.resetStats();
      auditLogger.resetStats();
      watermarkingService.resetStats();
      
      // Verify stats are reset (where applicable)
      const rateLimiterStats = rateLimiter.getStats();
      expect(rateLimiterStats.totalTracked).toBe(0);
      expect(rateLimiterStats.bannedCount).toBe(0);
    });
  });
});