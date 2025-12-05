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

## 🎯 Tâche #22 : Améliorations du RuntimeManager

### Objectif
Améliorer le RuntimeManager avec du versioning de graphes, du feedback utilisateur pendant compilation, un cache mémoire observable et du warming planifié.

### Spécifications Techniques Détaillées

#### 1. Versioning des Graphes
```typescript
// Header JSON standardisé pour les graphes
interface GraphHeader {
  version: string;          // Version du graphe (ex: "1.2.3")
  modelName: string;        // Nom du modèle
  schemaHash: string;       // Hash du schéma pour vérification d'intégrité
  generatedAt: string;      // Timestamp de génération ISO 8601
  dependencies?: string[];  // Dépendances du graphe
}

class RuntimeManager {
  private readonly GRAPH_VERSION = '1.0.0';
  
  // Utilisation du header comme clé de cache
  private getGraphCacheKey(modelKey: string): string {
    return `${modelKey}@${this.GRAPH_VERSION}`;
  }
  
  // Nettoyage automatique des graphes obsolètes au boot
  public async cleanupObsoleteGraphs(): Promise<void> {
    const allGraphs = await storageManager.listGraphs();
    for (const graphKey of allGraphs) {
      const [modelName, version] = graphKey.split('@');
      if (version !== this.GRAPH_VERSION) {
        await storageManager.deleteGraph(graphKey);
        logger.info('RuntimeManager', `Graphe obsolète supprimé: ${graphKey}`);
      }
    }
  }
}
```

#### 2. Feedback Utilisateur Pendant Compilation
```typescript
class RuntimeManager {
  // Timeline simulée déterministe
  private readonly COMPILATION_STAGES = [
    { name: 'parsing', duration: 200 },
    { name: 'linking', duration: 300 },
    { name: 'optimizing', duration: 500 },
    { name: 'compiling', duration: 500 }
  ];

  public async compileModel(modelKey: string): Promise<void> {
    const correlationId = uuidv4();
    logger.setCorrelationId(correlationId);
    
    try {
      logger.info('RuntimeManager', 'Début de la compilation du modèle', { modelKey });
      
      // Émettre des événements de progression
      for (const stage of this.COMPILATION_STAGES) {
        // Émettre un événement de progression
        this.emitProgressEvent(stage.name, 'started');
        
        // Simuler le traitement avec une durée déterministe
        await new Promise(resolve => setTimeout(resolve, stage.duration));
        
        // Émettre un événement de progression
        this.emitProgressEvent(stage.name, 'completed');
      }
      
      logger.info('RuntimeManager', 'Compilation du modèle terminée', { modelKey });
    } catch (error) {
      logger.error('RuntimeManager', 'Échec de la compilation du modèle', error, { modelKey });
      throw error;
    } finally {
      logger.clearCorrelationId();
    }
  }
  
  private emitProgressEvent(stage: string, status: 'started' | 'completed'): void {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('compilation-progress', {
        detail: { stage, status, timestamp: Date.now() }
      }));
    }
  }
}
```

#### 3. Cache Mémoire Observable
```typescript
class LRUCache<T> {
  private cache: Map<string, { value: T, timestamp: number }> = new Map();
  private readonly maxSize: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  public get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      this.hits++;
      // Mettre à jour le timestamp pour LRU
      entry.timestamp = Date.now();
      return entry.value;
    }
    this.misses++;
    return undefined;
  }

  public set(key: string, value: T): void {
    // Éviction LRU si nécessaire
    if (this.cache.size >= this.maxSize) {
      let oldestKey = '';
      let oldestTimestamp = Infinity;
      
      for (const [k, v] of this.cache.entries()) {
        if (v.timestamp < oldestTimestamp) {
          oldestTimestamp = v.timestamp;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.info('LRUCache', `Éviction du graphe: ${oldestKey}`);
      }
    }
    
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  public getStats(): { size: number, hits: number, misses: number, hitRate: number } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;
    
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: parseFloat(hitRate.toFixed(4))
    };
  }

  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

class RuntimeManager {
  private graphCache = new LRUCache<CompiledGraph>(50); // Cache de 50 graphes max
  
  public getCacheStats(): ReturnType<LRUCache<any>['getStats']> {
    return this.graphCache.getStats();
  }
}
```

