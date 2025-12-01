// src/core/kernel/guardrails/AuditLogger.ts
import { createLogger } from '@/lib/logger';

const log = createLogger('AuditLogger');

// In-memory storage for audit events (in production, this would go to a secure log store)
const auditEvents: Array<{
  timestamp: number;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: any;
}> = [];

class AuditLogger {
  /**
   * Logs a security event
   */
  public logSecurityEvent(
    eventType: string, 
    details: any,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM'
  ): void {
    const event = {
      timestamp: Date.now(),
      eventType,
      severity,
      details
    };
    
    auditEvents.push(event);
    
    // Keep only the last 1000 events to prevent memory issues
    if (auditEvents.length > 1000) {
      auditEvents.shift();
    }
    
    // Log to console with appropriate level
    const message = `[Audit] ${eventType}: ${JSON.stringify(details)}`;
    switch (severity) {
      case 'CRITICAL':
        log.error(message);
        break;
      case 'HIGH':
        log.warn(message);
        break;
      case 'MEDIUM':
        log.info(message);
        break;
      case 'LOW':
        log.debug(message);
        break;
    }
  }

  /**
   * Gets recent audit events
   */
  public getRecentEvents(count: number = 50): any[] {
    return auditEvents.slice(-count);
  }

  /**
   * Clears all audit events
   */
  public clearEvents(): void {
    auditEvents.length = 0;
  }

  /**
   * Gets statistics about security events
   */
  public getStatistics(): { 
    totalEvents: number; 
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
  } {
    const stats = {
      totalEvents: auditEvents.length,
      eventsByType: {} as Record<string, number>,
      eventsBySeverity: {} as Record<string, number>
    };

    for (const event of auditEvents) {
      stats.eventsByType[event.eventType] = (stats.eventsByType[event.eventType] || 0) + 1;
      stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
    }

    return stats;
  }
}

export const auditLogger = new AuditLogger();