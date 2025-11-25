/**
 * Store Zustand pour gérer l'état global de Kensho
 * 
 * Cycle de vie d'un message:
 * 1. sendMessage() - Ajoute le message utilisateur + placeholder pour la réponse
 * 2. requestStream() - Initie un stream vers l'OIE Agent
 * 3. onChunk() - Met à jour le message de Kensho chunk par chunk
 * 4. onEnd() - Marque la fin de l'écriture
 * 
 * Ce store est le centre de contrôle de l'UI, gérant:
 * - L'état de conversation (messages)
 * - L'état de chargement du modèle
 * - La communication avec les workers via MessageBus
 * 
 * Améliorations Sprint 2+:
 * - Persistence localStorage pour l'historique des conversations
 * - Gestion d'erreurs améliorée pour les workers
 * - État d'erreur dédié pour meilleure UX
 */


import { create, StoreApi } from 'zustand';
import { MessageBus } from '../core/communication/MessageBus';
import { ModelLoaderProgress } from '../core/models/ModelLoader';
import { DownloadManager, DownloadProgress } from '../core/downloads/DownloadManager';
import { toast } from 'sonner';
import { appConfig } from '../config/app.config';
import { ThoughtStep } from '../agents/oie/types';
import { Project, ProjectTask } from '../agents/graph/types';
import { TaskCompletionDetector } from '../core/oie/TaskCompletionDetector';


const STORAGE_KEY = 'kensho_conversation_history';
const MAX_STORED_MESSAGES = 100;

export interface Message {
    id: string;
    text: string;
    author: 'user' | 'kensho';
    timestamp: number;
    plan?: any; // Plan généré par l'OIE pour affichage dans l'UI
    thinking?: string; // Résumé du processus de pensée/réflexion (Mode Simulation)
    thoughtProcess?: ThoughtStep[]; // Étapes de pensée pour le débat interne (Sprint 6)
    factCheckingClaims?: any[]; // Résultats de vérification (Priority 6)
    semanticSearchResults?: any; // Résultats de recherche sémantique (Priority 6)
}

export interface WorkerError {
    worker: 'llm' | 'oie' | 'telemetry';
    message: string;
    timestamp: number;
}

interface WorkerStatus {
    llm: boolean;
    oie: boolean;
    telemetry: boolean;
}

interface AttachedFile {
    file: File;
    buffer: ArrayBuffer;
}

interface KenshoState {
    messages: Message[];
    modelProgress: ModelLoaderProgress;
    downloads: DownloadProgress[];
    isKenshoWriting: boolean;
    mainBus: MessageBus | null;
    isInitialized: boolean;
    isLoadingMinimized: boolean;
    isLoadingPaused: boolean;
    modelDownloadStarted: boolean;
    workerErrors: WorkerError[];
    workersReady: WorkerStatus;
    attachedFile: AttachedFile | null;
    uploadProgress: number;
    ocrProgress: number;
    statusMessage: string | null;
    currentThoughtProcess: ThoughtStep[] | null; // Processus de pensée en cours (Sprint 6)
    isDebateModeEnabled: boolean; // Active/désactive le mode débat (Sprint 6)
    
    // Sprint 7: Gestion des projets et tâches
    activeProjectId: string | null;
    projects: Project[];
    projectTasks: Map<string, ProjectTask[]>; // Map projectId -> tasks
    projectSyncChannel: BroadcastChannel | null; // Canal de synchronisation multi-onglets

    init: () => void;
    startLLMWorker: () => void;
    sendMessage: (text: string) => void;
    clearMessages: () => void;
    setLoadingMinimized: (minimized: boolean) => void;
    setLoadingPaused: (paused: boolean) => void;
    startModelDownload: () => void;
    pauseModelDownload: () => void;
    resumeModelDownload: () => void;
    cancelModelDownload: () => void;
    pauseAllDownloads: () => void;
    resumeAllDownloads: () => void;
    cancelAllDownloads: () => void;
    loadMessagesFromStorage: () => void;
    clearWorkerErrors: () => void;
    attachFile: (file: File) => void;
    detachFile: () => void;
    setDebateModeEnabled: (enabled: boolean) => void;
    