#### 4. Warming Planifié
```typescript
class RuntimeManager {
  private warmingScheduler: WorkerScheduler;
  private readonly WARMING_IDLE_TIMEOUT = 30000; // 30 secondes

  constructor() {
    this.warmingScheduler = new WorkerScheduler({
      priority: 'low', // Priorité basse pour ne pas bloquer l'UI
      idleCallback: true, // Utiliser requestIdleCallback
      maxConcurrency: 2 // Limiter la concurrence
    });
  }

  // Warming basé sur les metrics d'utilisation
  public async scheduleStrategicWarming(): Promise<void> {
    try {
      // Obtenir les modèles les plus fréquemment utilisés
      const topModels = await this.getModelUsageMetrics();
      
      for (const model of topModels.slice(0, 5)) { // Top 5 modèles
        // Planifier le warming avec une priorité basse
        this.warmingScheduler.schedule(async () => {
          await this.preWarmModel(model.modelKey);
        }, { priority: 'low' });
      }
      
      logger.info('RuntimeManager', 'Warming stratégique planifié', { 
        modelCount: Math.min(topModels.length, 5) 
      });
    } catch (error) {
      logger.error('RuntimeManager', 'Échec de la planification du warming stratégique', error);
    }
  }

  // Pré-warming d'un modèle
  private async preWarmModel(modelKey: string): Promise<void> {
    try {
      logger.info('RuntimeManager', 'Début du pré-warming du modèle', { modelKey });
      
      // Charger et compiler le modèle
      const compiledGraph = await this.loadAndCompileModel(modelKey);
      
      // Stocker dans le cache compressé
      const compressedGraph = await this.compressGraph(compiledGraph);
      const cacheKey = this.getGraphCacheKey(modelKey);
      await storageManager.saveCompressedGraph(cacheKey, compressedGraph);
      
      logger.info('RuntimeManager', 'Modèle pré-warmé avec succès', { modelKey });
    } catch (error) {
      logger.error('RuntimeManager', 'Échec du pré-warming du modèle', error, { modelKey });
    }
  }

  // Compression du graphe pour le stockage temporaire
  private async compressGraph(graph: CompiledGraph): Promise<Blob> {
    const jsonString = JSON.stringify(graph);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(jsonString));
        controller.close();
      }
    });
    
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    return await new Response(compressedStream).blob();
  }

  // Obtention des metrics d'utilisation des modèles
  private async getModelUsageMetrics(): Promise<{ modelKey: string; usageCount: number }[]> {
    // Simulation - en réalité, cela viendrait des logs/metrics
    return [
      { modelKey: 'llama-3.2-1b', usageCount: 1250 },
      { modelKey: 'mistral-7b', usageCount: 980 },
      { modelKey: 'phi-3-mini', usageCount: 750 },
      { modelKey: 'gemma-2b', usageCount: 620 },
      { modelKey: 'qwen-1.8b', usageCount: 450 }
    ];
  }
}

// Scheduler pour le warming planifié
class WorkerScheduler {
  private tasks: ScheduledTask[] = [];
  private readonly options: SchedulerOptions;

  constructor(options: SchedulerOptions) {
    this.options = options;
  }

  public schedule(task: () => Promise<void>, options: TaskOptions): void {
    const scheduledTask: ScheduledTask = {
      task,
      priority: options.priority || 'normal',
      scheduledAt: Date.now()
    };

    this.tasks.push(scheduledTask);
    this.processNextTask();
  }

  private async processNextTask(): Promise<void> {
    if (this.tasks.length === 0) return;

    // Trier par priorité
    this.tasks.sort((a, b) => {
      const priorityOrder = { 'high': 0, 'normal': 1, 'low': 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const nextTask = this.tasks.shift();
    if (!nextTask) return;

    try {
      if (this.options.idleCallback && typeof requestIdleCallback !== 'undefined') {
        // Utiliser requestIdleCallback pour le browser
        await new Promise<void>((resolve) => {
          requestIdleCallback(async () => {
            await nextTask.task();
            resolve();
          }, { timeout: this.options.idleTimeout || 1000 });
        });
      } else {
        // Exécuter directement
        await nextTask.task();
      }
    } catch (error) {
      logger.error('WorkerScheduler', 'Échec de l\'exécution de la tâche', error);
    }
  }
}

interface SchedulerOptions {
  priority: 'high' | 'normal' | 'low';
  idleCallback?: boolean;
  idleTimeout?: number;
  maxConcurrency?: number;
}

interface TaskOptions {
  priority: 'high' | 'normal' | 'low';
}

interface ScheduledTask {
  task: () => Promise<void>;
  priority: 'high' | 'normal' | 'low';
  scheduledAt: number;
}
```

### Résultats Attendus pour la Tâche #22
1. Versioning des graphes avec header standardisé et nettoyage automatique
2. Feedback utilisateur pendant compilation avec timeline simulée
3. Cache mémoire observable avec statistiques d'utilisation
4. Warming planifié basé sur les metrics d'utilisation
5. Compression des graphes pour le stockage temporaire
6. Scheduler intelligent pour le warming avec priorités

## 🎯 Tâche #23 : Suite de Benchmark

### Objectif
Créer un script de benchmark (npm run benchmark) qui exécute une série de scénarios standardisés sur notre "Usine Vide" et mesure des métriques de performance clés. Ce script doit pouvoir simuler différentes configurations matérielles pour évaluer la performance sur un éventail de "devices".

