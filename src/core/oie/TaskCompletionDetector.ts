/**
 * TaskCompletionDetector - Détecte automatiquement les tâches complétées dans les réponses de l'IA
 * Sprint 7 - Phase 3
 * 
 * Responsabilités:
 * - Analyse la réponse de l'IA pour détecter les tâches qui ont été complétées
 * - Compare sémantiquement avec les tâches existantes du projet
 * - Met à jour automatiquement l'état des tâches
 */

import { ProjectTask } from '../../agents/graph/types';

export class TaskCompletionDetector {
    /**
     * Détecte si une tâche a été mentionnée comme complétée dans la réponse
     */
    public static detectCompletedTasks(
        response: string,
        projectTasks: ProjectTask[]
    ): ProjectTask[] {
        const completedTasks: ProjectTask[] = [];

        // Mots clés indiquant une tâche complétée
        const completionKeywords = [
            'complétée',
            'completed',
            'done',
            'terminée',
            'finished',
            'finalized',
            'accompli',
            'réalisée',
            'fait',
            'ready',
            'prêt',
            'déployée',
            'deployed'
        ];

        const responseLower = response.toLowerCase();

        projectTasks.forEach(task => {
            if (task.completed) {
                return; // Ignorer les tâches déjà complétées
            }

            // Vérifier si la tâche est mentionnée dans la réponse
            const taskMentioned = responseLower.includes(task.text.toLowerCase());

            if (taskMentioned) {
                // Vérifier si des mots clés de complétion sont proches de la mention
                const taskContext = this.extractContext(responseLower, task.text.toLowerCase());
                const isCompleted = completionKeywords.some(keyword =>
                    taskContext.includes(keyword)
                );

                if (isCompleted) {
                    completedTasks.push(task);
                }
            }
        });

        return completedTasks;
    }

    /**
     * Extrait le contexte autour d'une mention de tâche (100 caractères avant/après)
     */
    private static extractContext(text: string, taskMention: string): string {
        const index = text.indexOf(taskMention);
        if (index === -1) return '';

        const start = Math.max(0, index - 100);
        const end = Math.min(text.length, index + taskMention.length + 100);

        return text.substring(start, end);
    }

    /**
     * Crée un prompt pour que l'IA détecte les tâches complétées
     * (Optionnel: pour améliorer la détection)
     */
    public static createDetectionPrompt(
        response: string,
        projectTasks: ProjectTask[]
    ): string {
        return `Analyse la réponse suivante et détecte les tâches qui ont été complétées:

Tâches du projet:
${projectTasks.map((t, i) => `${i + 1}. ${t.text}`).join('\n')}

Réponse de l'assistant:
"${response}"

Retourne un JSON avec:
- task_ids: IDs des tâches complétées (tableau vide si aucune)
- confidence: Niveau de confiance (0-1)
- reason: Raison de la détection`;
    }
}
