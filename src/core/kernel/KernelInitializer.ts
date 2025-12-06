import { dialoguePlugin } from '../../plugins/dialogue/DialoguePlugin';
import { eventBus } from '../eventbus/EventBus';
import { router } from '../router/Router';
import { catalogManager } from './CatalogManager';
import { updateService } from './UpdateService';
import { 
  KenshoMessage, 
  KenshoResponse, 
  createResponse, 
  validateMessage 
} from '../types/messages';

export interface KernelInstance {
  handleMessage: (message: unknown) => Promise<void>;
  cleanup: () => void;
  getStatus: () => KernelInstanceStatus;
}

export interface KernelInstanceStatus {
  activeTasks: number;
  cacheSize: number;
  uptime: number;
}

interface ActiveTask {
  requestId: string;
  abortController: AbortController;
  startTime: number;
}

export async function initializeKernel(
  port: MessagePort, 
  connectionId: string
): Promise<KernelInstance> {
  console.log(`[Kernel] Initialisation du noyau Kensho pour connexion ${connectionId}...`);
  
  // Initialise le catalogue dynamique
  try {
    await catalogManager.initialize();
    console.log('[Kernel] CatalogManager initialisé avec succès');
  } catch (error) {
    console.error('[Kernel] Échec de l\'initialisation du CatalogManager:', error);
  }
  
  // Démarre le service de mise à jour en arrière-plan
  updateService.start();
  console.log('[Kernel] UpdateService démarré');
  
  const activeTasks = new Map<string, ActiveTask>();
  const startTime = Date.now();

  // UI Bridge subscribes to streamer events
  const uiListener = (event: any) => {
    port.postMessage(event);
  };
  eventBus.on('TOKEN', uiListener);
  eventBus.on('STATUS', uiListener);
  eventBus.on('METRICS', uiListener);
  eventBus.on('COMPLETE', uiListener);
  eventBus.on('ERROR', uiListener);

  function sendResponse(response: KenshoResponse): void {
    try {
      port.postMessage(response);
    } catch (error) {
      console.error('[Kernel] Erreur lors de l\'envoi de la réponse:', error);
    }
  }

  function sendError(requestId: string, message: string, stack?: string): void {
    sendResponse(createResponse('error', requestId, { 
      message, 
      stack: process.env.NODE_ENV === 'development' ? stack : undefined 
    }));
  }

  async function handleProcessPrompt(
    message: Extract<KenshoMessage, { type: 'process-prompt' }>
  ): Promise<void> {
    const { requestId, payload } = message;
    const { prompt } = payload;
    
    // Delegate entirely to the DialoguePlugin
    try {
      await dialoguePlugin.process(prompt);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[Kernel] Erreur lors du traitement:`, error);
      sendError(requestId, errorMessage, errorStack);
    }
  }

  async function handleContextChange(
    message: Extract<KenshoMessage, { type: 'context-changed' }>
  ): Promise<void> {
    const { payload } = message;
    const { context } = payload;
    
    console.log(`[Kernel] Changement de contexte reçu: ${context}`);
    
    // Délègue l'analyse de contexte au Router
    await router.prewarmFromContext(context);
    
    // Envoyer une confirmation au client
    sendResponse(createResponse('context-changed-ack', message.requestId));
  }

  // Nouvelle fonction pour gérer l'événement 'user-is-typing'
  async function handleUserIsTyping(
    message: Extract<KenshoMessage, { type: 'user-is-typing' }>
  ): Promise<void> {
    const { payload } = message;
    const { text } = payload;
    
    console.log(`[Kernel] Utilisateur est en train de taper: ${text.substring(0, 50)}...`);
    
    // Délègue la prédiction d'intention au Router
    await router.predictIntent(text);
    
    // Pas besoin de réponse pour cet événement
  }

  function handleCancelTask(
    message: Extract<KenshoMessage, { type: 'cancel-task' }>
  ): void {
    const { requestId, payload } = message;
    const taskId = payload.taskId;
    
    const task = activeTasks.get(taskId);
    if (task) {
      task.abortController.abort();
      activeTasks.delete(taskId);
      sendResponse(createResponse('task-cancelled', requestId));
      console.log(`[Kernel] Tâche ${taskId} annulée`);
    } else {
      sendError(requestId, `Tâche ${taskId} non trouvée`);
    }
  }

  function handleClearCache(
    message: Extract<KenshoMessage, { type: 'clear-cache' }>
  ): void {
    sendResponse(createResponse('cache-cleared', message.requestId));
    console.log('[Kernel] Cache vidé');
  }

  function handleGetStatus(
    message: Extract<KenshoMessage, { type: 'get-status' }>
  ): void {
    const status = {
      activeConnections: 1,
      activeTasks: activeTasks.size,
      cacheSize: 0,
      uptime: Date.now() - startTime,
    };
    sendResponse(createResponse('status', message.requestId, { status }));
  }

  function handlePing(
    message: Extract<KenshoMessage, { type: 'ping' }>
  ): void {
    sendResponse(createResponse('pong', message.requestId));
  }

  return {
    handleMessage: async (rawMessage: unknown): Promise<void> => {
      const validation = validateMessage(rawMessage);
      
      if (!validation.success) {
        console.error('[Kernel] Message invalide:', validation.error);
        if (typeof rawMessage === 'object' && rawMessage !== null && 'requestId' in rawMessage) {
          sendError((rawMessage as { requestId: string }).requestId, validation.error);
        }
        return;
      }

      const message = validation.data;
      console.log(`[Kernel] Message reçu: ${message.type} (${message.requestId})`);

      try {
        switch (message.type) {
          case 'process-prompt':
            await handleProcessPrompt(message);
            break;
          case 'context-changed': // Ajout du nouveau cas
            await handleContextChange(message);
            break;
          case 'user-is-typing': // Ajout du nouveau cas
            await handleUserIsTyping(message);
            break;
          case 'cancel-task':
            handleCancelTask(message);
            break;
          case 'clear-cache':
            handleClearCache(message);
            break;
          case 'get-status':
            handleGetStatus(message);
            break;
          case 'ping':
            handlePing(message);
            break;
          default: {
            const exhaustiveCheck: never = message;
            sendError(
              (exhaustiveCheck as KenshoMessage).requestId, 
              `Type de message inconnu: ${(exhaustiveCheck as KenshoMessage).type}`
            );
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
        console.error('[Kernel] Erreur lors du traitement du message:', error);
        sendError(message.requestId, errorMessage);
      }
    },

    cleanup: (): void => {
      for (const [taskId, task] of activeTasks) {
        task.abortController.abort();
        console.log(`[Kernel] Tâche ${taskId} annulée lors du cleanup`);
      }
      activeTasks.clear();
      console.log(`[Kernel] Connexion ${connectionId} nettoyée`);
    },

    getStatus: (): KernelInstanceStatus => ({
      activeTasks: activeTasks.size,
      cacheSize: 0,
      uptime: Date.now() - startTime,
    }),
  };
}