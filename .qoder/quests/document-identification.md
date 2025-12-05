# Conception Détaillée des Tâches 19, 20 et 21

## Introduction

Ce document présente une conception détaillée des tâches 19, 20 et 21 du projet, basée sur l'analyse des documents SPECIFICATIONS_3.md, ANALYSIS_3.md et ROADMAP_3.md. L'objectif est de définir une approche méthodique, organisée et structurée pour implémenter ces tâches avec la meilleure qualité possible.

## Tâche #19 - Offline-First & Intégrité

### Objectif
Transformer le StorageManager en un gardien de l'intégrité avec vérification offline-first et auto-réparation.

### Architecture
```
StorageManager ↔ manifest.json ↔ Fichiers locaux
     ↓
Vérification d'intégrité au démarrage
     ↓
Auto-réparation en cas de besoin
```

### Composants Clés

#### 1. manifest.json
Fichier central décrivant toutes les ressources nécessaires avec leurs métadonnées :
- Chemin du fichier
- Hash SHA-256 pour vérification d'intégrité
- Taille du fichier
- Version du fichier
- Indicateur de fichier requis
- Journal des modifications
- Chunks pour delta updates

#### 2. StorageManager
Responsabilités principales :
- Chargement et validation du manifest.json
- Vérification de l'existence des fichiers
- Calcul et comparaison des hashes SHA-256
- Téléchargement/re-téléchargement simulé en cas de besoin
- Vérification proactive de l'espace disque
- Gestion des delta updates par chunks

### Flux de Traitement
1. **Initialisation** : Le StorageManager charge le manifest.json
2. **Vérification** : Chaque fichier du manifeste est vérifié :
   - Existence du fichier
   - Intégrité via hash SHA-256
3. **Auto-réparation** : En cas de fichier manquant ou corrompu :
   - Téléchargement simulé avec retry
   - Feedback utilisateur en temps réel
4. **Validation finale** : Confirmation de l'intégrité de tous les fichiers

### Avantages
- **Offline-First** : Fonctionnement à 100% sans connexion réseau
- **Auto-Réparation** : Correction automatique des fichiers corrompus
- **Delta Updates** : Téléchargement uniquement des parties modifiées
- **Sécurité** : Vérification d'intégrité fiable avec SHA-256

### Plan d'Implémentation Détaillé

#### 1. Mise à jour de la fonction de hashage SHA-256
Dans `src/core/kernel/StorageManager.ts`, remplacer la fonction `sha256` actuelle par une implémentation utilisant l'API Web Crypto :

```typescript
/**
 * Fonction de hashage SHA-256 réelle utilisant l'API Web Crypto
 */
private async sha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256-${hashHex}`;
}
```

#### 2. Amélioration de la méthode initializeAndVerify
Mettre à jour la méthode `initializeAndVerify` pour inclure :
- Vérification de l'espace disque disponible
- Gestion des retries avec backoff exponentiel
- Support des delta updates par chunks
- Intégration avec le système de streaming de statut

```typescript
/**
 * Initialise le StorageManager et vérifie l'intégrité des fichiers.
 */
public async initializeAndVerify(): Promise<void> {
  await this.init(); // Initialise OPFS
  
  // Vérifie l'espace disponible
  await this.checkDiskSpace();
  
  sseStreamer.streamStatus("Vérification de l'intégrité des fichiers locaux...");
  
  // 1. Charger le manifeste
  try {
    const response = await fetch('/manifest.json');
    this.manifest = await response.json();
  } catch (e) {
    throw new Error("Impossible de charger le manifeste des fichiers.");
  }

  // 2. Vérifier chaque fichier du manifeste
  for (const fileInfo of this.manifest.files) {
    const handle = await this.getFileHandle(fileInfo.path);
    
    if (!handle) {
      sseStreamer.streamStatus(`Fichier manquant: ${fileInfo.path}. Téléchargement...`);
      await this.downloadFileWithRetry(fileInfo);
      continue;
    }

    const file = await handle.getFile();
    const localHash = await this.sha256(file);

    if (localHash !== fileInfo.hash) {
      sseStreamer.streamStatus(`Fichier corrompu: ${fileInfo.path}. Re-téléchargement...`);
      await this.downloadFileWithRetry(fileInfo);
    }
  }
  
  sseStreamer.streamStatus("✅ Fichiers locaux vérifiés et prêts.");
  console.log("[StorageManager] Vérification d'intégrité terminée.");
}
```

#### 3. Création de la méthode downloadFileWithRetry
Ajouter une nouvelle méthode pour gérer les téléchargements avec retry :

```typescript
/**
 * Simule le téléchargement et le stockage d'un fichier avec retry.
 */
