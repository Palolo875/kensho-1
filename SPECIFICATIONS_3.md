# Spécifications Techniques - Ensemble 3 (Tâches 19 & 20)

## Tâche #19 du Manifeste - Offline-First & Intégrité

### Objectif
Transformer notre StorageManager en un gardien de l'intégrité. Il doit gérer un manifest.json qui liste tous les fichiers nécessaires (modèles, workers) avec leurs hashes, et être capable de vérifier l'intégrité des fichiers locaux au démarrage.

### Philosophie "Usine Vide"
Nous n'allons pas télécharger de vrais modèles, mais nous allons créer un vrai manifeste pour nos fichiers de simulation. Le StorageManager va réellement lire ce manifeste, réellement calculer les hashes des fichiers factices que nous allons créer, et réellement simuler un re-téléchargement en cas de corruption.

### Étape 1 : Créer un manifest.json et des fichiers factices
Nous créons un manifeste qui décrit notre usine.

#### public/manifest.json (Nouveau fichier)
```json
{
  "version": "1.0.0",
  "minClientVersion": "5.0.0",
  "timestamp": 1733356800000,
  "files": [
    {
      "path": "models/dialogue-gemma3-270m-mock.bin",
      "hash": "sha256-de-ce-fichier-factice-1",
      "size": 300000000,
      "version": "1.2.0",
      "required": true,
      "changelog": "Optimisations de performance",
      "chunks": [
        { "offset": 0, "size": 33554432, "hash": "sha256-aabb..." },
        { "offset": 33554432, "size": 33554432, "hash": "sha256-ccdd..." }
      ]
    },
    {
      "path": "models/code-qwen2.5-coder-1.5b-mock.bin",
      "hash": "sha256-de-ce-fichier-factice-2",
      "size": 1000000000,
      "version": "1.1.0",
      "required": true,
      "changelog": "Améliorations de génération de code"
    },
    {
      "path": "workers/plugin.worker.js",
      "hash": "sha256-du-worker-compile",
      "size": 50000,
      "version": "2.0.0",
      "required": true,
      "changelog": "Support des nouveaux modèles"
    }
  ]
}
```

Nous créerons aussi ces fichiers vides dans le dossier public pour que le test soit réel.

### Étape 2 : Mettre à jour le StorageManager pour la Vérification d'Intégrité
Le StorageManager devient beaucoup plus intelligent.

#### src/core/kernel/StorageManager.ts (Mise à jour majeure)

```typescript
import { sseStreamer } from './streaming/SSEStreamer';

// Interface pour les fichiers du manifest
interface FileInfo {
  path: string;
  hash: string;
  size: number;
  required: boolean;
  version?: string;
  changelog?: string;
  chunks?: Array<{
    offset: number;
    size: number;
    hash: string;
  }>;
}

// Simule une fonction de hashage SHA-256 réelle
async function sha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256-${hashHex}`;
}

class StorageManager {
  // ... (propriétés existantes)
  private manifest: any = null;

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
      const localHash = await sha256(file);

      if (localHash !== fileInfo.hash) {
        sseStreamer.streamStatus(`Fichier corrompu: ${fileInfo.path}. Re-téléchargement...`);
        await this.downloadFileWithRetry(fileInfo);
      }
    }
    
    sseStreamer.streamStatus("✅ Fichiers locaux vérifiés et prêts.");
    console.log("[StorageManager] Vérification d'intégrité terminée.");
  }

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
    const actualHash = await sha256(file);
    
    if (actualHash !== fileInfo.hash) {
      throw new Error(`Échec de vérification après téléchargement: ${fileInfo.path}`);
    }
    
    console.log(`[StorageManager] ✅ ${fileInfo.path} téléchargé et vérifié.`);
  }

  // ... (le reste de la classe)
}

export const storageManager = new StorageManager();
```

### Étape 3 : Mettre à jour le Kernel pour lancer la vérification

#### src/core/kernel.ts (Mise à jour)

```typescript
import { storageManager } from './kernel/StorageManager';
// ...

export async function initializeKernel(port: MessagePort) {
  console.log("[Kernel] Initialisation du noyau Kensho v5.1...");

  try {
    // La première chose que fait le noyau est de vérifier les fichiers
    await storageManager.initializeAndVerify();
  } catch (error) {
    // Gérer l'échec critique si le stockage ne peut pas être validé
    port.postMessage({ type: 'FATAL_ERROR', payload: { message: (error as Error).message } });
    return;
  }

  // ... (le reste de l'initialisation)
}

