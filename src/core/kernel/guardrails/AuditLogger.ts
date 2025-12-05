// src/core/kernel/guardrails/AuditLogger.ts
import { createLogger } from '@/lib/logger';
import { GuardrailService } from './GuardrailServiceInterface';

const log = createLogger('AuditLogger');

// In-memory storage for audit events (in production, this would go to a secure log store)
const auditEvents: Array<{
  timestamp: number;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: any;
  requestId?: string;
  userId?: string;
  model?: string;
  policyVersion?: string;
}> = [];

interface AuditEvent {
  timestamp: number;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: any;
  requestId?: string;
  userId?: string;
  model?: string;
  policyVersion?: string;
}

interface AuditContext {
  requestId?: string;
  userId?: string;
  model?: string;
  policyVersion?: string;
}

class AuditLogger implements GuardrailService {
  readonly serviceName = 'AuditLogger';
  readonly version = '1.0.0';
  
  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    log.info(`${this.serviceName} v${this.version} initialized`);
  }
  
  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    log.info(`${this.serviceName} shutdown completed`);
  }
  
  /**
   * Get service statistics/metrics
   */
  getStats(): Record<string, any> {
    return this.getStatistics();
  }
  
  /**
   * Reset service statistics
   */
  resetStats(): void {
    this.clearEvents();
  }

  /**
   * Logs a security event with enhanced metadata
   */
  public logSecurityEvent(
    eventType: string, 
    details: any,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM',
    context?: AuditContext
  ): void {
    const event: AuditEvent = {
      timestamp: Date.now(),
      eventType,
      severity,
      details,
      ...context
    };
    
    auditEvents.push(event);
    
    // Keep only the last 1000 events to prevent memory issues
    if (auditEvents.length > 1000) {
      auditEvents.shift();
    }
    
    // Log to console with appropriate level
    const contextStr = context ? ` [Context: ${JSON.stringify(context)}]` : '';
    const message = `[Audit] ${eventType}: ${JSON.stringify(details)}${contextStr}`;
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
  public getRecentEvents(count: number = 50): AuditEvent[] {
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
    eventsByUser?: Record<string, number>;
    eventsByModel?: Record<string, number>;
  } {
    const stats = {
      totalEvents: auditEvents.length,
      eventsByType: {} as Record<string, number>,
      eventsBySeverity: {} as Record<string, number>,
      eventsByUser: {} as Record<string, number>,
      eventsByModel: {} as Record<string, number>
    };

    for (const event of auditEvents) {
      stats.eventsByType[event.eventType] = (stats.eventsByType[event.eventType] || 0) + 1;
      stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
      
      if (event.userId) {
        stats.eventsByUser[event.userId] = (stats.eventsByUser[event.userId] || 0) + 1;
      }
      
      if (event.model) {
        stats.eventsByModel[event.model] = (stats.eventsByModel[event.model] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Detects anomalous behavior based on event patterns
   */
  public detectAnomalies(): Array<{userId: string, anomalyType: string, count: number}> {
    const anomalies: Array<{userId: string, anomalyType: string, count: number}> = [];
    
    // Group events by user
    const eventsByUser: Record<string, AuditEvent[]> = {};
    for (const event of auditEvents) {
      if (event.userId) {
        if (!eventsByUser[event.userId]) {
          eventsByUser[event.userId] = [];
        }
        eventsByUser[event.userId].push(event);
      }
    }
    
    // Check for anomalies per user
    for (const [userId, userEvents] of Object.entries(eventsByUser)) {
      // Count blocked prompts
      const blockedPrompts = userEvents.filter(e => e.eventType === 'INPUT_VALIDATION_FAILED').length;
      if (blockedPrompts > 10) { // Threshold for anomaly
        anomalies.push({
          userId,
          anomalyType: 'HIGH_BLOCKED_PROMPTS',
          count: blockedPrompts
        });
      }
      
      // Count frequent sanitizations
      const sanitizations = userEvents.filter(e => e.eventType === 'OUTPUT_SANITIZED').length;
      if (sanitizations > 20) { // Threshold for anomaly
        anomalies.push({
          userId,
          anomalyType: 'HIGH_SANITIZATION_RATE',
          count: sanitizations
        });
      }
    }
    
    return anomalies;
  }
}

export const auditLogger = new AuditLogger();