private async downloadFileWithRetry(fileInfo: FileInfo, maxRetries = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await this.downloadFile(fileInfo);
      return; // Succès
    } catch (error) {
      console.error(`[StorageManager] Tentative ${attempt}/${maxRetries} échouée pour ${fileInfo.path}`);
      
      if (attempt === maxRetries) {
        sseStreamer.streamStatus(`❌ Échec du téléchargement: ${fileInfo.path}. Mode dégradé.`);
        throw new Error(`Impossible de télécharger ${fileInfo.path} après ${maxRetries} tentatives`);
      }
      
      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt) * 1000;
      sseStreamer.streamStatus(`Nouvelle tentative dans ${delay/1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

#### 4. Mise à jour de la méthode downloadFile
Améliorer la méthode `downloadFile` pour :
- Téléchargement progressif par chunks
- Vérification post-téléchargement
- Feedback utilisateur en temps réel

```typescript
/**
 * Simule le téléchargement et le stockage d'un fichier.
 */
private async downloadFile(fileInfo: FileInfo): Promise<void> {
  if (!this.root) throw new Error("OPFS non initialisé.");
  
  // Simule un téléchargement progressif
  sseStreamer.streamStatus(`Téléchargement de ${fileInfo.path}...`);
  
  const chunkSize = 5_000_000; // 5MB chunks
  const totalChunks = Math.ceil(fileInfo.size / chunkSize);
  
  const handle = await this.root.getFileHandle(fileInfo.path, { create: true });
  const writable = await handle.createWritable();
  
  // Simule le téléchargement chunk par chunk
  for (let i = 0; i < totalChunks; i++) {
    await new Promise(r => setTimeout(r, 1000)); // 1s par chunk (5MB/s)
    const progress = ((i + 1) / totalChunks * 100).toFixed(0);
    sseStreamer.streamStatus(`Téléchargement: ${progress}% (${fileInfo.path})`);
    
    // Écrit un chunk de données factices
    const chunk = new Uint8Array(Math.min(chunkSize, fileInfo.size - i * chunkSize));
    crypto.getRandomValues(chunk); // Données aléatoires réalistes
    await writable.write(chunk);
  }
  
  await writable.close();
  
  // ✅ Vérifie le hash après téléchargement
  const file = await handle.getFile();
  const actualHash = await this.sha256(file);
  
  if (actualHash !== fileInfo.hash) {
    throw new Error(`Échec de vérification après téléchargement: ${fileInfo.path}`);
  }
  
  console.log(`[StorageManager] ✅ ${fileInfo.path} téléchargé et vérifié.`);
}
```

#### 5. Ajout de la vérification de l'espace disque
Implémenter une méthode pour vérifier l'espace disque disponible :

```typescript
/**
 * Vérifie l'espace disque disponible
 */
private async checkDiskSpace(): Promise<void> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const available = (estimate.quota || 0) - (estimate.usage || 0);
    
    // Calcule l'espace nécessaire
    const requiredSpace = this.manifest.files
      .filter((f: FileInfo) => f.required)
      .reduce((sum: number, f: FileInfo) => sum + f.size, 0);
      
    if (available < requiredSpace) {
      const neededGB = (requiredSpace / 1e9).toFixed(2);
      const availableGB = (available / 1e9).toFixed(2);
      throw new Error(
        `Espace insuffisant: besoin de ${neededGB}GB, disponible: ${availableGB}GB`
      );
    }
  }
}
```

#### 6. Intégration dans le KernelInitializer
Modifier `src/core/kernel/KernelInitializer.ts` pour appeler `storageManager.initializeAndVerify()` au démarrage :

```typescript
// Dans la fonction initializeKernel
async function initializeKernel(
  port: MessagePort, 
  connectionId: string
): Promise<void> {
  console.log(`[Kernel] Initialisation du noyau Kensho pour connexion ${connectionId}...`);
  
  try {
    // Vérification de l'intégrité des fichiers
    await storageManager.initializeAndVerify();
  } catch (error) {
    console.error("[Kernel] Échec de la vérification d'intégrité:", error);
    // Gérer l'erreur de manière appropriée
    // Par exemple, envoyer un message d'erreur au frontend
    port.postMessage({
      type: 'FATAL_ERROR',
      payload: { 
        message: (error as Error).message 
      }
    });
    return;
  }
  
  // ... reste de l'initialisation
}
```

## Tâche #20 - Circuit Breaker & Fallback

### Objectif
Implémenter un système de résilience de niveau SOTA avec détection de panne, basculement automatique, test progressif, auto-guérison et protection contre la saturation.

### Architecture
```
GPU Engine (rapide) ↔ Circuit Breaker ↔ CPU Engine (fiable)
     ↓