## Tâche #20 du Manifeste - Circuit Breaker & Fallback

### Objectif
Rendre notre RuntimeManager intelligent face aux pannes. Il doit implémenter un "Circuit Breaker" qui, après un certain nombre d'échecs du moteur GPU (WebLLM), bascule automatiquement et temporairement toutes les opérations vers le moteur de secours CPU (Transformers.js).

### Philosophie "Usine Vide"
Nous allons implémenter la vraie logique du Circuit Breaker. Nous allons créer un MockEngine pour le GPU qui peut être forcé à échouer, et un MockEngine pour le CPU qui est plus lent mais fiable. Le RuntimeManager devra réellement détecter les échecs et orchestrer le basculement.

### Étape 1 : Créer des Moteurs Factices Spécialisés

#### src/core/kernel/engine/MockGPU.engine.ts (Nouveau)
```typescript
export class MockGPUEngine {
  private shouldFail = false;
  
  forceFailure(fail: boolean) { this.shouldFail = fail; }

  async *generate(prompt: string): AsyncGenerator<string> {
    if (this.shouldFail) {
      throw new Error("Erreur GPU simulée (ex: OOM, shader invalide)");
    }
    const tokens = `Réponse GPU (rapide) pour: "${prompt}"`.split(' ');
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 10)); // Rapide
      yield token + ' ';
    }
  }
}
```

#### src/core/kernel/engine/MockCPU.engine.ts (Nouveau)
```typescript
export class MockCPUEngine {
  async *generate(prompt: string): AsyncGenerator<string> {
    const tokens = `Réponse CPU (lent) pour: "${prompt}"`.split(' ');
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 50)); // 5x plus lent
      yield token + ' ';
    }
  }
}
```

### Étape 2 : Mise à jour majeure du RuntimeManager avec le Circuit Breaker Complet

#### src/core/kernel/RuntimeManager.ts (Mise à jour majeure)

```typescript
import { MockGPUEngine } from './engine/MockGPU.engine';
import { MockCPUEngine } from './engine/MockCPU.engine';
import { sseStreamer } from './streaming/SSEStreamer';

// Types pour le Circuit Breaker
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

// Interface pour les tâches en file d'attente
interface QueuedTask {
  task: any;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  queuedAt: number;
}

class RuntimeManager {
  private gpuEngine: MockGPUEngine;
  private cpuEngine: MockCPUEngine;
  private circuitState: CircuitState = 'CLOSED';

  // --- Logique du Circuit Breaker ---
  private failureCount = 0;
  private successCount = 0;
  private rejectionCount = 0; // ✅ Nouveau
  private readonly FAILURE_THRESHOLD = 3;
  private readonly SUCCESS_THRESHOLD = 2;
  private readonly REJECTION_THRESHOLD = 5; // ✅ Nouveau
  private readonly FALLBACK_DURATION = 60_000;
  private readonly HALF_OPEN_TIMEOUT = 5_000;
  private fallbackUntil: number = 0;

  // Métriques pour le monitoring
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

  // File d'attente pour le backpressure
  private taskQueue: QueuedTask[] = []; // ✅ Nouveau
  private readonly MAX_QUEUE_SIZE = 100; // ✅ Nouveau
  private readonly DROP_MODE = 'LOW'; // ✅ Nouveau

  constructor() {
    this.gpuEngine = new MockGPUEngine();
    this.cpuEngine = new MockCPUEngine();
  }

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
          console.warn('[RuntimeManager] Circuit OPEN. Fallback CPU.');
          return this.cpuEngine;
        }
        // Le temps est écoulé, passe en HALF_OPEN
        this.circuitState = 'HALF_OPEN';
        this.successCount = 0;
        console.log('[RuntimeManager] Circuit HALF_OPEN. Test du GPU...');
        sseStreamer.streamStatus("Test de stabilité du moteur principal...");
        // Continue vers HALF_OPEN ↓

      case 'HALF_OPEN':
        // On teste le GPU avec un timeout strict
        return this.gpuEngine;
    }
  }

  /**
   * Exécute une promesse avec un timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
  }

  /**
   * Notifie le Circuit Breaker d'un succès.
   */
  public handleSuccess(): void {
    this.metrics.totalSuccesses++;
    this.metrics.lastSuccessTime = Date.now();

    if (this.circuitState === 'HALF_OPEN') {
      this.successCount++;
      console.log(`[RuntimeManager] Test GPU réussi (${this.successCount}/${this.SUCCESS_THRESHOLD})`);

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
      console.error('[RuntimeManager] ❌ Test GPU échoué. Retour en OPEN.');
      this.tripCircuitBreaker();
      return;
    }

    this.failureCount++;
    console.error(`[RuntimeManager] Échec GPU (${this.failureCount}/${this.FAILURE_THRESHOLD})`);

    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      this.tripCircuitBreaker();
    }
  }

  /**
   * Enregistre un rejet de tâche (backpressure)
   */
  public registerRejection(): void { // ✅ Nouveau
    this.rejectionCount++;
    this.metrics.rejectionCount = this.rejectionCount;
    console.warn(`[RuntimeManager] Rejet enregistré (${this.rejectionCount}/${this.REJECTION_THRESHOLD})`);
    
    if (this.rejectionCount >= this.REJECTION_THRESHOLD) {
      this.tripCircuitBreakerHard();
    }
  }

  /**
   * Ouvre le circuit de manière stricte (hard-open)
   */
  private tripCircuitBreakerHard(): void { // ✅ Nouveau
    console.error('[RuntimeManager] ⚠️ Tous les moteurs saturés, hard-open mode.');
    this.circuitState = 'OPEN';
    this.fallbackUntil = Date.now() + this.FALLBACK_DURATION;
    this.metrics.fallbackUntil = this.fallbackUntil;
    sseStreamer.streamStatus('Système en surcharge. Mise en pause temporaire.');
  }

  /**
   * Ouvre le circuit et passe en mode fallback.
   */
  private tripCircuitBreaker(): void {
    console.error('[RuntimeManager] 🚨 CIRCUIT OPEN ! Fallback CPU.');
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
    console.log('[RuntimeManager] ✅ Circuit CLOSED. GPU stable.');
    this.circuitState = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.rejectionCount = 0; // ✅ Reset aussi le compteur de rejets
    sseStreamer.streamStatus("Moteur principal rétabli (GPU).");
  }

  /**
   * Vérifie si le système est en mode fallback
   */
  public isInFallbackMode(): boolean { // ✅ Nouveau
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

  // Méthode pour les tests
  public forceGpuFailure(fail: boolean) {
    this.gpuEngine.forceFailure(fail);
  }
}

export const runtimeManager = new RuntimeManager();
```