    // Sprint 7: Méthodes pour les projets
    setActiveProjectId: (id: string | null) => void;
    loadProjects: () => Promise<void>;
    loadProjectTasks: (projectId: string) => Promise<void>;
    createProject: (name: string, goal: string) => Promise<void>;
    createTask: (projectId: string, text: string) => Promise<void>;
    toggleTask: (taskId: string) => Promise<void>;
}

/**
 * Charge l'historique des messages depuis localStorage
 */
const loadMessagesFromLocalStorage = (): Message[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const messages = JSON.parse(stored);
            console.log(`[KenshoStore] ${messages.length} messages chargés depuis localStorage`);
            return messages;
        }
    } catch (error) {
        console.error('[KenshoStore] Erreur lors du chargement des messages:', error);
    }
    return [];
};

/**
 * Sauvegarde l'historique des messages dans localStorage
 */
const saveMessagesToLocalStorage = (messages: Message[]) => {
    try {
        // Limiter le nombre de messages stockés pour éviter d'excéder les quotas
        const messagesToStore = messages.slice(-MAX_STORED_MESSAGES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesToStore));
    } catch (error) {
        console.error('[KenshoStore] Erreur lors de la sauvegarde des messages:', error);
    }
};

/**
 * Démarre le LLM Worker (séparé pour lazy loading)
 */
const startLLMWorker = (set: StoreApi<KenshoState>['setState']) => {
    try {
        const llmWorker = new Worker(
            new URL('../agents/llm/index.ts', import.meta.url),
            { type: 'module' }
        );

        (window as any).__kensho_workers = (window as any).__kensho_workers || {};
        (window as any).__kensho_workers['MainLLMAgent'] = llmWorker;

        llmWorker.onmessage = (e) => {
            if (e.data.type === 'READY') {
                console.log('[KenshoStore] ✅ LLM Worker prêt');
                set(state => ({
                    workersReady: { ...state.workersReady, llm: true }
                }));
            } else if (e.data.type === 'MODEL_PROGRESS') {
                console.log('[KenshoStore] Progression du modèle:', e.data.payload);
                set({ modelProgress: e.data.payload });
            } else if (e.data.type === 'MODEL_ERROR') {
                console.error('[KenshoStore] Erreur de chargement du modèle:', e.data.payload);
                toast.error('Erreur de chargement du modèle', {
                    description: e.data.payload.message,
                    duration: 8000
                });
                set({
                    modelProgress: {
                        phase: 'error',
                        progress: 0,
                        text: `Erreur: ${e.data.payload.message}`
                    }
                });
            }
        };

        llmWorker.onerror = (error) => {
            try {
                const workerError: WorkerError = {
                    worker: 'llm',
                    message: 'Erreur lors du démarrage du worker LLM',
                    timestamp: Date.now()
                };
                set(state => ({
                    modelProgress: {
                        phase: 'error',
                        progress: 0,
                        text: workerError.message
                    },
                    workerErrors: [...state.workerErrors, workerError]
                }));
            } catch (e) {
                // Supprime les erreurs pour éviter les exceptions non gérées
            }
            return true;
        };

        console.log('[KenshoStore] 🚀 LLM Worker démarré');
    } catch (error) {
        console.error('[KenshoStore] Erreur lors du démarrage du LLM Worker:', error);
        const workerError: WorkerError = {
            worker: 'llm',
            message: error instanceof Error ? error.message : 'Impossible de démarrer le worker LLM',
            timestamp: Date.now()
        };
        set(state => ({
            modelProgress: {
                phase: 'error',
                progress: 0,
                text: workerError.message
            },
            workerErrors: [...state.workerErrors, workerError]
        }));
    }
};

/**
 * Démarre la constellation de workers (OIE, Telemetry)
 * Le LLM Worker est démarré séparément via startLLMWorker()
 */
