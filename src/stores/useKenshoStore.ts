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
import { toast } from 'sonner';


const STORAGE_KEY = 'kensho_conversation_history';
const MAX_STORED_MESSAGES = 100;

export interface Message {
    id: string;
    text: string;
    author: 'user' | 'kensho';
    timestamp: number;
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

interface KenshoState {
    messages: Message[];
    modelProgress: ModelLoaderProgress;
    isKenshoWriting: boolean;
    mainBus: MessageBus | null;
    isInitialized: boolean;
    isLoadingMinimized: boolean;
    isLoadingPaused: boolean;
    workerErrors: WorkerError[];
    workersReady: WorkerStatus;

    init: () => void;
    sendMessage: (text: string) => void;
    clearMessages: () => void;
    setLoadingMinimized: (minimized: boolean) => void;
    setLoadingPaused: (paused: boolean) => void;
    startDownload: () => void;
    loadMessagesFromStorage: () => void;
    clearWorkerErrors: () => void;
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
 * Démarre la constellation de workers (LLM, OIE, Telemetry)
 */
const startConstellation = (set: StoreApi<KenshoState>['setState']) => {
    // Démarrer le LLM Worker
    try {
        const llmWorker = new Worker(
            new URL('../agents/llm/index.ts', import.meta.url),
            { type: 'module' }
        );

        // Stocker le worker pour contrôle externe (pause/reprise)
        (window as any).__kensho_workers = (window as any).__kensho_workers || {};
        (window as any).__kensho_workers['MainLLMAgent'] = llmWorker;

        // Écouter les messages de progression du modèle
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
            console.error('[KenshoStore] Erreur du LLM Worker:', error);
            const workerError: WorkerError = {
                worker: 'llm',
                message: 'Erreur lors du démarrage du worker LLM',
                timestamp: Date.now()
            };
            toast.error('❌ Worker LLM indisponible', {
                description: 'Le moteur d\'IA n\'a pas pu démarrer',
                duration: 8000
            });
            set(state => ({
                modelProgress: {
                    phase: 'error',
                    progress: 0,
                    text: workerError.message
                },
                workerErrors: [...state.workerErrors, workerError]
            }));
        };

        console.log('[KenshoStore] LLM Worker démarré');
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
            console.error('[KenshoStore] Erreur du OIE Worker:', error);
            const workerError: WorkerError = {
                worker: 'oie',
                message: 'Erreur du worker OIE - orchestration indisponible',
                timestamp: Date.now()
            };
            set(state => ({
                workerErrors: [...state.workerErrors, workerError]
            }));
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
            console.error('[KenshoStore] Erreur du Telemetry Worker:', error);
            const workerError: WorkerError = {
                worker: 'telemetry',
                message: 'Erreur du worker Telemetry - logging indisponible',
                timestamp: Date.now()
            };
            set(state => ({
                workerErrors: [...state.workerErrors, workerError]
            }));
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
};

export const useKenshoStore = create<KenshoState>((set, get) => ({
    messages: loadMessagesFromLocalStorage(),
    modelProgress: { phase: 'idle', progress: 0, text: 'Initialisation...' },
    isKenshoWriting: false,
    mainBus: null,
    isInitialized: false,
    isLoadingMinimized: false,
    isLoadingPaused: false,
    workerErrors: [],
    workersReady: { llm: false, oie: false, telemetry: false },

    /**
     * Initialise le système Kensho
     * - Crée le MessageBus pour le thread principal
     * - Démarre les workers (LLM et OIE)
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
        set({ mainBus, isInitialized: true });

        // Démarrer la constellation de workers
        startConstellation(set);
    },

    /**
     * Envoie un message à Kensho
     * - Ajoute immédiatement le message utilisateur à l'UI
     * - Crée un placeholder pour la réponse de Kensho
     * - Lance un stream vers l'OIE Agent
     * - Met à jour le placeholder au fur et à mesure des chunks
     */
    sendMessage: (text) => {
        const { mainBus, messages, modelProgress, workersReady } = get();

        // Vérifications
        if (!mainBus) {
            console.error('[KenshoStore] ❌ MessageBus non initialisé');
            return;
        }

        if (text.trim() === '') {
            return;
        }

        if (modelProgress.phase !== 'ready') {
            console.warn('[KenshoStore] ⚠️ Le modèle n\'est pas encore prêt. Phase actuelle:', modelProgress.phase);
            return;
        }

        // Vérifier que les workers sont prêts
        if (!workersReady.oie) {
            console.warn('[KenshoStore] ⚠️ OIE Worker n\'est pas encore prêt');
            return;
        }

        if (!workersReady.llm) {
            console.warn('[KenshoStore] ⚠️ LLM Worker n\'est pas encore prêt');
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

        console.log('[KenshoStore] 📤 Envoi du message vers OIEAgent:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
        console.log('[KenshoStore] 🔍 Workers status:', workersReady);

        // Lancer le stream vers l'OIE Agent
        // Le payload doit être au format { method, args } pour AgentRuntime
        const streamId = mainBus.requestStream(
            'OIEAgent',
            { method: 'executeQuery', args: [{ query: text.trim() }] },
            {
                onChunk: (chunk: any) => {
                    // Mettre à jour le dernier message de Kensho avec le nouveau texte
                    console.log('[KenshoStore] 📥 Chunk reçu:', chunk.text?.substring(0, 30) + (chunk.text?.length > 30 ? '...' : ''));
                    set(state => {
                        const updatedMessages = state.messages.map(msg =>
                            msg.id === kenshoResponsePlaceholder.id
                                ? { ...msg, text: msg.text + (chunk.text || '') }
                                : msg
                        );
                        saveMessagesToLocalStorage(updatedMessages);
                        return { messages: updatedMessages };
                    });
                },
                onEnd: (finalPayload) => {
                    console.log('[KenshoStore] ✅ Stream terminé:', finalPayload);
                    set(state => {
                        saveMessagesToLocalStorage(state.messages);
                        return { isKenshoWriting: false };
                    });
                },
                onError: (error) => {
                    console.error('[KenshoStore] ❌ Erreur de stream:', error);

                    // Afficher un toast d'erreur
                    toast.error('Erreur de communication', {
                        description: error.message || 'Impossible de contacter l\'agent',
                        duration: 6000
                    });

                    set(state => {
                        // Supprimer le placeholder de réponse
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
            }
        );

        console.log('[KenshoStore] 🆔 Stream créé avec ID:', streamId);
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
        // Envoyer le message au worker LLM
        const llmWorker = (window as any).__kensho_workers?.['MainLLMAgent'];
        if (llmWorker) {
            llmWorker.postMessage({ type: paused ? 'PAUSE_DOWNLOAD' : 'RESUME_DOWNLOAD' });
        }
    },

    /**
     * Démarre le téléchargement du modèle
     */
    startDownload: () => {
        const llmWorker = (window as any).__kensho_workers?.['MainLLMAgent'];
        if (llmWorker) {
            console.log('[KenshoStore] 🚀 Démarrage manuel du téléchargement');
            llmWorker.postMessage({ type: 'START_DOWNLOAD' });
        } else {
            console.error('[KenshoStore] ❌ Impossible de démarrer le téléchargement: Worker LLM introuvable');
            toast.error('Erreur système', { description: 'Worker LLM non initialisé' });
        }
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
    }
}));