### Spécifications Techniques Détaillées

#### 1. DeviceSimulator
Ce module nous permettra de "tromper" notre ResourceManager pour qu'il croie tourner sur un appareil différent.

```typescript
// src/core/kernel/monitoring/DeviceSimulator.ts

import { resourceManager, DeviceStatus } from '../ResourceManager';

export type DeviceProfile = 'LOW_END_MOBILE' | 'MID_RANGE_TABLET' | 'HIGH_END_DESKTOP';

const PROFILES: Record<DeviceProfile, Partial<DeviceStatus>> = {
  'LOW_END_MOBILE': {
    cpu: { hardwareConcurrency: 2 },
    memory: { jsHeapSizeLimit: 2 * 1024**3, usageRatio: 0.8 },
    network: { effectiveType: '3g' },
    battery: { level: 0.4, isCharging: false }
  },
  'MID_RANGE_TABLET': {
    cpu: { hardwareConcurrency: 4 },
    memory: { jsHeapSizeLimit: 4 * 1024**3, usageRatio: 0.6 },
    network: { effectiveType: '4g' },
    battery: { level: 0.7, isCharging: false }
  },
  'HIGH_END_DESKTOP': {
    cpu: { hardwareConcurrency: 16 },
    memory: { jsHeapSizeLimit: 16 * 1024**3, usageRatio: 0.3 },
    network: { effectiveType: '4g' },
    battery: { isCharging: true, level: 1 }
  }
};

export function simulateDevice(profile: DeviceProfile): void {
  const status = PROFILES[profile];
  // "Monkey-patch" la méthode getStatus pour qu'elle retourne notre profil simulé
  resourceManager.getStatus = async () => {
    return { ...resourceManager.getInitialStatus(), ...status } as DeviceStatus;
  };
  console.log(`\n[Benchmark] 📱 Simulation du device: ${profile}`);
}
```

#### 2. Script de Benchmark
Ce script sera à la racine du projet et exécutera nos scénarios.

```typescript
// benchmark.ts (à la racine)

import { dialoguePlugin } from './src/core/plugins/DialoguePlugin';
import { simulateDevice, DeviceProfile } from './src/core/kernel/monitoring/DeviceSimulator';
import { logger } from './src/core/kernel/monitoring/LoggerService';

// Désactive les logs JSON pour un affichage plus propre du benchmark
logger.info = () => {};
logger.warn = () => {};
logger.error = () => {};

const SCENARIOS = {
  'Dialogue Simple': "Explique le concept de l'open source en une phrase.",
  'Tâche de Code': "Écris une fonction javascript qui inverse une chaîne de caractères.",
  'Requête Complexe (Parallèle)': "Écris un poème sur la lune et donne-moi le code d'une fonction qui calcule la factorielle."
};

async function runBenchmarkForProfile(profile: DeviceProfile) {
  simulateDevice(profile);
  
  const results: Record<string, number> = {};

  for (const [name, prompt] of Object.entries(SCENARIOS)) {
    const startTime = performance.now();
    
    // On appelle process, mais on ne se soucie pas de la réponse, juste du temps
    await dialoguePlugin.process(prompt);
    
    const duration = performance.now() - startTime;
    results[name] = Math.round(duration);
  }

  return results;
}

async function runAllBenchmarks() {
  console.log("📊 === DÉBUT DE LA SUITE DE BENCHMARKS === 📊");

  const allResults: Record<string, any> = {};

  allResults['LOW_END_MOBILE'] = await runBenchmarkForProfile('LOW_END_MOBILE');
  allResults['MID_RANGE_TABLET'] = await runBenchmarkForProfile('MID_RANGE_TABLET');
  allResults['HIGH_END_DESKTOP'] = await runBenchmarkForProfile('HIGH_END_DESKTOP');

  console.log("\n\n📈 === RÉSULTATS FINAUX (en ms) === 📈");
  console.table(allResults);
  console.log("\n✅ Suite de benchmarks terminée.");
}

runAllBenchmarks();
```

#### 3. Configuration du package.json
Ajout du script de benchmark dans le package.json :

```json
// package.json
{
  "scripts": {
    "benchmark": "ts-node benchmark.ts"
  }
}
```

### Résultats Attendus pour la Tâche #23
1. Création du DeviceSimulator pour simuler différentes configurations matérielles
2. Script de benchmark complet avec scénarios standardisés
3. Intégration du script dans package.json
4. Mesure objective des temps d'exécution bout en bout
5. Simulation multi-device pour évaluer l'adaptation du Router
6. Détection de régression grâce aux benchmarks réguliers
7. Distinction claire entre cold start et warm start pour des mesures précises
8. Instrumentation du RuntimeManager et StorageManager pour les métriques de compilation/loading
9. Baselines différenciées pour cold et warm start avec seuils de régression