const startConstellation = (set: StoreApi<KenshoState>['setState']) => {
    console.log(`[KenshoStore] Mode: ${appConfig.mode} | LLM enabled: ${appConfig.llm.enabled} | Autoload: ${appConfig.llm.autoload}`);

    if (appConfig.llm.enabled && appConfig.llm.autoload) {
        console.log('[KenshoStore] Démarrage automatique du LLM Worker...');
        set({
            modelProgress: { phase: 'downloading', progress: 0, text: 'Initialisation du modèle...' }
        });
        startLLMWorker(set);
    } else if (appConfig.mode === 'lite') {
        console.log('[KenshoStore] 🟢 Mode Lite activé - LLM désactivé');
        set({
            modelProgress: { phase: 'ready', progress: 1, text: 'Mode Lite (sans IA)' }
        });
    } else {
        console.log('[KenshoStore] 🎭 Mode Simulation activé - Utilise des mocks');
        set({
            modelProgress: { phase: 'ready', progress: 1, text: 'Mode Simulation (mocks)' }
        });
    }

    // Démarrer l'OIE Worker
    try {
        const oieWorker = new Worker(
            new URL('../agents/oie/index.ts', import.meta.url),
            { type: 'module' }
        );

        oieWorker.onmessage = (e) => {
            if (e.data.type === 'READY') {
                console.log('[KenshoStore] ✅ OIE Worker prêt');
                set(state => ({
                    workersReady: { ...state.workersReady, oie: true }
                }));
            }
        };

        oieWorker.onerror = (error) => {
            try {
                const workerError: WorkerError = {
                    worker: 'oie',
                    message: 'Erreur du worker OIE - orchestration indisponible',
                    timestamp: Date.now()
                };
                set(state => ({
                    workerErrors: [...state.workerErrors, workerError]
                }));
            } catch (e) {
                // Supprime les erreurs pour éviter les exceptions non gérées
            }
            return true;
        };

        console.log('[KenshoStore] OIE Worker démarré');
    } catch (error) {
        console.error('[KenshoStore] Erreur lors du démarrage du OIE Worker:', error);
        const workerError: WorkerError = {
            worker: 'oie',
            message: error instanceof Error ? error.message : 'Impossible de démarrer le worker OIE',
            timestamp: Date.now()
        };
        set(state => ({
            workerErrors: [...state.workerErrors, workerError]
        }));
    }

    // Optionnel: Démarrer le Telemetry Worker pour les logs
    try {
        const telemetryWorker = new Worker(
            new URL('../agents/telemetry/index.ts', import.meta.url),
            { type: 'module' }
        );

        telemetryWorker.onmessage = (e) => {
            if (e.data.type === 'READY') {
                console.log('[KenshoStore] ✅ Telemetry Worker prêt');
                set(state => ({
                    workersReady: { ...state.workersReady, telemetry: true }
                }));
            }
        };

        telemetryWorker.onerror = (error) => {
            try {
                const workerError: WorkerError = {
                    worker: 'telemetry',
                    message: 'Erreur du worker Telemetry - logging indisponible',
                    timestamp: Date.now()
                };
                set(state => ({
                    workerErrors: [...state.workerErrors, workerError]
                }));
            } catch (e) {
                // Supprime les erreurs pour éviter les exceptions non gérées
            }
            return true;
        };

        console.log('[KenshoStore] Telemetry Worker démarré');
    } catch (error) {
        console.warn('[KenshoStore] Telemetry Worker non disponible:', error);
        const workerError: WorkerError = {
            worker: 'telemetry',
            message: error instanceof Error ? error.message : 'Impossible de démarrer le worker Telemetry',
            timestamp: Date.now()
        };
        set(state => ({
            workerErrors: [...state.workerErrors, workerError]
        }));
    }

    try {
        const embeddingWorker = new Worker(
            new URL('../agents/embedding/index.ts', import.meta.url),
            { type: 'module' }
        );

        (window as any).__kensho_workers = (window as any).__kensho_workers || {};
        (window as any).__kensho_workers['EmbeddingAgent'] = embeddingWorker;

        embeddingWorker.onmessage = (e) => {
            if (e.data.type === 'READY') {
                console.log('[KenshoStore] ✅ EmbeddingAgent Worker prêt');
            }
        };

        embeddingWorker.onerror = (error) => {
            try {
                // Supprime silencieusement les erreurs de worker
            } catch (e) {
                // Supprime les erreurs pour éviter les exceptions non gérées
            }
            return true;
        };

        console.log('[KenshoStore] EmbeddingAgent Worker démarré');
    } catch (error) {
        console.warn('[KenshoStore] EmbeddingAgent Worker non disponible:', error);
    }

    try {
        const intentWorker = new Worker(
            new URL('../agents/intent-classifier/index.ts', import.meta.url),
            { type: 'module' }
        );

        (window as any).__kensho_workers = (window as any).__kensho_workers || {};
        (window as any).__kensho_workers['IntentClassifierAgent'] = intentWorker;

        intentWorker.onmessage = (e) => {
            if (e.data.type === 'READY') {
                console.log('[KenshoStore] ✅ IntentClassifierAgent Worker prêt');
            }
        };

        intentWorker.onerror = (error) => {
            try {
                // Supprime silencieusement les erreurs de worker
            } catch (e) {
                // Supprime les erreurs pour éviter les exceptions non gérées
            }
            return true;
        };

        console.log('[KenshoStore] IntentClassifierAgent Worker démarré');
    } catch (error) {
        console.warn('[KenshoStore] IntentClassifierAgent Worker non disponible:', error);
    }

    // Démarrer le GraphWorker (Sprint 7)
    try {
        const graphWorker = new Worker(
            new URL('../agents/graph/worker.ts', import.meta.url),
            { type: 'module' }
        );

        (window as any).__kensho_workers = (window as any).__kensho_workers || {};
        (window as any).__kensho_workers['GraphWorker'] = graphWorker;

        graphWorker.onmessage = (e) => {
            if (e.data.type === 'READY') {
                console.log('[KenshoStore] ✅ GraphWorker prêt');
            }
        };

        graphWorker.onerror = (error) => {
            try {
                // Supprime silencieusement les erreurs de worker
            } catch (e) {
                // Supprime les erreurs pour éviter les exceptions non gérées
            }
            return true;
        };

        console.log('[KenshoStore] GraphWorker démarré');
    } catch (error) {
        console.warn('[KenshoStore] GraphWorker non disponible:', error);
    }
};

