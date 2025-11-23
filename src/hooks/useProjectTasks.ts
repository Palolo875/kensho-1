/**
 * Hook pour récupérer et gérer les tâches d'un projet
 * Sprint 7 - Tâche des Jours 4-5
 */

import { useEffect } from 'react';
import { useKenshoStore } from '../stores/useKenshoStore';

export function useProjectTasks(projectId: string | null) {
    const projectTasks = useKenshoStore(state => state.projectTasks);
    const loadProjectTasks = useKenshoStore(state => state.loadProjectTasks);
    const createTask = useKenshoStore(state => state.createTask);
    const toggleTask = useKenshoStore(state => state.toggleTask);
    const isInitialized = useKenshoStore(state => state.isInitialized);

    // Charger les tâches quand le projectId change
    useEffect(() => {
        if (projectId && isInitialized) {
            loadProjectTasks(projectId);
        }
    }, [projectId, isInitialized, loadProjectTasks]);

    const tasks = projectId ? (projectTasks.get(projectId) || []) : [];

    return {
        tasks,
        createTask,
        toggleTask,
        loadProjectTasks
    };
}
