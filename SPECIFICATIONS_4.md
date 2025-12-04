# 🔧 Spécifications Techniques - Ensemble 4

## 🎯 Tâche #21 : Télémétrie Structurée Améliorée

### Contexte
Le système de logging actuel utilise `console.log()` basique, ce qui ne permet pas une exploitation efficace des logs en production. Nous devons mettre en place un système de télémétrie structurée avec persistance, redaction, sampling et tracing.

### Objectif
Remplacer tous les `console.log()` par un `LoggerService` centralisé qui produit des logs JSON structurés et production-ready.

### Spécifications Techniques Détaillées

#### 1. Structure des Logs
```typescript
interface LogEntry {
  timestamp: string; // ISO 8601
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  service: string; // Nom du service émetteur
  message: string; // Message humainement lisible
  data?: Record<string, any>; // Métadonnées structurées
  error?: {
    message: string;
    stack?: string;
  };
  correlationId?: string; // Pour le tracing distribué
}
```

#### 2. LoggerService Centralisé
```typescript
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
        error: error ? { message: error.message, stack: error.stack } : undefined
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

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: this.correlationId,
      ...payload,
      data: payload.data ? this.redactSensitiveData(payload.data) : undefined
    };

    // Affiche dans la console en dev
    if (!this.IS_PRODUCTION) {
      console.log(JSON.stringify(logEntry, null, 2));
    }

    // Buffer pour persistance
    this.logBuffer.push(logEntry);

    // Flush immédiat si erreur critique ou buffer plein
    if (level === 'ERROR' || this.logBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushLogs();
    }
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

  // Métriques agrégées
  private metrics = {
    byLevel: { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 },
    byService: new Map<string, number>(),
    errorRate: 0
  };

  public getMetrics(): any {
    return { ...this.metrics };
  }

  // AlertManager pour le système d'alerting
  private alertRules: AlertRule[] = [];
  private alertSilenceMap: Map<string, number> = new Map(); // silenceUntil timestamp

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

// Types pour l'AlertManager
interface AlertRule {
  id: string;
  serviceName: string;
  condition: (metrics: any) => boolean;
  message: string;
  webhookUrl?: string;
  silenceDuration?: number; // en millisecondes
}
```

#### 3. Intégration dans les Services Existants
Tous les services doivent utiliser le LoggerService centralisé :

```typescript
// Exemple d'intégration dans DialoguePlugin
class DialoguePlugin {
  private logger = new LoggerService();

  async process(prompt: string): Promise<string> {
    const correlationId = uuidv4();
    this.logger.setCorrelationId(correlationId);

    try {
      this.logger.info('DialoguePlugin', 'Début du traitement', { prompt: prompt.substring(0, 50) });
      
      const plan = await router.createPlan(prompt);
      this.logger.debug('DialoguePlugin', 'Plan créé', { planSteps: plan.steps.length });
      
      const result = await taskExecutor.executePlan(plan);
      this.logger.info('DialoguePlugin', 'Fin du traitement');
      
      return result;
    } catch (error) {
      this.logger.error('DialoguePlugin', 'Échec du traitement', error, { prompt: prompt.substring(0, 50) });
      throw error;
    } finally {
      this.logger.clearCorrelationId();
    }
  }
}

// Exemple d'intégration dans TaskExecutor
class TaskExecutor {
  private logger = new LoggerService();

  async executeTask(task: Task): Promise<any> {
    this.logger.info('TaskExecutor', `Exécution de la tâche ${task.type}`, { taskId: task.id });
    
    try {
      const result = await this.executeTaskInternal(task);
      this.logger.info('TaskExecutor', `Tâche terminée avec succès`, { taskId: task.id });
      return result;
    } catch (error) {
      this.logger.error('TaskExecutor', `Échec de la tâche ${task.type}`, error, { taskId: task.id });
      throw error;
    }
  }
}
```

#### 4. Composant UI pour Visualiser les Logs
```tsx
// LogViewer.tsx
import React, { useState, useEffect } from 'react';

function LogViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState({ level: 'ALL', service: 'ALL' });

  useEffect(() => {
    const interval = setInterval(async () => {
      const historicalLogs = await logger.getHistoricalLogs(
        filter.level !== 'ALL' ? { level: filter.level as LogLevel } : undefined
      );
      setLogs(historicalLogs.slice(-100)); // Derniers 100 logs
    }, 1000);

    return () => clearInterval(interval);
  }, [filter]);

  return (
    <div className="log-viewer">
      <div className="log-filters">
        <select onChange={e => setFilter({ ...filter, level: e.target.value })}>
          <option value="ALL">All Levels</option>
          <option value="ERROR">Errors</option>
          <option value="WARN">Warnings</option>
          <option value="INFO">Info</option>
          <option value="DEBUG">Debug</option>
        </select>
        
        <select onChange={e => setFilter({ ...filter, service: e.target.value })}>
          <option value="ALL">All Services</option>
          <option value="DialoguePlugin">DialoguePlugin</option>
          <option value="TaskExecutor">TaskExecutor</option>
          <option value="Router">Router</option>
        </select>
      </div>

      <div className="log-list">
        {logs.map((log, i) => (
          <div key={i} className={`log-entry log-${log.level.toLowerCase()}`}>
            <span className="timestamp">[{log.timestamp}]</span>
            <span className="level">{log.level}</span>
            <span className="service">{log.service}</span>
            <span className="message">{log.message}</span>
            {log.correlationId && <span className="correlation-id">CID: {log.correlationId}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 5. Configuration Environnement
Fichiers `.env` :

```bash
# .env.development
VITE_LOG_LEVEL=DEBUG

# .env.production
VITE_LOG_LEVEL=WARN
```

### Résultats Attendus
1. Tous les services utilisent le LoggerService centralisé
2. Logs structurés en JSON avec tous les champs requis
3. Persistance des logs dans OPFS avec retry exponentiel
4. Redaction automatique des données sensibles
5. Sampling intelligent pour les logs haute fréquence
6. Tracing distribué avec correlationId
7. Métriques agrégées disponibles
8. Système d'alerting avec AlertManager
9. Composant UI pour visualiser les logs
10. Configuration par environnement fonctionnelle

## 🎯 Tâche #22 : [À définir]

[Vide - À remplir avec la prochaine tâche]