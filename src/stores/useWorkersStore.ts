import { create } from 'zustand';
import { WorkerError } from './useKenshoStore';
import { createLogger } from '@/lib/logger';
import type { KenshoWindow } from '@/types/kensho';

const log = createLogger('WorkersStore');

interface WorkerStatus {
    llm: boolean;
    oie: boolean;
    telemetry: boolean;
}

interface WorkersState {
    workerErrors: WorkerError[];
    workersReady: WorkerStatus;
    
    init: () => void;
    startLLMWorker: () => void;
    clearWorkerErrors: () => void;
}

export const useWorkersStore = create<WorkersState>((set, get) => ({
    workerErrors: [],
    workersReady: { llm: false, oie: false, telemetry: false },
    
    init: () => {
        // Implementation will be moved from useKenshoStore
        log.info('Initializing workers');
    },
    
    startLLMWorker: () => {
        // Implementation will be moved from useKenshoStore
        log.info('Starting LLM worker');
    },
    
    clearWorkerErrors: () => {
        set({ workerErrors: [] });
    }
}));