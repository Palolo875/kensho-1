/**
 * Security Middleware for Kensho
 * Implements OWASP best practices for LLM applications
 * 
 * This module provides Express.js-style middleware functions for enhancing
 * the security of the application through various techniques.
 */

import { CSPManager, createDefaultCSPManager } from './CSPManager';
import { ValidationResult, Validators } from './InputValidator';
import { createLogger } from '@/lib/logger';

const log = createLogger('SecurityMiddleware');

/**
 * Middleware function interface
 */
export interface MiddlewareFunction {
  (req: any, res: any, next: () => void): void;
}

/**
 * Security middleware that applies various security measures
 */
export class SecurityMiddleware {
  private cspManager: CSPManager;

  constructor() {
    this.cspManager = createDefaultCSPManager();
  }

  /**
   * Applies CSP headers to the response
   */
  public csp(): MiddlewareFunction {
    return (req: any, res: any, next: () => void) => {
      try {
        // Apply CSP headers
        const cspHeader = this.cspManager.generateCSPHeader();
        res.setHeader('Content-Security-Policy', cspHeader);
        
        log.debug('SecurityMiddleware', 'CSP headers applied successfully');
        next();
      } catch (error) {
        log.error('SecurityMiddleware', 'Failed to apply CSP headers', error);
        next();
      }
    };
  }

  /**
   * Validates and sanitizes request body
   */
  public validateBody(validator: any): MiddlewareFunction {
    return (req: any, res: any, next: () => void) => {
      try {
        const result: ValidationResult<any> = validator.parse(req.body);
        
        if (result.success) {
          req.body = result.data;
          log.debug('SecurityMiddleware', 'Request body validated successfully');
          next();
        } else {
          log.warn(`Request body validation failed: ${JSON.stringify({ errors: result.errors })}`);
          res.status(400).json({
            error: 'Validation failed',
            details: result.errors
          });
        }
      } catch (error) {
        log.error('SecurityMiddleware', 'Error during body validation', error);
        res.status(500).json({
          error: 'Internal server error during validation'
        });
      }
    };
  }

  /**
   * Validates and sanitizes request query parameters
   */
  public validateQuery(validator: any): MiddlewareFunction {
    return (req: any, res: any, next: () => void) => {
      try {
        const result: ValidationResult<any> = validator.parse(req.query);
        
        if (result.success) {
          req.query = result.data;
          log.debug('SecurityMiddleware', 'Query parameters validated successfully');
          next();
        } else {
          log.warn(`Query parameters validation failed: ${JSON.stringify({ errors: result.errors })}`);
          res.status(400).json({
            error: 'Validation failed',
            details: result.errors
          });
        }
      } catch (error) {
        log.error('SecurityMiddleware', 'Error during query validation', error);
        res.status(500).json({
          error: 'Internal server error during validation'
        });
      }
    };
  }

  /**
   * Validates and sanitizes request headers
   */
  public validateHeaders(validator: any): MiddlewareFunction {
    return (req: any, res: any, next: () => void) => {
      try {
        const result: ValidationResult<any> = validator.parse(req.headers);
        
        if (result.success) {
          req.headers = result.data;
          log.debug('SecurityMiddleware', 'Request headers validated successfully');
          next();
        } else {
          log.warn(`Request headers validation failed: ${JSON.stringify({ errors: result.errors })}`);
          res.status(400).json({
            error: 'Validation failed',
            details: result.errors
          });
        }
      } catch (error) {
        log.error('SecurityMiddleware', 'Error during headers validation', error);
        res.status(500).json({
          error: 'Internal server error during validation'
        });
      }
    };
  }

  /**
   * Rate limiting middleware to prevent abuse
   */
  public rateLimit(maxRequests: number = 100, windowMs: number = 60000): MiddlewareFunction {
    const clients = new Map<string, { count: number; resetTime: number }>();
    
    return (req: any, res: any, next: () => void) => {
      try {
        const clientId = req.ip || req.connection.remoteAddress;
        
        if (!clientId) {
          log.warn('SecurityMiddleware', 'Unable to identify client for rate limiting');
          return next();
        }
        
        const now = Date.now();
        const clientData = clients.get(clientId);
        
        if (!clientData || clientData.resetTime <= now) {
          // Reset the counter for this client
          clients.set(clientId, {
            count: 1,
            resetTime: now + windowMs
          });
          next();
        } else if (clientData.count < maxRequests) {
          // Increment the counter
          clientData.count++;
          clients.set(clientId, clientData);
          next();
        } else {
          // Rate limit exceeded
          log.warn(`Rate limit exceeded for client: ${JSON.stringify({ clientId })}`);
          res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.'
          });
        }
      } catch (error) {
        log.error('SecurityMiddleware', 'Error during rate limiting', error);
        next();
      }
    };
  }

  /**
   * Helmet-like middleware for common security headers
   */
  public helmet(): MiddlewareFunction {
    return (req: any, res: any, next: () => void) => {
      try {
        // Hide Express server information
        res.removeHeader('X-Powered-By');
        
        // Prevent MIME type sniffing
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        // Prevent clickjacking
        res.setHeader('X-Frame-Options', 'DENY');
        
        // Enable XSS filtering
        res.setHeader('X-XSS-Protection', '1; mode=block');
        
        // Force HTTPS
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        
        log.debug('SecurityMiddleware', 'Helmet security headers applied');
        next();
      } catch (error) {
        log.error('SecurityMiddleware', 'Error applying helmet headers', error);
        next();
      }
    };
  }

  /**
   * Adds security headers to the response
   */
  public securityHeaders(): MiddlewareFunction {
    return (req: any, res: any, next: () => void) => {
      try {
        // Referrer policy
        res.setHeader('Referrer-Policy', 'no-referrer');
        
        // Permissions policy
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        
        // Feature policy (deprecated but still useful for older browsers)
        res.setHeader('Feature-Policy', "geolocation 'none'; microphone 'none'; camera 'none'");
        
        log.debug('SecurityMiddleware', 'Additional security headers applied');
        next();
      } catch (error) {
        log.error('SecurityMiddleware', 'Error applying security headers', error);
        next();
      }
    };
  }
}

/**
 * Creates a new security middleware instance
 */
export function createSecurityMiddleware(): SecurityMiddleware {
  return new SecurityMiddleware();
}

/**
 * Default security middleware instance
 */
export const securityMiddleware = createSecurityMiddleware();