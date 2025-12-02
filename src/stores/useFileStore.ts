import { create } from 'zustand';
import { createLogger } from '@/lib/logger';

const log = createLogger('FileStore');

interface AttachedFile {
    file: File;
    buffer: ArrayBuffer;
}

interface FileState {
    attachedFile: AttachedFile | null;
    uploadProgress: number;
    ocrProgress: number;
    
    attachFile: (file: File) => void;
    detachFile: () => void;
}

export const useFileStore = create<FileState>((set: (partial: FileState | Partial<FileState> | ((state: FileState) => FileState | Partial<FileState>)) => void, get: () => FileState) => ({
    attachedFile: null,
    uploadProgress: 0,
    ocrProgress: -1,
    
    attachFile: (file: File) => {
        // Implementation will be moved from useKenshoStore
        log.info('Attaching file', file.name);
    },
    
    detachFile: () => {
        set({ attachedFile: null, uploadProgress: 0 });
    }
}));