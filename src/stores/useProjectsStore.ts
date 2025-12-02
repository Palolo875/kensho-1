import { create } from 'zustand';
import { Project, ProjectTask } from '../agents/graph/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProjectsStore');

interface ProjectsState {
    activeProjectId: string | null;
    projects: Project[];
    projectTasks: Map<string, ProjectTask[]>;
    projectSyncChannel: BroadcastChannel | null;
    
    setActiveProjectId: (id: string | null) => void;
    loadProjects: () => Promise<void>;
    loadProjectTasks: (projectId: string) => Promise<void>;
    createProject: (name: string, goal: string) => Promise<void>;
    createTask: (projectId: string, text: string) => Promise<void>;
    toggleTask: (taskId: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set: (partial: ProjectsState | Partial<ProjectsState> | ((state: ProjectsState) => ProjectsState | Partial<ProjectsState>)) => void, get: () => ProjectsState) => ({
    activeProjectId: null,
    projects: [],
    projectTasks: new Map(),
    projectSyncChannel: null,
    
    setActiveProjectId: (id: string | null) => {
        log.debug('Projet actif', { id });
        set({ activeProjectId: id });
    },
    
    loadProjects: async () => {
        // Implementation will be moved from useKenshoStore
        log.info('Loading projects');
    },
    
    loadProjectTasks: async (projectId: string) => {
        // Implementation will be moved from useKenshoStore
        log.info('Loading project tasks', projectId);
    },
    
    createProject: async (name: string, goal: string) => {
        // Implementation will be moved from useKenshoStore
        log.info('Creating project', name);
    },
    
    createTask: async (projectId: string, text: string) => {
        // Implementation will be moved from useKenshoStore
        log.info('Creating task', projectId, text);
    },
    
    toggleTask: async (taskId: string) => {
        // Implementation will be moved from useKenshoStore
        log.info('Toggling task', taskId);
    }
}));