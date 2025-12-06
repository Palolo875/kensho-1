/**
 * LoggerService v2.0 - Télémétrie Structurée Améliorée
 *
 * Remplace tous les console.log() par un système de logging production-ready
 * avec persistance, redaction, sampling, tracing et alerting.
 */

// Types pour le LoggerService
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string; // ISO 8601
  level: LogLevel;
  service: string; // Nom du service émetteur
  message: string; // Message humainement lisible
  data?: Record<string, any>; // Métadonnées structurées
  error?: {
    message: string;
    stack?: string;
  };
  correlationId?: string; // Pour le tracing distribué
}

interface LogPayload {
  message: string;
  service: string;
  data?: Record<string, any>;
  error?: Error;
}

interface AlertRule {
  id: string;
  serviceName: string;
  condition: (metrics: any) => boolean;
  message: string;
  webhookUrl?: string;
  silenceDuration?: number; // en millisecondes
}

// Service de stockage pour la persistance des logs
import { storageManager } from '../StorageManager';

class LoggerService {
  // Variables d'environnement avec fallback pour le navigateur
  private readonly IS_PRODUCTION = import.meta.env?.PROD || false;
  private readonly MIN_LOG_LEVEL: LogLevel = 
    (import.meta.env?.VITE_LOG_LEVEL as LogLevel) || 'INFO';