export const useKenshoStore = create<KenshoState>((set, get) => {
    // S'abonner aux changements des téléchargements
    const dm = DownloadManager.getInstance();
    dm.subscribe((downloads) => {
        set({ downloads: Array.from(downloads.values()) });
    });

    return {
    messages: loadMessagesFromLocalStorage(),
    modelProgress: { phase: 'idle', progress: 0, text: 'Initialisation...' },
    downloads: [],
    isKenshoWriting: false,
    mainBus: null,
    isInitialized: false,
    isLoadingMinimized: false,
    currentThoughtProcess: null,
    isLoadingPaused: false,
    modelDownloadStarted: false,
    workerErrors: [],
    workersReady: { llm: false, oie: false, telemetry: false },
    attachedFile: null,
    uploadProgress: 0,
    ocrProgress: -1,
    statusMessage: null,
    isDebateModeEnabled: true,
    
    // Sprint 7: État initial des projets
    activeProjectId: null,
    projects: [],
    projectTasks: new Map(),
    projectSyncChannel: null,

    /**
     * Initialise le système Kensho
     * - Crée le MessageBus pour le thread principal
     * - Démarre les workers (LLM et OIE) 
     * - En Mode Simulation: passe directement à 'ready' sans workers
     * - Écoute les messages de progression du modèle
     */
    init: () => {
        const state = get();
        if (state.isInitialized) {
            console.log('[KenshoStore] Déjà initialisé, ignoré.');
            return;
        }

        console.log('[KenshoStore] Initialisation...');

        const mainBus = new MessageBus('MainThread');

        // Sprint 7: Initialiser le BroadcastChannel pour synchronisation multi-onglets
        const projectSyncChannel = new BroadcastChannel('kensho_project_sync');
        projectSyncChannel.onmessage = (event) => {
            if (event.data.type === 'projects_updated') {
                console.log('[KenshoStore] Synchronisation multi-onglets: rechargement des projets');
                get().loadProjects();
            } else if (event.data.type === 'tasks_updated') {
                console.log('[KenshoStore] Synchronisation multi-onglets: rechargement des tâches');
                const { projectId } = event.data;
                if (projectId) {
                    get().loadProjectTasks(projectId);
                }
            }
        };

        set({ mainBus, projectSyncChannel, isInitialized: true });

        // Cleanup au unload pour éviter les fuites de ressources
        window.addEventListener('beforeunload', () => {
            if (projectSyncChannel) {
                projectSyncChannel.close();
                console.log('[KenshoStore] BroadcastChannel fermé');
            }
        });

        // Mode Simulation: passer directement à 'ready'
        if (appConfig.mode === 'simulation') {
            console.log('[KenshoStore] 🎭 Mode Simulation - Modèle prêt instantanément');
            set({ modelProgress: { phase: 'ready', progress: 100, text: 'Prêt (Mode Simulation)' } });
        } else {
            // Démarrer la constellation de workers pour les autres modes
            startConstellation(set);
        }
    },

    /**
     * Démarre le LLM Worker manuellement (lazy loading)
     */
    startLLMWorker: () => {
        const state = get();
        
        if (state.workersReady.llm) {
            console.log('[KenshoStore] LLM Worker déjà démarré');
            return;
        }
        
        if (state.modelProgress.phase !== 'idle' && state.modelProgress.phase !== 'ready') {
            console.log('[KenshoStore] LLM Worker déjà en cours de chargement');
            return;
        }
        
        if (appConfig.mode === 'lite') {
            toast.info('Mode Lite actif', {
                description: 'L\'IA est désactivée dans ce mode',
                duration: 3000
            });
            return;
        }

        console.log('[KenshoStore] Démarrage manuel du LLM Worker...');
        set({
            modelProgress: { phase: 'downloading', progress: 0, text: 'Démarrage...' }
        });
        startLLMWorker(set);
    },

    /**
     * Envoie un message à Kensho (MODE SIMULATION)
     * - Ajoute immédiatement le message utilisateur à l'UI
     * - Crée un placeholder pour la réponse de Kensho
     * - Appelle le DialoguePluginMock pour générer une réponse simulée
     * - Met à jour le placeholder au fur et à mesure du streaming
     */
    sendMessage: async (text) => {
        const { messages, modelProgress } = get();

        if (text.trim() === '') {
            return;
        }

        if (modelProgress.phase !== 'ready') {
            console.warn('[KenshoStore] ⚠️ Le modèle n\'est pas encore prêt. Phase actuelle:', modelProgress.phase);
            return;
        }

        // Créer les messages
        const userMessage: Message = {
            id: `msg-user-${Date.now()}`,
            text: text.trim(),
            author: 'user',
            timestamp: Date.now()
        };

        const kenshoResponsePlaceholder: Message = {
            id: `msg-kensho-${Date.now() + 1}`,
            text: '',
            author: 'kensho',
            timestamp: Date.now() + 1
        };

        // Ajouter les messages à l'état et sauvegarder
        const newMessages = [...messages, userMessage, kenshoResponsePlaceholder];
        set({
            messages: newMessages,
            isKenshoWriting: true
        });
        saveMessagesToLocalStorage(newMessages);

        console.log('[KenshoStore] 📤 Envoi du message (Mode Simulation):', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

        // Utiliser DialoguePluginMock pour générer la réponse
        const { DialoguePluginMock } = await import('../plugins/dialogue/DialoguePluginMock');
        const dialoguePlugin = new DialoguePluginMock();

        try {
            for await (const event of dialoguePlugin.startConversation(text.trim())) {
                if (event.type === 'token') {
                    // Ajouter le token au message
                    set(state => {
                        const updatedMessages = state.messages.map(msg =>
                            msg.id === kenshoResponsePlaceholder.id
                                ? { ...msg, text: msg.text + event.data }
                                : msg
                        );
                        saveMessagesToLocalStorage(updatedMessages);
                        return { messages: updatedMessages };
                    });
                } else if (event.type === 'thinking_step') {
                    // Ignorer les étapes de pensée pour l'UI (elles sont ajoutées au complete)
                    // mais on pourrait les afficher en temps réel ici si voulu
                    console.log(`[KenshoStore] 🧠 Étape: ${event.data.label}`);
                } else if (event.type === 'complete') {
                    // Stream terminé - ajouter la pensée et les étapes
                    console.log('[KenshoStore] ✅ Stream terminé (mode simulation)');
                    set(state => {
                        const updatedMessages = state.messages.map(msg =>
                            msg.id === kenshoResponsePlaceholder.id
                                ? {
                                    ...msg,
                                    thinking: event.data.thinking,
                                    thoughtProcess: event.data.thoughtProcess
                                  }
                                : msg
                        );
                        saveMessagesToLocalStorage(updatedMessages);
                        return {
                            messages: updatedMessages,
                            isKenshoWriting: false
                        };
                    });
                }
            }
        } catch (error) {
            console.error('[KenshoStore] ❌ Erreur de stream:', error);
            set(state => {
                const updatedMessages = state.messages.filter(msg =>
                    msg.id !== kenshoResponsePlaceholder.id
                );
                saveMessagesToLocalStorage(updatedMessages);
                return {
                    messages: updatedMessages,
                    isKenshoWriting: false
                };
            });
        }
    },

    /**
     * Efface tous les messages (nouvelle conversation)
     */
    clearMessages: () => {
        set({ messages: [] });
        localStorage.removeItem(STORAGE_KEY);
        console.log('[KenshoStore] 🗑️ Conversation effacée');
    },

    /**
     * Permet de minimiser/maximiser l'interface de chargement
     */
    setLoadingMinimized: (minimized: boolean) => {
        set({ isLoadingMinimized: minimized });
    },

    /**
     * Permet de mettre en pause/reprendre le téléchargement
     */
    setLoadingPaused: (paused: boolean) => {
        set({ isLoadingPaused: paused });
    },

    /**
     * Charge les messages depuis localStorage
     */
    loadMessagesFromStorage: () => {
        const messages = loadMessagesFromLocalStorage();
        set({ messages });
    },

    /**
     * Efface les erreurs des workers
     */
    clearWorkerErrors: () => {
        set({ workerErrors: [] });
    },

    /**
     * Attache un fichier pour la prochaine requête
     */
    attachFile: (file: File) => {
        const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
        if (!allowedTypes.includes(file.type)) {
            toast.error('Type de fichier non supporté', {
                description: 'Seuls les PDF et images (PNG, JPG) sont acceptés.',
                duration: 5000
            });
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            toast.error('Fichier trop volumineux', {
                description: 'La taille maximale est de 20 Mo.',
                duration: 5000
            });
            return;
        }

        const reader = new FileReader();
        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                set({ uploadProgress: (e.loaded / e.total) * 100 });
            }
        };
        reader.onload = () => {
            set({
                attachedFile: { file, buffer: reader.result as ArrayBuffer },
                uploadProgress: 100
            });
            toast.success('Fichier attaché', {
                description: file.name,
                duration: 3000
            });
        };
        reader.onerror = () => {
            toast.error('Erreur de lecture', {
                description: 'Impossible de lire le fichier.',
                duration: 5000
            });
            set({ uploadProgress: 0 });
        };
        reader.readAsArrayBuffer(file);
    },

    /**
     * Détache le fichier actuel
     */
    detachFile: () => {
        set({ attachedFile: null, uploadProgress: 0 });
    },

    /**
     * Démarre le téléchargement du modèle LLM (à la demande de l'utilisateur)
     */
    startModelDownload: () => {
        const state = get();
        if (state.modelDownloadStarted) {
            console.log('[KenshoStore] Téléchargement déjà démarré');
            return;
        }
        
        const llmWorker = (window as any).__kensho_workers?.['MainLLMAgent'];
        if (llmWorker) {
            console.log('[KenshoStore] 🚀 Demande de démarrage du téléchargement du modèle');
            llmWorker.postMessage({ type: 'START_DOWNLOAD' });
            set({ modelDownloadStarted: true });
        }
    },

    /**
     * Met en pause le téléchargement du modèle
     */
    pauseModelDownload: () => {
        const llmWorker = (window as any).__kensho_workers?.['MainLLMAgent'];
        if (llmWorker) {
            console.log('[KenshoStore] ⏸️ Mise en pause du téléchargement');
            llmWorker.postMessage({ type: 'PAUSE_DOWNLOAD' });
            set({ isLoadingPaused: true });
        }
    },

    /**
     * Reprend le téléchargement du modèle
     */
    resumeModelDownload: () => {
        const llmWorker = (window as any).__kensho_workers?.['MainLLMAgent'];
        if (llmWorker) {
            console.log('[KenshoStore] ▶️ Reprise du téléchargement');
            llmWorker.postMessage({ type: 'RESUME_DOWNLOAD' });
            set({ isLoadingPaused: false });
        }
    },

    /**
     * Met en pause TOUS les téléchargements
     */
    pauseAllDownloads: () => {
        const dm = DownloadManager.getInstance();
        dm.pauseAll();
        console.log('[KenshoStore] ⏸️ Tous les téléchargements mis en pause');
        set({ isLoadingPaused: true });
    },

    /**
     * Reprend TOUS les téléchargements
     */
    resumeAllDownloads: () => {
        const dm = DownloadManager.getInstance();
        dm.resumeAll();
        console.log('[KenshoStore] ▶️ Tous les téléchargements repris');
        set({ isLoadingPaused: false });
    },

    /**
     * Annule complètement le téléchargement du modèle LLM
     */
    cancelModelDownload: () => {
        const llmWorker = (window as any).__kensho_workers?.['MainLLMAgent'];
        if (llmWorker) {
            console.log('[KenshoStore] ⛔ Annulation du téléchargement du modèle');
            llmWorker.postMessage({ type: 'CANCEL_DOWNLOAD' });
            set({ modelDownloadStarted: false, isLoadingPaused: false });
        }
    },

    /**
     * Annule TOUS les téléchargements
     */
    cancelAllDownloads: () => {
        const dm = DownloadManager.getInstance();
        dm.cancelAll();
        const llmWorker = (window as any).__kensho_workers?.['MainLLMAgent'];
        if (llmWorker) {
            llmWorker.postMessage({ type: 'CANCEL_DOWNLOAD' });
        }
        console.log('[KenshoStore] ⛔ Tous les téléchargements annulés');
        set({ modelDownloadStarted: false, isLoadingPaused: false });
    },

    /**
     * Active/désactive le mode débat (Sprint 6)
     */
    setDebateModeEnabled: (enabled: boolean) => {
        console.log('[KenshoStore] Mode débat:', enabled ? 'activé ✅' : 'désactivé ❌');
        set({ isDebateModeEnabled: enabled });
    },

    /**
     * Sprint 7: Définit le projet actif
     */
    setActiveProjectId: (id: string | null) => {
        console.log('[KenshoStore] Projet actif:', id);
        set({ activeProjectId: id });
    },

    /**
     * Sprint 7: Charge tous les projets depuis le GraphWorker ou localStorage
     */
    loadProjects: async () => {
        try {
            // Essayer d'abord le GraphWorker
            const { mainBus } = get();
            const graphWorker = (window as any).__kensho_workers?.['GraphWorker'];
            
            if (mainBus && graphWorker) {
                try {
                    const projects = await mainBus.request<Project[]>('GraphWorker', {
                        method: 'getActiveProjects',
                        args: []
                    });
                    console.log(`[KenshoStore] ${projects.length} projet(s) chargé(s) depuis GraphWorker`);
                    set({ projects });
                    return;
                } catch (workerError) {
                    console.warn('[KenshoStore] GraphWorker indisponible, fallback vers localStorage');
                }
            }
            
            // Fallback: charger depuis localStorage
            const stored = localStorage.getItem('kensho_projects');
            const projects: Project[] = stored ? JSON.parse(stored) : [];
            
            console.log(`[KenshoStore] ${projects.length} projet(s) chargé(s) depuis localStorage`);
            set({ projects });
        } catch (error) {
            console.error('[KenshoStore] Erreur lors du chargement des projets:', error);
            set({ projects: [] });
        }
    },

    /**
     * Sprint 7: Charge les tâches d'un projet spécifique
     */
    loadProjectTasks: async (projectId: string) => {
        const { mainBus } = get();
        if (!mainBus) return;

        try {
            const graphWorker = (window as any).__kensho_workers?.['GraphWorker'];
            if (!graphWorker) return;

            const tasks = await mainBus.request<ProjectTask[]>('GraphWorker', {
                method: 'getProjectTasks',
                args: [projectId]
            });

            set(state => {
                const newTasksMap = new Map(state.projectTasks);
                newTasksMap.set(projectId, tasks);
                return { projectTasks: newTasksMap };
            });

            console.log(`[KenshoStore] ${tasks.length} tâche(s) chargée(s) pour projet ${projectId}`);
        } catch (error) {
            console.error('[KenshoStore] Erreur lors du chargement des tâches:', error);
        }
    },

    /**
     * Sprint 7: Crée un nouveau projet
     */
    createProject: async (name: string, goal: string) => {
        const { mainBus, projects, loadProjects } = get();

        try {
            let projectId: string;
            const graphWorker = (window as any).__kensho_workers?.['GraphWorker'];
            
            if (mainBus && graphWorker) {
                try {
                    projectId = await mainBus.request<string>('GraphWorker', {
                        method: 'createProject',
                        args: [name, goal]
                    });
                    console.log(`[KenshoStore] Projet créé via GraphWorker: ${name} (${projectId})`);
                } catch (workerError) {
                    console.warn('[KenshoStore] GraphWorker indisponible, création locale');
                    projectId = `proj_${Date.now()}`;
                }
            } else {
                projectId = `proj_${Date.now()}`;
            }
            
            // Créer le projet localement
            const newProject: Project = {
                id: projectId,
                name,
                goal,
                createdAt: Date.now(),
                isArchived: 0,
                lastActivityAt: Date.now()
            };
            
            const updatedProjects = [...projects, newProject];
            localStorage.setItem('kensho_projects', JSON.stringify(updatedProjects));
            set({ projects: updatedProjects });

            console.log(`[KenshoStore] Projet créé: ${name} (${projectId})`);
            await loadProjects();
            
            // Sprint 7: Synchronisation multi-onglets
            const { projectSyncChannel } = get();
            if (projectSyncChannel) {
                projectSyncChannel.postMessage({ type: 'projects_updated' });
            }
            
            toast.success('Projet créé', {
                description: `Le projet "${name}" a été créé avec succès`,
                duration: 3000
            });
        } catch (error) {
            console.error('[KenshoStore] Erreur lors de la création du projet:', error);
            toast.error('Erreur', {
                description: 'Impossible de créer le projet',
                duration: 4000
            });
        }
    },

    /**
     * Sprint 7: Crée une nouvelle tâche pour un projet
     */
    createTask: async (projectId: string, text: string) => {
        const { mainBus, loadProjectTasks } = get();
        if (!mainBus) return;

        try {
            const graphWorker = (window as any).__kensho_workers?.['GraphWorker'];
            if (!graphWorker) return;

            await mainBus.request('GraphWorker', {
                method: 'createTask',
                args: [projectId, text]
            });

            console.log(`[KenshoStore] Tâche créée pour projet ${projectId}`);
            await loadProjectTasks(projectId);
            
            // Sprint 7: Synchronisation multi-onglets
            const { projectSyncChannel } = get();
            if (projectSyncChannel) {
                projectSyncChannel.postMessage({ type: 'tasks_updated', projectId });
            }
        } catch (error) {
            console.error('[KenshoStore] Erreur lors de la création de la tâche:', error);
        }
    },

    /**
     * Sprint 7: Bascule l'état d'une tâche (complétée/non complétée)
     */
    toggleTask: async (taskId: string) => {
        const { mainBus, projectTasks, loadProjectTasks } = get();
        if (!mainBus) return;

        try {
            const graphWorker = (window as any).__kensho_workers?.['GraphWorker'];
            if (!graphWorker) return;

            await mainBus.request('GraphWorker', {
                method: 'toggleTask',
                args: [taskId]
            });

            const projectId = Array.from(projectTasks.entries())
                .find(([_, tasks]) => tasks.some(t => t.id === taskId))?.[0];

            if (projectId) {
                await loadProjectTasks(projectId);
                
                // Sprint 7: Synchronisation multi-onglets
                const { projectSyncChannel } = get();
                if (projectSyncChannel) {
                    projectSyncChannel.postMessage({ type: 'tasks_updated', projectId });
                }
            }

            console.log(`[KenshoStore] Tâche ${taskId} basculée`);
        } catch (error) {
            console.error('[KenshoStore] Erreur lors de la bascule de la tâche:', error);
        }
    }
    };
});
