/**
 * Content Security Policy (CSP) Manager for Kensho
 * Implements OWASP best practices for LLM applications
 * 
 * This module provides utilities for setting and managing CSP headers
 * to enhance the security of the browser-based AI system.
 */

export interface CSPDirective {
  directive: string;
  sources: string[];
}

export interface CSPConfig {
  directives: CSPDirective[];
  reportOnly?: boolean;
  reportUri?: string;
}

export class CSPManager {
  private config: CSPConfig;

  constructor(config: CSPConfig) {
    this.config = config;
  }

  /**
   * Generates a CSP header string from the current configuration
   */
  public generateCSPHeader(): string {
    const directives = this.config.directives.map(d => 
      `${d.directive} ${d.sources.join(' ')}`
    ).join('; ');

    if (this.config.reportOnly) {
      return `Content-Security-Policy-Report-Only: ${directives}`;
    }

    return `Content-Security-Policy: ${directives}`;
  }

  /**
   * Sets CSP headers for the application
   * Note: In a browser environment, headers are typically set by the server
   * This method is primarily for server-side implementations
   */
  public setCSPHeaders(headers: Record<string, string>): void {
    headers['Content-Security-Policy'] = this.generateCSPHeader();
    
    if (this.config.reportUri) {
      headers['Content-Security-Policy-Report-Only'] = 
        `${this.generateCSPHeader()}; report-uri ${this.config.reportUri}`;
    }
  }

  /**
   * Gets the current CSP configuration
   */
  public getConfig(): CSPConfig {
    return { ...this.config };
  }

  /**
   * Updates a specific directive in the CSP configuration
   */
  public updateDirective(directive: string, sources: string[]): void {
    const existingIndex = this.config.directives.findIndex(d => d.directive === directive);
    
    if (existingIndex >= 0) {
      this.config.directives[existingIndex].sources = [...sources];
    } else {
      this.config.directives.push({ directive, sources });
    }
  }
}

/**
 * Default CSP configuration following OWASP best practices for LLM applications
 */
export const DEFAULT_CSP_CONFIG: CSPConfig = {
  directives: [
    // Script sources - only allow self and strict-dynamic for enhanced security
    { directive: 'script-src', sources: ["'self'", "'strict-dynamic'", "'unsafe-inline'"] },
    
    // Object sources - disallow all plugins
    { directive: 'object-src', sources: ["'none'"] },
    
    // Base URI - restrict to self
    { directive: 'base-uri', sources: ["'self'"] },
    
    // Form actions - restrict to self
    { directive: 'form-action', sources: ["'self'"] },
    
    // Frame ancestors - disallow framing to prevent clickjacking
    { directive: 'frame-ancestors', sources: ["'none'"] },
    
    // Connect sources - restrict to self and localhost for development
    { directive: 'connect-src', sources: ["'self'", "localhost:*", "ws://localhost:*"] },
    
    // Image sources - allow self and data URIs
    { directive: 'img-src', sources: ["'self'", "data:", "https:"] },
    
    // Font sources - allow self and data URIs
    { directive: 'font-src', sources: ["'self'", "data:"] },
    
    // Style sources - allow self and unsafe-inline for Tailwind CSS
    { directive: 'style-src', sources: ["'self'", "'unsafe-inline'"] },
    
    // Worker sources - restrict to self for Web Workers
    { directive: 'worker-src', sources: ["'self'"] },
    
    // Manifest sources - restrict to self
    { directive: 'manifest-src', sources: ["'self'"] },
  ],
  reportOnly: false,
};

/**
 * Creates a default CSP manager with OWASP-recommended settings
 */
export function createDefaultCSPManager(): CSPManager {
  return new CSPManager(DEFAULT_CSP_CONFIG);
}