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
    private heartbeatTimer: any;
    private failureDetectorTimer: any;

    private static readonly HEARTBEAT_INTERVAL = 2000; // 2 secondes
    private static readonly FAILURE_THRESHOLD = 6000;  // 6 secondes (3x l'intervalle)

    constructor(selfName: WorkerName, messageBus: MessageBus) {
        this.selfName = selfName;
        this.messageBus = messageBus;
        this.workerRegistry = new WorkerRegistry(selfName);
        this.leaderElection = new LeaderElection(selfName, messageBus, this.workerRegistry);

        this.messageBus.subscribeToSystemMessages(this.handleSystemMessage.bind(this));
    }

    private handleSystemMessage(message: KenshoMessage): void {
        this.workerRegistry.update(message.sourceWorker);

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
                this.handleNewLeader(message.payload.leaderId);
                break;
            case 'HEARTBEAT':
                if (message.sourceWorker === this.currentLeader) {
                    this.resetFailureDetector();
                }
                break;
            case 'I_AM_THE_NEW_LEADER':
                if (message.sourceWorker === this.selfName) {
                    this.handleNewLeader(this.selfName);
                    this.messageBus.broadcastSystemMessage('NEW_LEADER', { leaderId: this.selfName });
                }
                break;
        }
    }

    private handleNewLeader(leaderId: WorkerName): void {
        if (leaderId === this.currentLeader) return;

        console.log(`[${this.selfName}] Nouveau leader reconnu: ${leaderId}`);
        this.currentLeader = leaderId;
        this.currentEpoch++;

        clearInterval(this.heartbeatTimer);
        clearTimeout(this.failureDetectorTimer);

        if (this.isSelfLeader()) {
            this.startHeartbeat();
        } else {
            this.startFailureDetector();
        }
    }

    private startHeartbeat(): void {
        console.log(`[${this.selfName}] Leader: Démarrage de l'envoi des heartbeats.`);
        this.heartbeatTimer = setInterval(() => {
            this.messageBus.broadcastSystemMessage('HEARTBEAT', { epochId: this.currentEpoch });
        }, OrionGuardian.HEARTBEAT_INTERVAL);
    }

    private startFailureDetector(): void {
        console.log(`[${this.selfName}] Follower: Démarrage du détecteur de panne pour le leader ${this.currentLeader}.`);
        this.failureDetectorTimer = setTimeout(() => {
            console.log(`[${this.selfName}] Le leader ${this.currentLeader} est silencieux ! Déclenchement d'une nouvelle élection.`);
            this.currentLeader = null;
            this.leaderElection.startElection();
        }, OrionGuardian.FAILURE_THRESHOLD);
    }

    private resetFailureDetector(): void {
        clearTimeout(this.failureDetectorTimer);
        this.startFailureDetector();
    }

    public isSelfLeader(): boolean {
        return this.selfName === this.currentLeader;
    }

    public start(): void {
        setTimeout(() => this.leaderElection.startElection(), 1000 + Math.random() * 1000);
    }

    public dispose(): void {
        clearInterval(this.heartbeatTimer);
        clearTimeout(this.failureDetectorTimer);
        this.workerRegistry.dispose();
    }

    public getStatus() {
        return {
            isLeader: this.isSelfLeader(),
            leader: this.currentLeader,
            epoch: this.currentEpoch,
            activeWorkers: this.workerRegistry.getActiveWorkers(),
        };
    }
}
