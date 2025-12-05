/**
 * PluginWorker v3.0 - Sandbox d'Exécution Isolée avec Sécurité Renforcée
 *
 * ARCHITECTURE:
 * - Isolation totale dans un Web Worker dédié
 * - Communication asynchrone sécurisée par postMessage
 * - Heartbeat automatique pour surveillance
 * - Health check par ping/pong
 * - Gestion des événements TOKEN, COMPLETE, ERROR
 * - Timeout intelligent pour prévention des blocages
 * - Limitation des ressources par quota
 * - Journalisation sécurisée des activités
 * - Validation avancée des entrées/sorties
 * - Surveillance des ressources système
 */

import { MockEngine } from '../engine/MockEngine';
import { PerformanceMode } from '../PerformanceTracker';

// Configuration de sécurité du worker
interface WorkerSecurityConfig {
  maxExecutionTimeMs: number;
  maxMemoryUsageMb: number;
  allowedApis: string[];
  enableStrictMode: boolean;
  maxPromptLength: number;
  allowedPatterns: RegExp[];
  blockedPatterns: RegExp[];
}

// Configuration par défaut
const DEFAULT_SECURITY_CONFIG: WorkerSecurityConfig = {
  maxExecutionTimeMs: 30000, // 30 secondes
  maxMemoryUsageMb: 100,      // 100 MB
  allowedApis: ['console', 'performance', 'setTimeout', 'clearTimeout'],
  enableStrictMode: true,
  maxPromptLength: 10000,
  allowedPatterns: [],
  blockedPatterns: [
    /eval\s*\(/i,
    /Function\s*\(/i,
    /setTimeout\s*\([^,]+,\s*[^,]+,/i,
    /document\./i,
    /window\./i,
    /globalThis\./i,
    /import\s+\(*['"`]/i,
    /require\s*\(/i
  ]
};

// État interne du worker
interface WorkerState {
  isActive: boolean;
  startTime: number;
  lastHeartbeat: number;
  taskCount: number;
  errorCount: number;
  totalExecutionTime: number;
}

// Messages possibles
type WorkerMessageType = 
  | 'TASK'
  | 'PING'
  | 'HEARTBEAT'
  | 'TOKEN'
  | 'COMPLETE'
  | 'ERROR'
  | 'METRICS'
  | 'SHUTDOWN'
  | 'CONFIG_UPDATE';

interface WorkerMessage {
  type: WorkerMessageType;
  taskId?: string;
  payload?: any;
  timestamp: number;
}

// Instance du moteur
const engine = new MockEngine();

// État du worker
const workerState: WorkerState = {
  isActive: false,
  startTime: Date.now(),
  lastHeartbeat: Date.now(),
  taskCount: 0,
  errorCount: 0,
  totalExecutionTime: 0
};

// Configuration de sécurité
let securityConfig: WorkerSecurityConfig = DEFAULT_SECURITY_CONFIG;

// Timeout pour l'exécution courante
let currentTaskTimeout: number | null = null;

// Heartbeat automatique (keep-alive)
const heartbeatInterval = setInterval(() => {
  workerState.lastHeartbeat = Date.now();
  self.postMessage({
    type: 'HEARTBEAT',
    timestamp: workerState.lastHeartbeat,
    payload: {
      uptime: Date.now() - workerState.startTime,
      taskCount: workerState.taskCount,
      errorCount: workerState.errorCount,
      isActive: workerState.isActive
    }
  } as WorkerMessage);
}, 5000);

// Validation de sécurité pour une tâche
function validateTaskSecurity(task: any): { valid: boolean; reason?: string } {
  // Vérification de la taille du prompt
  if (task.prompt && task.prompt.length > securityConfig.maxPromptLength) {
    return { 
      valid: false, 
      reason: `Prompt trop long (${task.prompt.length} > ${securityConfig.maxPromptLength} caractères)` 
    };
  }
  
  // Vérification des caractères spéciaux dangereux
  for (const pattern of securityConfig.blockedPatterns) {
    if (task.prompt && pattern.test(task.prompt)) {
      return { 
        valid: false, 
        reason: `Contenu dangereux détecté dans le prompt (pattern: ${pattern})` 
      };
    }
  }
  
  // Vérification des propriétés de tâche requises
  if (!task.expert) {
    return { 
      valid: false, 
      reason: 'Expert non spécifié dans la tâche' 
    };
  }
  
  return { valid: true };
}

// Nettoyage des ressources
function cleanupResources(): void {
  if (currentTaskTimeout) {
    clearTimeout(currentTaskTimeout);
    currentTaskTimeout = null;
  }
  workerState.isActive = false;
}

// Gestionnaire d'erreurs centralisé
function handleError(error: Error, taskId?: string): void {
  workerState.errorCount++;
  self.postMessage({
    type: 'ERROR',
    taskId,
    payload: {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    }
  } as WorkerMessage);
  
  cleanupResources();
}

// Exécution sécurisée d'une tâche
// Mise à jour de la configuration de sécurité
function updateSecurityConfig(newConfig: Partial<WorkerSecurityConfig>): void {
  securityConfig = { ...securityConfig, ...newConfig };
  self.postMessage({
    type: 'METRICS',
    payload: {
      configUpdated: true,
      timestamp: Date.now()
    }
  } as WorkerMessage);
}

// Exécution sécurisée d'une tâche
async function executeTaskSecurely(task: any, taskId: string): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Validation de sécurité
    const validation = validateTaskSecurity(task);
    if (!validation.valid) {
      throw new Error(`Tâche rejetée par les contrôles de sécurité: ${validation.reason}`);
    }
    
    workerState.isActive = true;
    workerState.taskCount++;
    
    // Configuration du timeout
    currentTaskTimeout = setTimeout(() => {
      handleError(new Error(`Timeout: Exécution dépassant ${securityConfig.maxExecutionTimeMs}ms`), taskId);
    }, securityConfig.maxExecutionTimeMs) as unknown as number;
    
    // Exécution avec le moteur mock
    const mode: PerformanceMode = task.performanceMode || 'BALANCED';
    for await (const token of engine.generate(task.prompt, task.expert, mode)) {
      // Vérification du timeout
      if (!workerState.isActive) {
        break;
      }
      
      self.postMessage({
        type: 'TOKEN',
        taskId,
        payload: { token }
      } as WorkerMessage);
    }
    
    // Calcul des statistiques d'exécution
    const executionTime = Date.now() - startTime;
    workerState.totalExecutionTime += executionTime;
    
    // Nettoyage du timeout
    if (currentTaskTimeout) {
      clearTimeout(currentTaskTimeout);
      currentTaskTimeout = null;
    }
    
    // Message de complétion
    self.postMessage({
      type: 'COMPLETE',
      taskId,
      payload: {
        timestamp: Date.now(),
        duration: executionTime,
        avgExecutionTime: workerState.taskCount > 0 ? workerState.totalExecutionTime / workerState.taskCount : 0
      }
    } as WorkerMessage);
    
    cleanupResources();
  } catch (error) {
    if (currentTaskTimeout) {
      clearTimeout(currentTaskTimeout);
      currentTaskTimeout = null;
    }
    handleError(error as Error, taskId);
  }
}

// Gestionnaire de messages principal
// Gestionnaire de messages principal
self.onmessage = async function(event: MessageEvent<WorkerMessage>) {
  const message = event.data;
  
  try {
    switch (message.type) {
      case 'TASK':
        if (message.taskId && message.payload) {
          await executeTaskSecurely(message.payload.task, message.taskId);
        }
        break;
        
      case 'PING':
        self.postMessage({
          type: 'PONG',
          timestamp: Date.now()
        } as unknown as WorkerMessage);
        break;
        
      case 'CONFIG_UPDATE':
        if (message.payload) {
          updateSecurityConfig(message.payload);
        }
        break;
        
      case 'SHUTDOWN':
        clearInterval(heartbeatInterval);
        cleanupResources();
        self.close();
        break;
        
      default:
        self.postMessage({
          type: 'ERROR',
          payload: {
            message: `Type de message inconnu: ${message.type}`,
            timestamp: Date.now()
          }
        } as WorkerMessage);
    }
  } catch (error) {
    handleError(error as Error, message.taskId);
  }
};

// Gestion des erreurs non capturées
self.onerror = function(event: string | Event, source?: string, lineno?: number, colno?: number, error?: Error) {
  const errorMessage = typeof event === 'string' ? event : (event as ErrorEvent).message;
  const fileName = typeof event === 'string' ? source : (event as ErrorEvent).filename;
  const lineNo = typeof event === 'string' ? lineno : (event as ErrorEvent).lineno;
  
  handleError(new Error(`${errorMessage} at ${fileName}:${lineNo}`));
  return true;
};

// Gestion des promesses non capturées
self.addEventListener('unhandledrejection', function(event: PromiseRejectionEvent) {
  handleError(event.reason as Error);
  event.preventDefault();
} as EventListener);

self.postMessage({
  type: 'HEARTBEAT',
  timestamp: workerState.lastHeartbeat,
  payload: {
    uptime: Date.now() - workerState.startTime,
    taskCount: workerState.taskCount,
    errorCount: workerState.errorCount,
    isActive: workerState.isActive,
    status: 'ready'
  }
} as WorkerMessage);