Détection d'échecs
     ↓
Basculement automatique
     ↓
Test progressif (HALF_OPEN)
     ↓
Auto-guérison
```

### États du Circuit Breaker
1. **CLOSED** : Fonctionnement normal, requêtes envoyées au GPU
2. **OPEN** : Seuil d'échecs atteint, basculement vers CPU
3. **HALF_OPEN** : Test progressif du GPU après période de fallback

### Composants Clés

#### 1. RuntimeManager
Responsabilités principales :
- Gestion des états du Circuit Breaker
- Suivi des succès/échecs
- Basculement automatique GPU↔CPU
- Timeout pour opérations en HALF_OPEN
- Métriques pour monitoring
- Gestion des rejets (hard open)

#### 2. TaskExecutor
Responsabilités principales :
- Intégration du Circuit Breaker dans le flux d'exécution
- File d'attente prioritaire pour backpressure
- Gestion des rejets contrôlés
- Propagation appropriée des erreurs

### Flux de Traitement
1. **Surveillance** : Comptage des succès/échecs
2. **Détection** : Ouverture du circuit après seuil d'échecs
3. **Basculement** : Redirection des requêtes vers CPU
4. **Test** : Passage en HALF_OPEN après délai
5. **Validation** : Retour à CLOSED si tests réussis
6. **Protection** : Hard-open en cas de saturation

### Avantages
- **Détection de Panne** : Comptage actif des erreurs
- **Basculement Automatique** : Sans intervention manuelle
- **Test Progressif** : Vérification graduelle du retour du GPU
- **Auto-Guérison** : Rétablissement automatique
- **Feedback Utilisateur** : Informations en temps réel
- **Monitoring** : Métriques détaillées
- **Protection Saturation** : File d'attente prioritaire

### Plan d'Implémentation Détaillé

#### 1. Mise à jour du RuntimeManager
Dans `src/core/kernel/RuntimeManager.ts`, ajouter la logique complète du Circuit Breaker :

```typescript
// Ajout des types et interfaces
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  fallbackUntil: number;
  rejectionCount: number;
}

// Ajout des propriétés dans la classe RuntimeManager
private circuitState: CircuitState = 'CLOSED';
private failureCount = 0;
private successCount = 0;
private rejectionCount = 0;
private readonly FAILURE_THRESHOLD = 3;
private readonly SUCCESS_THRESHOLD = 2;
private readonly REJECTION_THRESHOLD = 5;
private readonly FALLBACK_DURATION = 60_000;
private readonly HALF_OPEN_TIMEOUT = 5_000;
private fallbackUntil: number = 0;
private metrics: CircuitMetrics = {
  state: 'CLOSED',
  failureCount: 0,
  successCount: 0,
  totalFailures: 0,
  totalSuccesses: 0,
  lastFailureTime: null,
  lastSuccessTime: null,
  fallbackUntil: 0,
  rejectionCount: 0
};
```

#### 2. Implémentation des méthodes du Circuit Breaker
Ajouter les méthodes suivantes dans RuntimeManager :

```typescript
/**
 * Obtient le moteur approprié selon l'état du Circuit Breaker
 */
