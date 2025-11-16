// src/core/guardian/OrionGuardian.ts
import { WorkerName, KenshoMessage } from '../communication/types';
import { MessageBus } from '../communication/MessageBus';
import { WorkerRegistry } from './WorkerRegistry';
import { LeaderElection } from './LeaderElection';

/**
 * Le Guardian est le cerveau reptilien de chaque agent.
 * Il gère la conscience de la constellation (via le Registry) et la
 * structure de commandement (via l'Élection).
 */
export class OrionGuardian {
    private readonly selfName: WorkerName;
    private readonly messageBus: MessageBus;
    public readonly workerRegistry: WorkerRegistry;
    private readonly leaderElection: LeaderElection;

    private currentLeader: WorkerName | null = null;
    private currentEpoch = 0;

    constructor(selfName: WorkerName, messageBus: MessageBus) {
        this.selfName = selfName;
        this.messageBus = messageBus;
        this.workerRegistry = new WorkerRegistry(selfName);
        this.leaderElection = new LeaderElection(selfName, messageBus, this.workerRegistry);

        this.messageBus.subscribeToSystemMessages(this.handleSystemMessage.bind(this));
    }

    private handleSystemMessage(message: KenshoMessage): void {
        // Un message est une preuve de vie, peu importe son type
        this.workerRegistry.update(message.sourceWorker);

        // Ne traiter que les messages de broadcast qui ont une payload et un systemType
        if (message.type !== 'broadcast' || !message.payload || !message.payload.systemType) {
            return;
        }

        switch (message.payload.systemType) {
            case 'ELECTION':
                this.leaderElection.handleElectionMessage(message.payload.candidateId);
                break;
            case 'ALIVE':
                this.leaderElection.handleAliveMessage();
                break;
            case 'NEW_LEADER':
                // Mettre à jour le leader et l'epoch
                this.currentLeader = message.payload.leaderId;
                this.currentEpoch = (this.currentEpoch || 0) + 1; // Simplifié pour l'instant
                console.log(`[${this.selfName}] Nouveau leader reconnu: ${this.currentLeader} (Epoch: ${this.currentEpoch})`);
                break;
        }
    }

    public start(): void {
        // Au démarrage, chaque agent tente de lancer une élection.
        // L'algorithme Bully s'assurera qu'un seul leader émerge.
        setTimeout(() => this.leaderElection.startElection(), 1000 + Math.random() * 1000);
    }

    // Méthodes pour les tests et l'Observatory
    public getStatus() {
        return {
            isLeader: this.currentLeader === this.selfName,
            leader: this.currentLeader,
            epoch: this.currentEpoch,
            activeWorkers: this.workerRegistry.getActiveWorkers(),
        };
    }
}