### Étape 3 : Mettre à jour le TaskExecutor pour implémenter le Backpressure

#### src/core/kernel/TaskExecutor.ts (Mise à jour)

```typescript
import { runtimeManager } from './RuntimeManager';
// ...

class TaskExecutor {
  // ... propriétés existantes
  
  // File d'attente pour le backpressure
  private taskQueue: QueuedTask[] = []; // ✅ Nouveau
  private readonly MAX_QUEUE_SIZE = 100; // ✅ Nouveau
  private readonly DROP_MODE = 'LOW'; // ✅ Nouveau

  // ...
  
  /**
   * Enfile une tâche avec gestion du backpressure
   */
  public async enqueueTask(task: ExpertTask): Promise<TaskResult> { // ✅ Nouveau
    if (runtimeManager.isInFallbackMode()) {
      if (this.taskQueue.length >= this.MAX_QUEUE_SIZE) {
        // Stratégies adaptatives
        switch (this.DROP_MODE) {
          case 'LOW': {
            const lowPriority = this.taskQueue.findIndex(t => t.priority === 'LOW');
            if (lowPriority !== -1) {
              const dropped = this.taskQueue.splice(lowPriority, 1);
              console.warn(`[Queue] Suppression de tâche LOW priority: ${dropped[0].task.id}`);
              break;
            }
            // Sinon, on rejette la nouvelle
            runtimeManager.registerRejection();
            throw new Error('[Queue] Trop de requêtes: refus de nouvelle tâche (CPU saturé)');
          }
          case 'OLDEST': {
            const dropped = this.taskQueue.shift();
            console.warn(`[Queue] Suppression ancienne tâche: ${dropped?.task.id}`);
            break;
          }
          case 'ALL': {
            this.taskQueue = [];
            console.warn(`[Queue] Saturation totale: purge complète`);
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
  private async processQueue(): Promise<TaskResult> { // ✅ Nouveau
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
      // Notifie le RuntimeManager de l'échec
      runtimeManager.handleFailure();
      throw error; // Propage l'erreur pour que le ResilienceEngine la gère
    }
  }
  
  /**
   * Exécute la génération avec le moteur donné
   */
  private async runGeneration(engine: any, task: ExpertTask): Promise<string> {
    let fullResponse = "";
    for await (const token of engine.generate(task.prompt)) {
      fullResponse += token;
    }
    return fullResponse;
  }
}
```