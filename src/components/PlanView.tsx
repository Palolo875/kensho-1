/**
 * Composant PlanView - Affiche le plan de réflexion de Kensho
 * 
 * Ce composant permet d'afficher la "pensée" du planificateur et les étapes
 * du plan d'action généré par le LLMPlanner.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Brain } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface PlanStep {
    agent: string;
    action: string;
    args: Record<string, any>;
}

interface Plan {
    thought: string;
    steps: PlanStep[];
}

interface PlanViewProps {
    plan?: Plan;
}

export function PlanView({ plan }: PlanViewProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (!plan || !plan.steps) {
        return null;
    }

    return (
        <Card className="mb-2 border-primary/30 bg-primary/5">
            <CardContent className="p-3">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full justify-between hover:bg-primary/10"
                >
                    <span className="flex items-center gap-2">
                        <Brain className="w-4 h-4" />
                        <span className="font-medium">
                            {isOpen ? 'Masquer la réflexion' : 'Voir la réflexion de Kensho'}
                        </span>
                    </span>
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
                
                {isOpen && (
                    <div className="mt-3 space-y-3 text-sm">
                        <div>
                            <p className="font-semibold text-foreground/80 mb-1">Pensée :</p>
                            <p className="text-muted-foreground italic pl-3 border-l-2 border-primary/40">
                                {plan.thought}
                            </p>
                        </div>
                        
                        <div>
                            <p className="font-semibold text-foreground/80 mb-2">Plan d'action :</p>
                            <ol className="space-y-2 pl-5 list-decimal">
                                {plan.steps.map((step, i) => (
                                    <li key={i} className="text-muted-foreground">
                                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                                            {step.agent}
                                        </span>
                                        <span className="mx-1 text-muted-foreground/60">→</span>
                                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                                            {step.action}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