public async getEngineFor(task: any): Promise<MockGPUEngine | MockCPUEngine> {
  // Met à jour les métriques
  this.metrics.state = this.circuitState;
  this.metrics.fallbackUntil = this.fallbackUntil;

  switch (this.circuitState) {
    case 'CLOSED':
      // Opération normale
      return this.gpuEngine;

    case 'OPEN':
      if (Date.now() < this.fallbackUntil) {
        logger.warn('RuntimeManager', 'Circuit OPEN. Fallback CPU.');
        return this.cpuEngine;
      }
      // Le temps est écoulé, passe en HALF_OPEN
      this.circuitState = 'HALF_OPEN';
      this.successCount = 0;
      logger.info('RuntimeManager', 'Circuit HALF_OPEN. Test du GPU...');
      sseStreamer.streamStatus("Test de stabilité du moteur principal...");
      // Continue vers HALF_OPEN ↓

    case 'HALF_OPEN':
      // On teste le GPU avec un timeout strict
      return this.gpuEngine;
  }
}

/**
 * Notifie le Circuit Breaker d'un succès.
 */
public handleSuccess(): void {
  this.metrics.totalSuccesses++;
  this.metrics.lastSuccessTime = Date.now();

  if (this.circuitState === 'HALF_OPEN') {
    this.successCount++;
    logger.info('RuntimeManager', `Test GPU réussi (${this.successCount}/${this.SUCCESS_THRESHOLD})`);

    if (this.successCount >= this.SUCCESS_THRESHOLD) {
      this.closeCircuit();
    }
  } else if (this.circuitState === 'CLOSED') {
    // Reset le compteur d'échecs si on était en état normal
    this.failureCount = Math.max(0, this.failureCount - 1);
  }
}

/**
 * Notifie le Circuit Breaker d'un échec.
 */
public handleFailure(): void {
  this.metrics.totalFailures++;
  this.metrics.lastFailureTime = Date.now();

  if (this.circuitState === 'HALF_OPEN') {
    // Échec pendant le test → retour immédiat en OPEN
    logger.error('RuntimeManager', 'Test GPU échoué. Retour en OPEN.', new Error('Test GPU failed'));
    this.tripCircuitBreaker();
    return;
  }

  this.failureCount++;
  logger.warn('RuntimeManager', `Échec GPU (${this.failureCount}/${this.FAILURE_THRESHOLD})`);

  if (this.failureCount >= this.FAILURE_THRESHOLD) {
    this.tripCircuitBreaker();
  }
}

/**
 * Enregistre un rejet de tâche (backpressure)
 */
public registerRejection(): void {
  this.rejectionCount++;
  this.metrics.rejectionCount = this.rejectionCount;
  logger.warn('RuntimeManager', `Rejet enregistré (${this.rejectionCount}/${this.REJECTION_THRESHOLD})`);
  
  if (this.rejectionCount >= this.REJECTION_THRESHOLD) {
    this.tripCircuitBreakerHard();
  }
}

/**
 * Ouvre le circuit de manière stricte (hard-open)
 */
private tripCircuitBreakerHard(): void {
  logger.error('RuntimeManager', 'Tous les moteurs saturés, hard-open mode.', new Error('All engines saturated'));
  this.circuitState = 'OPEN';
  this.fallbackUntil = Date.now() + this.FALLBACK_DURATION;
  this.metrics.fallbackUntil = this.fallbackUntil;
  sseStreamer.streamStatus('Système en surcharge. Mise en pause temporaire.');
}

/**
 * Ouvre le circuit et passe en mode fallback.
 */
private tripCircuitBreaker(): void {
  logger.error('RuntimeManager', '🚨 CIRCUIT OPEN ! Fallback CPU.', new Error('Circuit breaker opened'));
  this.circuitState = 'OPEN';
  this.fallbackUntil = Date.now() + this.FALLBACK_DURATION;
  this.failureCount = 0; // Reset pour le prochain cycle
  this.metrics.fallbackUntil = this.fallbackUntil;
  sseStreamer.streamStatus("Mode dégradé activé (CPU).");
}

/**
 * Ferme le circuit.
 */
