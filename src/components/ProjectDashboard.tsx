/**
 * ProjectDashboard - Affiche les détails d'un projet et ses tâches
 * Sprint 7 - Tâche des Jours 4-5
 */

import { useState } from 'react';
import { useProjects } from '../hooks/useProjects';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { PlusCircle, Target } from 'lucide-react';

export function ProjectDashboard() {
    const { activeProjectId, projects } = useProjects();
    const { tasks, createTask, toggleTask } = useProjectTasks(activeProjectId);
    const [newTaskText, setNewTaskText] = useState('');

    const activeProject = projects.find(p => p.id === activeProjectId);

    if (!activeProjectId || !activeProject || activeProject.name === 'Général') {
        return null;
    }

    const handleCreateTask = async () => {
        if (newTaskText.trim() && activeProjectId) {
            await createTask(activeProjectId, newTaskText.trim());
            setNewTaskText('');
        }
    };

    const completedCount = tasks.filter(t => t.completed).length;
    const totalCount = tasks.length;

    return (
        <div className="border-b bg-gradient-to-r from-primary/5 to-primary/10 p-4 rounded-lg mb-4">
            <div className="flex items-start gap-3 mb-3">
                <Target className="h-6 w-6 text-primary mt-1" />
                <div className="flex-1">
                    <h2 className="text-2xl font-bold text-foreground">{activeProject.name}</h2>
                    {activeProject.goal && (
                        <p className="text-muted-foreground mt-1">{activeProject.goal}</p>
                    )}
                </div>
            </div>

            {totalCount > 0 && (
                <div className="mb-3 text-sm text-muted-foreground">
                    Progression : {completedCount}/{totalCount} tâches complétées
                    {totalCount > 0 && (
                        <div className="w-full bg-secondary h-2 rounded-full mt-1">
                            <div
                                className="bg-primary h-2 rounded-full transition-all"
                                style={{ width: `${(completedCount / totalCount) * 100}%` }}
                            />
                        </div>
                    )}
                </div>
            )}

            <div className="mt-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <span>Tâches</span>
                    <span className="text-xs text-muted-foreground">
                        ({tasks.length})
                    </span>
                </h3>

                <div className="space-y-2 mb-3">
                    {tasks.map(task => (
                        <div
                            key={task.id}
                            className="flex items-center gap-2 p-2 rounded hover:bg-accent/50 transition-colors"
                        >
                            <Checkbox
                                checked={!!task.completed}
                                onCheckedChange={() => toggleTask(task.id)}
                                className="h-4 w-4"
                            />
                            <span className={task.completed ? 'line-through text-muted-foreground' : ''}>
                                {task.text}
                            </span>
                        </div>
                    ))}
                    {tasks.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">
                            Aucune tâche pour ce projet
                        </p>
                    )}
                </div>

                <div className="flex gap-2">
                    <Input
                        placeholder="Ajouter une nouvelle tâche..."
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleCreateTask();
                            }
                        }}
                        className="flex-1"
                    />
                    <Button
                        onClick={handleCreateTask}
                        disabled={!newTaskText.trim()}
                        size="sm"
                    >
                        <PlusCircle className="h-4 w-4 mr-1" />
                        Ajouter
                    </Button>
                </div>
            </div>
        </div>
    );
}
