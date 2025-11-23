/**
 * ProjectContextBuilder - Construit le contexte du projet pour enrichir les réponses de l'IA
 * Sprint 7 - Phase 3
 * 
 * Responsabilités:
 * - Récupère le projet actif depuis le store
 * - Formate les tâches du projet de manière lisible
 * - Injecte le contexte dans les prompts de l'IA
 */

import { Project, ProjectTask } from '../../agents/graph/types';

export class ProjectContextBuilder {
    /**
     * Construit un contexte formaté à partir d'un projet et ses tâches
     */
    public static buildProjectContext(project: Project, tasks: ProjectTask[]): string {
        if (!project) {
            return '';
        }

        const completedTasks = tasks.filter(t => t.completed);
        const pendingTasks = tasks.filter(t => !t.completed);

        let context = `\n📋 **CONTEXTE PROJET ACTIF:**\n`;
        context += `- Nom: ${project.name}\n`;
        
        if (project.goal) {
            context += `- Objectif: ${project.goal}\n`;
        }

        context += `- Tâches: ${completedTasks.length}/${tasks.length} complétées\n`;

        if (pendingTasks.length > 0) {
            context += `\n**TÂCHES À FAIRE:**\n`;
            pendingTasks.forEach((task, i) => {
                context += `${i + 1}. ${task.text}\n`;
            });
        }

        if (completedTasks.length > 0) {
            context += `\n**TÂCHES COMPLÉTÉES:**\n`;
            completedTasks.slice(0, 3).forEach((task, i) => {
                context += `✓ ${task.text}\n`;
            });
            if (completedTasks.length > 3) {
                context += `... et ${completedTasks.length - 3} de plus\n`;
            }
        }

        return context;
    }

    /**
     * Injecte le contexte du projet dans un prompt utilisateur
     */
    public static enrichPromptWithProjectContext(
        userPrompt: string,
        project: Project | null,
        tasks: ProjectTask[]
    ): string {
        if (!project) {
            return userPrompt;
        }

        const projectContext = this.buildProjectContext(project, tasks);
        return `${userPrompt}${projectContext}`;
    }

    /**
     * Détecte si le message de l'utilisateur mentionne un projet ou une tâche
     */
    public static detectProjectMention(query: string): boolean {
        const projectKeywords = [
            'tâche',
            'task',
            'projet',
            'project',
            'complet',
            'done',
            'finish',
            'finir',
            'terminer',
            'checked',
            'checklist'
        ];

        return projectKeywords.some(keyword =>
            query.toLowerCase().includes(keyword)
        );
    }
}
