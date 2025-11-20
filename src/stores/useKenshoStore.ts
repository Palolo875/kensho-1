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

import { create } from 'zustand';
import { MessageBus } from '../core/communication/MessageBus';
import { ModelLoaderProgress } from '../core/models/ModelLoader';

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

interface KenshoState {
    messages: Message[];
    modelProgress: ModelLoaderProgress;
    isKenshoWriting: boolean;
    mainBus: MessageBus | null;
    isInitialized: boolean;
    isLoadingMinimized: boolean;
    workerErrors: WorkerError[];
    
    init: () => void;
    sendMessage: (text: string) => void;
    clearMessages: () => void;
    setLoadingMinimized: (minimized: boolean) => void;
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

export const useKenshoStore = create<KenshoState>((set, get) => ({
    messages: loadMessagesFromLocalStorage(),
    modelProgress: { phase: 'idle', progress: 0, text: 'Initialisation...' },
    isKenshoWriting: false,
    mainBus: null,
    isInitialized: false,
    isLoadingMinimized: false,
    workerErrors: [],

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

        // Démarrer le LLM Worker
        try {
            const llmWorker = new Worker(
                new URL('../agents/llm/index.ts', import.meta.url),
                { type: 'module' }
            );
            
            // Écouter les messages de progression du modèle
            llmWorker.onmessage = (e) => {
                if (e.data.type === 'MODEL_PROGRESS') {
                    console.log('[KenshoStore] Progression du modèle:', e.data.payload);
                    set({ modelProgress: e.data.payload });
                } else if (e.data.type === 'MODEL_ERROR') {
                    console.error('[KenshoStore] Erreur de chargement du modèle:', e.data.payload);
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
    },

    /**
     * Envoie un message à Kensho
     * - Ajoute immédiatement le message utilisateur à l'UI
     * - Crée un placeholder pour la réponse de Kensho
     * - Lance un stream vers l'OIE Agent
     * - Met à jour le placeholder au fur et à mesure des chunks
     */
    sendMessage: (text) => {
        const { mainBus, messages, modelProgress } = get();
        
        // Vérifications
        if (!mainBus) {
            console.error('[KenshoStore] MessageBus non initialisé');
            return;
        }

        if (text.trim() === '') {
            return;
        }

        if (modelProgress.phase !== 'ready') {
            console.warn('[KenshoStore] Le modèle n\'est pas encore prêt');
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

        console.log('[KenshoStore] 📤 Envoi du message:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

        // Lancer le stream vers l'OIE Agent
        // Le payload doit être au format { method, args } pour AgentRuntime
        mainBus.requestStream(
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
                    set(state => {
                        const updatedMessages = state.messages.map(msg => 
                            msg.id === kenshoResponsePlaceholder.id 
                                ? { 
                                    ...msg, 
                                    text: `Désolé, une erreur est survenue: ${error.message}` 
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
        );
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