private closeCircuit(): void {
  logger.info('RuntimeManager', '✅ Circuit CLOSED. GPU stable.');
  this.circuitState = 'CLOSED';
  this.failureCount = 0;
  this.successCount = 0;
  this.rejectionCount = 0;
  sseStreamer.streamStatus("Moteur principal rétabli (GPU).");
}

/**
 * Vérifie si le système est en mode fallback
 */
public isInFallbackMode(): boolean {
  return this.circuitState === 'OPEN' && Date.now() < this.fallbackUntil;
}

/**
 * Obtient les métriques du Circuit Breaker.
 */
public getMetrics(): CircuitMetrics {
  return {
    ...this.metrics,
    state: this.circuitState,
    fallbackUntil: this.fallbackUntil,
    rejectionCount: this.rejectionCount
  };
}
```

#### 3. Mise à jour du TaskExecutor
Dans `src/core/kernel/TaskExecutor.ts`, intégrer le Circuit Breaker :

```typescript
// Ajout de la gestion du backpressure
private taskQueue: QueuedTask[] = [];
private readonly MAX_QUEUE_SIZE = 100;
private readonly DROP_MODE = 'LOW';

interface QueuedTask {
  task: any;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  queuedAt: number;
}

/**
 * Enfile une tâche avec gestion du backpressure
 */
public async enqueueTask(task: ExpertTask): Promise<TaskResult> {
  if (runtimeManager.isInFallbackMode()) {
    if (this.taskQueue.length >= this.MAX_QUEUE_SIZE) {
      // Stratégies adaptatives
      switch (this.DROP_MODE) {
        case 'LOW': {
          const lowPriority = this.taskQueue.findIndex(t => t.priority === 'LOW');
          if (lowPriority !== -1) {
            const dropped = this.taskQueue.splice(lowPriority, 1);
            logger.warn('TaskExecutor', `Suppression de tâche LOW priority: ${dropped[0].task.id}`);
            break;
          }
          // Sinon, on rejette la nouvelle
          runtimeManager.registerRejection();
          logger.error('TaskExecutor', 'Trop de requêtes: refus de nouvelle tâche (CPU saturé)', new Error('Too many requests'));
          throw new Error('[Queue] Trop de requêtes: refus de nouvelle tâche (CPU saturé)');
        }
        case 'OLDEST': {
          const dropped = this.taskQueue.shift();
          logger.warn('TaskExecutor', `Suppression ancienne tâche: ${dropped?.task.id}`);
          break;
        }
        case 'ALL': {
          this.taskQueue = [];
          logger.warn('TaskExecutor', 'Saturation totale: purge complète');
          break;
        }
      }
    }
  }

  this.taskQueue.push({
    task,
    priority: task.priority || 'NORMAL',
    queuedAt: Date.now()
  });
  
  return this.processQueue();
}

/**
 * Traite la file d'attente
 */
private async processQueue(): Promise<TaskResult> {
  // Trie par priorité puis par date
  this.taskQueue.sort((a, b) => {
    const priorityOrder = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority] ||
           a.queuedAt - b.queuedAt;
  });

  // Exécute seulement la tâche la plus prioritaire
  const nextTask = this.taskQueue.shift();
  if (nextTask) {
    return this.executeTask(nextTask.task);
  }
  
  throw new Error('Aucune tâche à exécuter');
}

private async executeSingleTask(task: ExpertTask): Promise<TaskResult> {
  try {
    logger.info('TaskExecutor', `Délégation de la tâche pour ${task.expert}`, { priority: task.priority });
    
    // Demande le moteur approprié (GPU ou CPU)
    const engine = await runtimeManager.getEngineFor(task);
    
    let fullResponse = "";
    
    // Exécute avec timeout en mode HALF_OPEN
    const circuitState = runtimeManager.getMetrics().state;
    
    if (circuitState === 'HALF_OPEN') {
      try {
        fullResponse = await runtimeManager.executeWithTimeout(
          this.runGeneration(engine, task),
          5000 // 5s timeout en HALF_OPEN
        );
        runtimeManager.handleSuccess();
      } catch (error) {
        runtimeManager.handleFailure();
        throw error;
      }
    } else {
      // Exécution normale
      for await (const token of engine.generate(task.prompt)) {
        fullResponse += token;
      }
      
      // Notifie le succès si on était en mode normal
      if (circuitState === 'CLOSED') {
        runtimeManager.handleSuccess();
      }
    }

    return { expert: task.expert, result: fullResponse, status: 'success' };
  } catch (error) {
    logger.error('TaskExecutor', `Échec de la tâche pour ${task.expert}`, error as Error, { taskId: task.id });
    // Notifie le RuntimeManager de l'échec
    runtimeManager.handleFailure();
    throw error; // Propage l'erreur pour que le ResilienceEngine la gère
  }
}
```

## Tâche #21 - Télémétrie Structurée

### Objectif
Remplacer tous les console.log par un LoggerService centralisé produisant des logs structurés en JSON.

### Architecture
```
Services → LoggerService → JSON Structuré → Console/Stockage
     ↓
