/**
 * CreateProjectDialog - Dialogue pour créer un nouveau projet
 * Sprint 7 - Phase 2
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useProjects } from '@/hooks/useProjects';

interface CreateProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
    const [projectName, setProjectName] = useState('');
    const [projectGoal, setProjectGoal] = useState('');
    const { createProject } = useProjects();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (projectName.trim()) {
            await createProject(projectName.trim(), projectGoal.trim() || undefined);
            setProjectName('');
            setProjectGoal('');
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Créer un nouveau projet</DialogTitle>
                        <DialogDescription>
                            Définissez un nom et un objectif pour votre nouveau projet.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="project-name">Nom du projet *</Label>
                            <Input
                                id="project-name"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="Mon projet"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="project-goal">Objectif (optionnel)</Label>
                            <Input
                                id="project-goal"
                                value={projectGoal}
                                onChange={(e) => setProjectGoal(e.target.value)}
                                placeholder="Créer une application web..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Annuler
                        </Button>
                        <Button type="submit" disabled={!projectName.trim()}>
                            Créer
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
