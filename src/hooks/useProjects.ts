/**
 * Hook pour récupérer et gérer les projets
 * Sprint 7 - Tâche des Jours 4-5
 */

import { useEffect } from 'react';
import { useKenshoStore } from '../stores/useKenshoStore';

export function useProjects() {
    const projects = useKenshoStore(state => state.projects);
    const activeProjectId = useKenshoStore(state => state.activeProjectId);
    const loadProjects = useKenshoStore(state => state.loadProjects);
    const setActiveProjectId = useKenshoStore(state => state.setActiveProjectId);
    const createProject = useKenshoStore(state => state.createProject);
    const isInitialized = useKenshoStore(state => state.isInitialized);

    // Charger les projets au montage du composant
    useEffect(() => {
        if (isInitialized) {
            loadProjects();
        }
    }, [isInitialized, loadProjects]);

    return {
        projects,
        activeProjectId,
        setActiveProjectId,
        createProject,
        loadProjects
    };
}