Centralisation et uniformisation des logs
     ↓
Traçabilité et debugging facilités
```

### Composants Clés

#### 1. LoggerService
Caractéristiques principales :
- Niveaux de criticité (DEBUG, INFO, WARN, ERROR)
- Structure JSON standardisée
- Métadonnées contextuelles
- Gestion des erreurs avec stack trace
- Correlation ID pour tracing distribué
- Persistance avec retry exponentiel
- Redaction automatique des données sensibles
- Sampling pour logs haute fréquence
- Métriques agrégées
- Système d'alerting

### Structure des Logs
```json
{
  "timestamp": "2023-12-01T10:00:00.000Z",
  "level": "INFO",
  "service": "TaskExecutor",
  "message": "Tâche terminée avec succès",
  "data": {
    "taskId": "12345",
    "durationMs": 150
  },
  "correlationId": "abcd-efgh-ijkl"
}
```

### Flux de Traitement
1. **Capture** : Services utilisant LoggerService
2. **Structuration** : Formatage JSON avec métadonnées
3. **Redaction** : Masquage des données sensibles
4. **Sampling** : Filtrage des logs haute fréquence
5. **Persistance** : Sauvegarde avec retry
6. **Analyse** : Agrégation de métriques
7. **Alerting** : Déclenchement d'alertes selon règles

### Avantages
- **Centralisation** : Point unique pour tous les logs
- **Structure** : Données exploitables et filtrables
- **Niveaux Criticité** : Distinction des événements
- **Traçabilité** : Suivi via correlation ID
- **Debugging** : Stack traces incluses
- **Sécurité** : Redaction automatique
- **Performance** : Sampling et buffering
- **Observabilité** : Métriques et alerting

### Plan d'Implémentation Détaillé

#### 1. Amélioration du LoggerService
Dans `src/core/kernel/monitoring/LoggerService.ts`, ajouter les fonctionnalités avancées :

```typescript
// Ajout des propriétés supplémentaires
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
```

#### 2. Ajout des méthodes avancées
Implémenter les fonctionnalités supplémentaires :

```typescript
public setCorrelationId(id: string): void {
  this.correlationId = id;
}

public clearCorrelationId(): void {
  this.correlationId = null;
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
```

#### 3. Intégration dans les services
Remplacer les `console.log` dans tous les services par des appels au LoggerService :

```typescript
// Exemple dans RuntimeManager
import { logger } from './monitoring/LoggerService';

// Remplacer console.log par logger.info, logger.warn, logger.error
logger.info('RuntimeManager', '🚀 RuntimeManager (Production) initialisé.');

// Exemple dans TaskExecutor
logger.info('TaskExecutor', `Délégation de la tâche pour ${task.expert}`, { priority: task.priority });

// Exemple dans StorageManager
logger.info('StorageManager', `Fichier ${fileInfo.path} téléchargé et stocké.`);
```

## Conclusion

Cette conception détaillée fournit un cadre complet pour l'implémentation des tâches 19, 20 et 21 avec un focus sur la qualité, la résilience et l'observabilité. Chaque tâche est conçue pour fonctionner de manière autonome tout en s'intégrant harmonieusement dans l'architecture globale du système. L'approche méthodique et structurée proposée permet d'assurer une implémentation de haute qualité avec les meilleures pratiques industrielles.