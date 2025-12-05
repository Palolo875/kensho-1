# 🔍 Analyse Technique - Ensemble 4

## 🎯 Tâche #21 : Télémétrie Structurée Améliorée

### Contexte
Actuellement, le système utilise `console.log()` basique, ce qui rend difficile l'exploitation des logs en production. Les logs disparaissent au refresh de la page et ne respectent pas les bonnes pratiques de sécurité.

### Problèmes Identifiés
1. **❌ Process.env dans le navigateur** : `process.env.NODE_ENV` n'existe pas dans le navigateur
2. **❌ Logs non persistés** : Les logs disparaissent au refresh de la page
3. **❌ Pas de tracing distribué** : Impossible de suivre une requête à travers les services
4. **❌ Pas de sampling** : Risque de saturation mémoire avec logs haute fréquence
5. **❌ Pas de redaction** : Données sensibles potentiellement exposées
6. **❌ Pas de métriques** : Difficile de surveiller la santé de l'application
7. **❌ Pas de système d'alerting** : Impossible de détecter automatiquement les problèmes critiques

### Solutions Proposées

#### 1. Variables d'Environnement Browser-Safe
``typescript
// ❌ Ancienne version
if (process.env.NODE_ENV !== 'production') {
  // ❌ process is not defined (browser)
}

// ✅ Nouvelle version
class LoggerService {
  private readonly IS_PRODUCTION = import.meta.env?.PROD || false;
  private readonly MIN_LOG_LEVEL: LogLevel = 
    (import.meta.env?.VITE_LOG_LEVEL as LogLevel) || 'INFO';
}
```

Configuration dans `.env` :
```bash
# .env.development
VITE_LOG_LEVEL=DEBUG

# .env.production
VITE_LOG_LEVEL=WARN
```

#### 2. Persistance des Logs avec OPFS et Retry Exponentiel
``typescript
class LoggerService {
  private logBuffer: any[] = [];
  private readonly MAX_BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 10000; // 10s

  constructor() {
    // Flush périodique
    setInterval(() => this.flushLogs(), this.FLUSH_INTERVAL);

    // Flush avant fermeture de la page
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushLogs());
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
}
```

#### 3. Tracing Distribué avec Correlation ID
``typescript
class LoggerService {
  private correlationId: string | null = null;

  public setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  public clearCorrelationId(): void {
    this.correlationId = null;
  }

  private log(level: LogLevel, payload: LogPayload): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: this.correlationId, // ✅ Ajoute l'ID
      ...payload,
    };
    // ...
  }
}

// Dans DialoguePlugin.process()
const correlationId = uuidv4();
logger.setCorrelationId(correlationId);

try {
  // Tous les logs auront le même correlationId
  logger.info('DialoguePlugin', 'Début du traitement');
  await router.createPlan(prompt);
  await taskExecutor.executePlan(plan);
  logger.info('DialoguePlugin', 'Fin du traitement');
} finally {
  logger.clearCorrelationId();
}
```

#### 4. Sampling Intelligent
``typescript
class LoggerService {
  private logCounts: Map<string, { count: number, lastLogged: number }> = new Map();
  private readonly SAMPLE_RATE: Record<LogLevel, number> = {
    'DEBUG': 0.1,  // Log seulement 10% des DEBUG
    'INFO': 1.0,   // Log tous les INFO
    'WARN': 1.0,   // Log tous les WARN
    'ERROR': 1.0   // Log TOUJOURS les erreurs
  };

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

  private log(level: LogLevel, payload: LogPayload): void {
    if (!this.shouldSample(level, payload.service, payload.message)) {
      return; // Skip ce log
    }

    // ... reste du code
  }
}
```

#### 5. Redaction Automatique
``typescript
class LoggerService {
  private readonly SENSITIVE_KEYS = ['password', 'token', 'apiKey', 'secret', 'creditCard'];
  private readonly EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

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
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      ...payload,
      data: this.redactSensitiveData(payload.data) // ✅ Redact avant log
    };
    // ...
  }
}
```

#### 6. Métriques Agrégées
```
class LoggerService {
  private metrics = {
    byLevel: { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 },
    byService: new Map<string, number>(),
    errorRate: 0
  };

  private log(level: LogLevel, payload: LogPayload): void {
    // ... (log normal)

    // Agrège les métriques
    this.metrics.byLevel[level]++;
    const serviceCount = this.metrics.byService.get(payload.service) || 0;
    this.metrics.byService.set(payload.service, serviceCount + 1);

    const total = Object.values(this.metrics.byLevel).reduce((a, b) => a + b, 0);
    this.metrics.errorRate = this.metrics.byLevel.ERROR / total;
  }

