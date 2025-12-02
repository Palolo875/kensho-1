import { create } from 'zustand';
import { ModelLoaderProgress } from '../core/models/ModelLoader';
import { createLogger } from '@/lib/logger';

const log = createLogger('ModelStore');

interface ModelState {
    modelProgress: ModelLoaderProgress;
    isLoadingMinimized: boolean;
    isLoadingPaused: boolean;
    modelDownloadStarted: boolean;
    
    setLoadingMinimized: (minimized: boolean) => void;
    setLoadingPaused: (paused: boolean) => void;
    startModelDownload: () => void;
    pauseModelDownload: () => void;
    resumeModelDownload: () => void;
    cancelModelDownload: () => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
    modelProgress: { phase: 'idle', progress: 0, text: 'Initialisation...' },
    isLoadingMinimized: false,
    isLoadingPaused: false,
    modelDownloadStarted: false,
    
    setLoadingMinimized: (minimized: boolean) => {
        set({ isLoadingMinimized: minimized });
    },
    
    setLoadingPaused: (paused: boolean) => {
        set({ isLoadingPaused: paused });
    },
    
    startModelDownload: () => {
        // Implementation will be moved from useKenshoStore
        log.info('Starting model download');
    },
    
    pauseModelDownload: () => {
        // Implementation will be moved from useKenshoStore
        log.info('Pausing model download');
    },
    
    resumeModelDownload: () => {
        // Implementation will be moved from useKenshoStore
        log.info('Resuming model download');
    },
    
    cancelModelDownload: () => {
        // Implementation will be moved from useKenshoStore
        log.info('Canceling model download');
    }
}));