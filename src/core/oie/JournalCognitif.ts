/**
 * JournalCognitif - Système de traçabilité pour les débats internes
 * 
 * Ce journal enregistre chaque étape du processus de réflexion de Kensho,
 * permettant la transparence et le debug des raisonnements complexes.
 */

export interface JournalStep {
    stepId: string;
    agent: string;
    action: string;
    label?: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
}

export interface SerializedJournal {
    type: 'debate' | 'simple';
    queryId: string;
    userQuery: string;
    startTime: number;
    endTime?: number;
    totalDuration?: number;
    steps: JournalStep[];
    finalResponse?: string;
    degradationApplied?: boolean; // Si true, la synthèse a été annulée et le draft retourné
    degradationReason?: string;
}

export class JournalCognitif {
    private steps: JournalStep[] = [];
    private startTime: number;
    private endTime?: number;
    private finalResponse?: string;
    private degradationApplied = false;
    private degradationReason?: string;

    constructor(
        private type: 'debate' | 'simple',
        private queryId: string = crypto.randomUUID(),
        private userQuery: string = ''
    ) {
        this.startTime = performance.now();
    }

    /**
     * Démarre l'enregistrement d'une étape
     */
    public startStep(stepId: string, agent: string, action: string, label?: string): void {
        const step: JournalStep = {
            stepId,
            agent,
            action,
            label,
            startTime: performance.now(),
            status: 'running'
        };
        this.steps.push(step);
    }

    /**
     * Termine une étape avec succès
     */
    public completeStep(stepId: string, result: any): void {
        const step = this.steps.find(s => s.stepId === stepId);
        if (step) {
            step.endTime = performance.now();
            step.duration = step.endTime - step.startTime;
            step.status = 'completed';
            step.result = result;
        }
    }

    /**
     * Marque une étape comme échouée
     */
    public failStep(stepId: string, error: string): void {
        const step = this.steps.find(s => s.stepId === stepId);
        if (step) {
            step.endTime = performance.now();
            step.duration = step.endTime - step.startTime;
            step.status = 'failed';
            step.error = error;
        }
    }

    /**
     * Définit la réponse finale
     */
    public setFinalResponse(response: string): void {
        this.finalResponse = response;
    }

    /**
     * Marque que le Graceful Degradation a été appliqué
     */
    public setDegradation(reason: string): void {
        this.degradationApplied = true;
        this.degradationReason = reason;
    }

    /**
     * Termine le journal
     */
    public end(): void {
        this.endTime = performance.now();
    }

    /**
     * Sérialise le journal pour le transport vers l'UI
     */
    public serialize(): SerializedJournal {
        return {
            type: this.type,
            queryId: this.queryId,
            userQuery: this.userQuery,
            startTime: this.startTime,
            endTime: this.endTime,
            totalDuration: this.endTime ? this.endTime - this.startTime : undefined,
            steps: this.steps,
            finalResponse: this.finalResponse,
            degradationApplied: this.degradationApplied,
            degradationReason: this.degradationReason
        };
    }

    /**
     * Obtient un résumé textuel du journal pour le debugging
     */
    public getSummary(): string {
        const lines: string[] = [
            `Journal Cognitif - Type: ${this.type}`,
            `Durée totale: ${this.endTime ? (this.endTime - this.startTime).toFixed(0) : '?'}ms`,
            `Étapes: ${this.steps.length}`,
            ''
        ];

        for (const step of this.steps) {
            lines.push(`[${step.status}] ${step.label || step.agent}.${step.action} (${step.duration?.toFixed(0) || '?'}ms)`);
            if (step.error) {
                lines.push(`  Erreur: ${step.error}`);
            }
        }

        if (this.degradationApplied) {
            lines.push('');
            lines.push(`⚠️ Graceful Degradation appliqué: ${this.degradationReason}`);
        }

        return lines.join('\n');
    }
}