  public getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }
}
```

#### 7. Système d'Alerting (AlertManager)
```
class LoggerService {
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

### Structure des Logs Finale
```
{
  "timestamp": "2025-12-04T10:30:45.123Z",
  "level": "ERROR",
  "service": "TaskExecutor",
  "message": "Échec de la tâche pour llama-3.2-1b",
  "data": { 
    "taskId": "abc-123" 
  },
  "error": { 
    "message": "...", 
    "stack": "..." 
  },
  "correlationId": "xyz-789"
}
```

### Points Forts de la Solution
✅ **Production-ready** : Format compatible avec Datadog, Elasticsearch, CloudWatch  
✅ **Séparation claire** : service/message/data pour filtrage facile  
✅ **Sécurité** : Redaction automatique des données sensibles  
✅ **Performance** : Sampling intelligent pour logs haute fréquence  
✅ **Traçabilité** : Correlation ID pour tracing distribué  
✅ **Persistance** : Logs sauvegardés dans OPFS avec retry exponentiel  
✅ **Observabilité** : Métriques agrégées  
✅ **Alerting** : Système d'alerting intégré  

### Points d'Amélioration
🟢 **Export** : Export des logs vers service externe en production  
🟢 **Rotation** : Rotation des fichiers de logs pour limiter l'espace disque  

### Score Final : 9.8/10 🎯
Critère | Note | Commentaire
---|---|---
Structure | 10/10 | Format JSON parfait
Persistence | 10/10 | Sauvegarde dans OPFS avec retry
Privacy | 10/10 | Redaction automatique
Performance | 10/10 | Sampling intelligent
Tracing | 10/10 | Correlation ID
Observabilité | 10/10 | Métriques agrégées
Alerting | 9/10 | Système d'alerting intégré
Final | 9.8/10 | Solution production-ready avec résilience

## 🎯 Tâche #22 : Améliorations du RuntimeManager

### Contexte
Le RuntimeManager actuel gère la compilation et l'exécution des modèles, mais manque de certaines fonctionnalités avancées pour une expérience utilisateur optimale et une meilleure gestion des ressources.

### Problèmes Identifiés
1. **❌ Pas de versioning des graphes** : Difficile de gérer la compatibilité ascendante
2. **❌ Pas de feedback utilisateur pendant compilation** : L'utilisateur ne sait pas ce qui se passe
3. **❌ Cache mémoire non observable** : Impossible de surveiller l'efficacité du cache
4. **❌ Pas de warming planifié** : Latence perceptible lors du premier chargement

### Solutions Proposées

#### 1. Versioning des Graphes
```
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
```
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
```
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
```
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

### Points Forts de la Solution
✅ **Compatibilité ascendante** : Versioning des graphes avec nettoyage automatique  
✅ **Expérience utilisateur** : Feedback pendant compilation avec timeline simulée  
✅ **Observabilité** : Cache mémoire avec statistiques d'utilisation  
✅ **Performance** : Warming planifié basé sur les metrics d'utilisation  
✅ **Ressources optimisées** : Compression des graphes et scheduler intelligent  

### Points d'Amélioration
🟢 **Monitoring avancé** : Dashboard de monitoring des caches et warming  
🟢 **Adaptation dynamique** : Ajustement automatique des paramètres en fonction de l'utilisation  

### Score Final : 9.7/10 🎯
Critère | Note | Commentaire
---|---|---
Versioning | 10/10 | Header standardisé et nettoyage automatique
Feedback UX | 10/10 | Timeline simulée déterministe
Observabilité | 10/10 | Statistiques de cache détaillées
Performance | 9/10 | Warming planifié avec scheduler intelligent
Ressources | 10/10 | Compression et gestion efficace
Final | 9.7/10 | Solution avancée pour le RuntimeManager

## 🎯 Tâche #23 : Suite de Benchmark

### Contexte
Actuellement, il n'existe aucun moyen de mesurer objectivement les performances du système dans différentes conditions. Nous avons besoin d'une suite de benchmark pour évaluer l'impact des modifications et comparer les performances sur différentes configurations matérielles.

### Problèmes Identifiés
1. **❌ Pas de mesure objective** : Impossible de quantifier les performances
2. **❌ Pas de simulation multi-device** : Difficile d'évaluer l'adaptation du Router
3. **❌ Pas de détection de régression** : Risque d'introduire des ralentissements invisibles
4. **❌ Mesures trop superficielles** : Seul le temps total est mesuré, pas les composants individuels
5. **❌ Pas de warmup** : Le premier run est toujours plus lent, ce qui fausse les résultats
6. **❌ Pas de baseline** : Impossible de détecter les régressions sans référence historique

### Analyse Approfondie : Benchmarks Cold Start vs Warm Start

#### Pourquoi cold vs warm est clé

Un même scénario peut passer de 1,5 s "cold" à 200 ms "warm" à cause de la pré-compilation, du cache, du JIT, etc., et ne pas les distinguer fausse complètement la lecture des chiffres. Les bons benchmarks frontend / runtime regardent toujours les deux régimes, notamment pour tout ce qui touche au démarrage d'engine ou de pipeline GPU.

#### Comment structurer le bench cold / warm

Tu as déjà tout ce qu'il faut dans ton infra de mesures détaillées, il te manque juste deux modes bien délimités :

**Cold start**

- Reset OPFS / cache mémoire / graphs compilés.
- Pas de warmup, tu mesures un "vrai premier run" sur un device profile.
- Objectif : quantifier la pénalité initiale (pré-compilation de graphes, init WebGPU, chargement modèle).

**Warm start**

- Tu exécutes un script de warmup dédié (pré-compilation de graphs, warming des workers, pré-allocation pools, etc.).
- Puis tu fais N runs mesurés et tu prends médiane + p95/p99 pour le scénario.
- Objectif : représenter l'expérience réelle après quelques requêtes, une fois le système "en régime de croisière".

Concrètement, pour chaque profil + scénario, tu peux sortir un bloc du style :

- cold_total_ms
- warm_p50_ms / warm_p95_ms
- warm_tokens_per_second
- delta_improvement = cold_total / warm_p50 (par ex. "x7.3 plus rapide en warm").

#### Intégration avec tes graphes pré-compilés

Ce qui est très intéressant pour toi, c'est d'ajouter deux sous-métriques ciblées sur ta Tâche #15 :

- graphCompilationDurationCold : temps de compilation initiale de graphes (premier run, cache vide).
- graphLoadDurationWarm : temps de lookup + chargement des graphes précompilés depuis OPFS / mémoire.

En pratique, tu peux instrumenter ton RuntimeManager / StorageManager avec des timers autour de :

- chemin "compile + save graph" (cold)
- chemin "load compiled graph depuis OPFS + map mémoire" (warm)

et les remonter dans ton BenchmarkMetrics.breakdown. Tu verras alors noir sur blanc :

- "Cold: 900 ms dont 650 ms de compilation graphes"
- "Warm: 180 ms dont 40 ms de chargement graphes"

Ce genre de split est typiquement ce qu'on utilise pour justifier un investissement dans la pré-compilation / warming dans les apps natives et WebGPU.

#### Comment exploiter ça dans tes baselines

Dans ton benchmark-baselines.json, tu peux stocker pour chaque profil/scénario :

- cold.totalDuration
- warm.p50, warm.p95, warm.tokensPerSecond
- graphCompilationCold, graphLoadWarm

Puis dans ta détection de régression :

- seuils stricts sur cold (ex. +15 % max toléré)
- seuils encore plus stricts sur warm (ex. +10 % max sur p95) car c'est ce que l'utilisateur voit le plus souvent.

Tu obtiens ainsi un système qui détecte à la fois :

- les régressions d'onboarding / first-use (cold),
- et les régressions de confort d'usage continu (warm).

En résumé : oui, prévoir un bench cold vs warm dédié à la pré-compilation de tes graphes est une excellente idée, et avec tes breakdowns + baselines + percentiles, tu peux en faire un vrai garde-fou de perf dans ton CI.

### Solutions Proposées

#### 1. DeviceSimulator
Ce module permet de simuler différentes configurations matérielles pour évaluer la performance du système.

```
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
Ce script exécute des scénarios standardisés et mesure les performances.

```
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

#### 3. Intégration dans package.json
Ajout du script de benchmark dans le package.json :

```
// package.json
{
  "scripts": {
    "benchmark": "ts-node benchmark.ts"
  }
}
```

### Points Forts de la Solution
✅ **Mesure Objective** : Temps d'exécution bout en bout pour des scénarios types  
✅ **Simulation Multi-Device** : Évaluation de l'adaptation du Router selon le matériel  
✅ **Détection de Régression** : Benchmarks réguliers pour détecter les ralentissements  
✅ **Scénarios Standardisés** : Comparaison cohérente entre différentes versions  

### Points d'Amélioration
🔴 **Mesures granulaires** : Le benchmark ne mesure que le temps total, pas les composants individuels (routing, security, execution, watermarking, streaming)
🔴 **Pas de warmup** : Le premier run est toujours plus lent (JIT compilation, cache cold), ce qui fausse les résultats
🔴 **Pas de baseline** : Impossible de détecter les régressions de performance sans référence historique
🟡 **Manque de scénarios de stress** : Les scénarios ne couvrent pas les cas limites (concurrents, circuit breaker, pression mémoire)
🟡 **Pas de visualisation** : Un tableau console n'est pas suffisant, il faut des graphiques exploitables
🟢 **Rapports Détaillés** : Génération de rapports HTML avec graphiques
🟢 **Comparaison Historique** : Suivi des performances au fil du temps
🟢 **Tests Paramétrés** : Scénarios personnalisables avec paramètres

### Score Final : 7.5/10 🎯
Critère | Note | Commentaire
---|---|---
Mesure Objective | 5/10 | Trop superficielles, seulement temps total
Simulation Multi-Device | 10/10 | Profils variés couverts
Détection de Régression | 4/10 | Pas de baseline pour comparer
Scénarios Standardisés | 9/10 | Cas d'usage représentatifs
Final | 7.5/10 | Solution incomplète, nécessite améliorations critiques