  private readonly LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    'DEBUG': 0,
    'INFO': 1,
    'WARN': 2,
    'ERROR': 3
  };

  // Buffer pour la persistance des logs
  private logBuffer: any[] = [];
  private readonly MAX_BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 10000; // 10s
  private correlationId: string | null = null;

  // Sampling pour les logs haute fréquence
  private logCounts: Map<string, { count: number, lastLogged: number }> = new Map();
  private readonly SAMPLE_RATE: Record<LogLevel, number> = {
    'DEBUG': 0.1,  // Log seulement 10% des DEBUG
    'INFO': 1.0,   // Log tous les INFO
    'WARN': 1.0,   // Log tous les WARN
    'ERROR': 1.0   // Log TOUJOURS les erreurs
  };

  // Redaction des données sensibles
  private readonly SENSITIVE_KEYS = ['password', 'token', 'apiKey', 'secret', 'creditCard'];
  private readonly EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

  // Métriques agrégées
  private metrics = {
    byLevel: { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 },
    byService: new Map<string, number>(),
    errorRate: 0
  };

  // AlertManager pour le système d'alerting
  private alertRules: AlertRule[] = [];
  private alertSilenceMap: Map<string, number> = new Map(); // silenceUntil timestamp

  // Stockage temporaire en mémoire pour le fallback
  private inMemoryStorage: Map<string, string> = new Map();

  constructor() {
    // Flush périodique
    setInterval(() => this.flushLogs(), this.FLUSH_INTERVAL);

    // Flush avant fermeture de la page
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushLogs());
    }
  }

  public setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  public clearCorrelationId(): void {
    this.correlationId = null;
  }

  public debug(service: string, message: string, data?: Record<string, any>): void {
    if (this.shouldLog('DEBUG')) {
      this.log('DEBUG', { service, message, data });
    }
  }

  public info(service: string, message: string, data?: Record<string, any>): void {
    if (this.shouldLog('INFO')) {
      this.log('INFO', { service, message, data });
    }
  }

  public warn(service: string, message: string, data?: Record<string, any>): void {
    if (this.shouldLog('WARN')) {
      this.log('WARN', { service, message, data });
    }
  }

  public error(service: string, message: string, error?: Error, data?: Record<string, any>): void {
    if (this.shouldLog('ERROR')) {
      this.log('ERROR', { 
        service, 
        message, 
        data,
        error
      });
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.LOG_LEVEL_PRIORITY[level] >= 
           this.LOG_LEVEL_PRIORITY[this.MIN_LOG_LEVEL];
  }

  private shouldSample(level: LogLevel, service: string, message: string): boolean {
    const key = `${service}:${message}`;
    const now = Date.now();
    const stats = this.logCounts.get(key);

    // Toujours logger les erreurs
    if (level === 'ERROR') return true;

    if (!stats) {
      this.logCounts.set(key, { count: 1, lastLogged: now });
      return true;
    }

    stats.count++;

    // Si on a déjà loggé ce message il y a moins de 1s, sample
    if (now - stats.lastLogged < 1000) {
      return Math.random() < this.SAMPLE_RATE[level];
    }

    stats.lastLogged = now;
    return true;
  }

  private redactSensitiveData(obj: any): any {
    if (typeof obj !== 'object' || obj === null) return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactSensitiveData(item));
    }

    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Redact les clés sensibles
      if (this.SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
        redacted[key] = '***REDACTED***';
        continue;
      }

      // Redact les emails dans les strings
      if (typeof value === 'string') {
        redacted[key] = value.replace(this.EMAIL_REGEX, '***@***.***');
      } else {
        redacted[key] = this.redactSensitiveData(value);
      }
    }
    return redacted;
  }

  private log(level: LogLevel, payload: LogPayload): void {
    // Sampling
    if (!this.shouldSample(level, payload.service, payload.message)) {
      return; // Skip ce log
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: this.correlationId || undefined,
      service: payload.service,
      message: payload.message,
      data: payload.data ? this.redactSensitiveData(payload.data) : undefined,
      error: payload.error ? { 
        message: payload.error.message, 
        stack: payload.error.stack 
      } : undefined
    };

    // Affiche dans la console en dev
    if (!this.IS_PRODUCTION) {
      console.log(JSON.stringify(logEntry, null, 2));
    }

    // Mettre à jour les métriques
    this.updateMetrics(level, payload.service);

    // Buffer pour persistance
    this.logBuffer.push(logEntry);

    // Flush immédiat si erreur critique ou buffer plein
    if (level === 'ERROR' || this.logBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushLogs();
    }
  }

  private updateMetrics(level: LogLevel, service: string): void {
    // Agrège les métriques
    this.metrics.byLevel[level]++;
    const serviceCount = this.metrics.byService.get(service) || 0;
    this.metrics.byService.set(service, serviceCount + 1);

    const total = Object.values(this.metrics.byLevel).reduce((a, b) => a + b, 0);
    this.metrics.errorRate = total > 0 ? this.metrics.byLevel.ERROR / total : 0;
  }

  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // Sauvegarde dans OPFS avec retry exponentiel
      const timestamp = Date.now();
      const filename = `logs/session-${timestamp}.json`;
      await this.saveWithRetry(filename, JSON.stringify(logsToFlush));

      // En prod : envoie à un service externe
      // await fetch('https://logs.kensho.ai/ingest', {
      //   method: 'POST',
      //   body: JSON.stringify(logsToFlush)
      // });
    } catch (error) {
      console.error('[LoggerService] Échec du flush:', error);
      // Restaure les logs dans le buffer pour retry
      this.logBuffer.unshift(...logsToFlush);
    }
  }

  // Retry exponentiel avec fallback vers in-memory storage
  private async saveWithRetry(filename: string, data: string, attempt: number = 0): Promise<void> {
    const maxRetries = 3;
    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s

    try {
      await storageManager.saveFile(filename, data);
    } catch (error) {
      if (attempt < maxRetries) {
        console.warn(`[LoggerService] Retry ${attempt + 1}/${maxRetries} dans ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.saveWithRetry(filename, data, attempt + 1);
      } else {
        // Fallback vers in-memory storage
        console.error('[LoggerService] Fallback vers in-memory storage');
        // Stockage temporaire en mémoire
        this.inMemoryStorage.set(filename, data);
        throw error;
      }
    }
  }

  // Méthode pour récupérer les logs historiques
  public async getHistoricalLogs(
    filters?: { level?: LogLevel, service?: string, since?: number, correlationId?: string }
  ): Promise<any[]> {
    const logFiles = await storageManager.listFiles('logs/');
    const allLogs: any[] = [];

    for (const file of logFiles) {
      try {
        const content = await storageManager.readFile(file);
        const logs = JSON.parse(content);
        allLogs.push(...logs);
      } catch (error) {
        console.error(`[LoggerService] Erreur lors de la lecture du fichier ${file}:`, error);
        // Essayer depuis le stockage temporaire
        const tempContent = this.inMemoryStorage.get(file);
        if (tempContent) {
          try {
            const logs = JSON.parse(tempContent);
            allLogs.push(...logs);
          } catch (parseError) {
            console.error(`[LoggerService] Erreur de parsing du contenu temporaire:`, parseError);
          }
        }
      }
    }

    // Applique les filtres
    return allLogs.filter(log => {
      if (filters?.level && log.level !== filters.level) return false;
      if (filters?.service && log.service !== filters.service) return false;
      if (filters?.since && new Date(log.timestamp).getTime() < filters.since) return false;
      if (filters?.correlationId && log.correlationId !== filters.correlationId) return false;
      return true;
    });
  }

  public getMetrics(): any {
    return { ...this.metrics };
  }

  public addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
  }

  public async checkAlerts(): Promise<void> {
    const metrics = this.getMetrics();
    const now = Date.now();

    for (const rule of this.alertRules) {
      // Vérifier si l'alerte est en silence
      const silenceUntil = this.alertSilenceMap.get(rule.id) || 0;
      if (now < silenceUntil) continue;

      // Évaluer la règle
      if (rule.condition(metrics)) {
        // Déclencher l'alerte
        await this.triggerAlert(rule, metrics);
        
        // Mettre en silence pour éviter le spam
        if (rule.silenceDuration) {
          this.alertSilenceMap.set(rule.id, now + rule.silenceDuration);
        }
      }
    }
  }

  private async triggerAlert(rule: AlertRule, metrics: any): Promise<void> {
    const alertPayload = {
      level: 'ALERT',
      ruleId: rule.id,
      serviceName: rule.serviceName,
      message: rule.message,
      metrics: metrics,
      timestamp: new Date().toISOString()
    };

    // Envoyer à un webhook ou afficher une notification
    if (rule.webhookUrl) {
      try {
        await fetch(rule.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alertPayload)
        });
      } catch (error) {
        console.error('[LoggerService] Échec de l\'envoi de l\'alerte:', error);
      }
    }

    // Afficher une notification dans l'UI
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('logger-alert', { detail: alertPayload }));
    }
  }
}

// Export singleton
export const logger = new LoggerService();