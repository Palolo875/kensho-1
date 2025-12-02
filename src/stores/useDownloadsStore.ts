import { create } from 'zustand';
import { DownloadProgress } from '../core/downloads/DownloadManager';
import { createLogger } from '@/lib/logger';

const log = createLogger('DownloadsStore');

interface DownloadsState {
    downloads: DownloadProgress[];
    
    pauseAllDownloads: () => void;
    resumeAllDownloads: () => void;
    cancelAllDownloads: () => void;
}

export const useDownloadsStore = create<DownloadsState>((set: (partial: DownloadsState | Partial<DownloadsState> | ((state: DownloadsState) => DownloadsState | Partial<DownloadsState>)) => void, get: () => DownloadsState) => ({
    downloads: [],
    
    pauseAllDownloads: () => {
        // Implementation will be moved from useKenshoStore
        log.info('Pausing all downloads');
    },
    
    resumeAllDownloads: () => {
        // Implementation will be moved from useKenshoStore
        log.info('Resuming all downloads');
    },
    
    cancelAllDownloads: () => {
        // Implementation will be moved from useKenshoStore
        log.info('Canceling all downloads');
    }
}));