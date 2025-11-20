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
 */

import { create } from 'zustand';
import { MessageBus } from '../core/communication/MessageBus';
import { ModelLoaderProgress } from '../core/models/ModelLoader';

export interface Message {
    id: string;
    text: string;
    author: 'user' | 'kensho';
    timestamp: number;
}

interface KenshoState {
    messages: Message[];
    modelProgress: ModelLoaderProgress;
    isKenshoWriting: boolean;
    mainBus: MessageBus | null;
    isInitialized: boolean;
    
    init: () => void;
    sendMessage: (text: string) => void;
    clearMessages: () => void;
}

export const useKenshoStore = create<KenshoState>((set, get) => ({
    messages: [],
    modelProgress: { phase: 'idle', progress: 0, text: 'Initialisation...' },
    isKenshoWriting: false,
    mainBus: null,
    isInitialized: false,

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
                set({
                    modelProgress: {
                        phase: 'error',
                        progress: 0,
                        text: 'Erreur lors du démarrage du worker LLM'
                    }
                });
            };

            console.log('[KenshoStore] LLM Worker démarré');
        } catch (error) {
            console.error('[KenshoStore] Erreur lors du démarrage du LLM Worker:', error);
            set({
                modelProgress: {
                    phase: 'error',
                    progress: 0,
                    text: 'Impossible de démarrer le worker LLM'
                }
            });
        }

        // Démarrer l'OIE Worker
        try {
            const oieWorker = new Worker(
                new URL('../agents/oie/index.ts', import.meta.url),
                { type: 'module' }
            );
            
            oieWorker.onerror = (error) => {
                console.error('[KenshoStore] Erreur du OIE Worker:', error);
            };

            console.log('[KenshoStore] OIE Worker démarré');
        } catch (error) {
            console.error('[KenshoStore] Erreur lors du démarrage du OIE Worker:', error);
        }

        // Optionnel: Démarrer le Telemetry Worker pour les logs
        try {
            new Worker(
                new URL('../agents/telemetry/index.ts', import.meta.url),
                { type: 'module' }
            );
            console.log('[KenshoStore] Telemetry Worker démarré');
        } catch (error) {
            console.warn('[KenshoStore] Telemetry Worker non disponible:', error);
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

        // Ajouter les messages à l'état
        set({ 
            messages: [...messages, userMessage, kenshoResponsePlaceholder],
            isKenshoWriting: true 
        });

        console.log('[KenshoStore] Envoi du message:', text.substring(0, 50) + '...');

        // Lancer le stream vers l'OIE Agent
        // Le payload doit être au format { method, args } pour AgentRuntime
        mainBus.requestStream(
            'OIEAgent',
            { method: 'executeQuery', args: [{ query: text.trim() }] },
            {
                onChunk: (chunk: any) => {
                    // Mettre à jour le dernier message de Kensho avec le nouveau texte
                    set(state => ({
                        messages: state.messages.map(msg => 
                            msg.id === kenshoResponsePlaceholder.id 
                                ? { ...msg, text: msg.text + (chunk.text || '') }
                                : msg
                        )
                    }));
                },
                onEnd: (finalPayload) => {
                    console.log('[KenshoStore] Stream terminé:', finalPayload);
                    set({ isKenshoWriting: false });
                },
                onError: (error) => {
                    console.error('[KenshoStore] Erreur de stream:', error);
                    set(state => ({
                        messages: state.messages.map(msg => 
                            msg.id === kenshoResponsePlaceholder.id 
                                ? { 
                                    ...msg, 
                                    text: `Désolé, une erreur est survenue: ${error.message}` 
                                }
                                : msg
                        ),
                        isKenshoWriting: false
                    }));
                }
            }
        );
    },

    /**
     * Efface tous les messages (nouvelle conversation)
     */
    clearMessages: () => {
        set({ messages: [] });
    }
}));
