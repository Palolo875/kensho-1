import { create } from 'zustand';
import { Message } from './useKenshoStore';
import { createLogger } from '@/lib/logger';

const log = createLogger('MessagesStore');

const STORAGE_KEY = 'kensho_conversation_history';
const MAX_STORED_MESSAGES = 100;

/**
 * Charge l'historique des messages depuis localStorage
 */
const loadMessagesFromLocalStorage = (): Message[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const messages = JSON.parse(stored);
            log.info(`${messages.length} messages chargés depuis localStorage`);
            return messages;
        }
    } catch (error) {
        log.error('Erreur lors du chargement des messages', error instanceof Error ? error : undefined);
    }
    return [];
};

/**
 * Sauvegarde l'historique des messages dans localStorage
 */
const saveMessagesToLocalStorage = (messages: Message[]) => {
    try {
        const messagesToStore = messages.slice(-MAX_STORED_MESSAGES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesToStore));
    } catch (error) {
        log.error('Erreur lors de la sauvegarde des messages', error instanceof Error ? error : undefined);
    }
};

interface MessagesState {
    messages: Message[];
    isKenshoWriting: boolean;
    statusMessage: string | null;
    currentThoughtProcess: any[] | null; // TODO: Fix type
    
    sendMessage: (text: string) => void;
    clearMessages: () => void;
    loadMessagesFromStorage: () => void;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
    messages: loadMessagesFromLocalStorage(),
    isKenshoWriting: false,
    statusMessage: null,
    currentThoughtProcess: null,
    
    sendMessage: (text: string) => {
        // Implementation will be moved from useKenshoStore
        console.log('sendMessage', text); // TODO: Replace with proper implementation
    },
    
    clearMessages: () => {
        set({ messages: [] });
        localStorage.removeItem(STORAGE_KEY);
        log.info('🗑️ Conversation effacée');
    },
    
    loadMessagesFromStorage: () => {
        const messages = loadMessagesFromLocalStorage();
        set({ messages });
    }
}));