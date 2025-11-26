import { WorkerName, KenshoMessage } from '../communication/types';
import { MessageBus } from '../communication/MessageBus';
import { WorkerRegistry } from './WorkerRegistry';
import { LeaderElection } from './LeaderElection';
import { createLogger } from '../../lib/logger';

const log = createLogger('OrionGuardian');

export class OrionGuardian {
    private readonly selfName: WorkerName;
    private readonly messageBus: MessageBus;
    public readonly workerRegistry: WorkerRegistry;
    private readonly leaderElection: LeaderElection;

    private currentLeader: WorkerName | null = null;
    private currentEpoch = 0;
    private heartbeatTimer: any = null;
    private failureDetectorTimer: any = null;

    private static readonly HEARTBEAT_INTERVAL = 2000;
    private static readonly FAILURE_THRESHOLD = 6000;

    constructor(selfName: WorkerName, messageBus: MessageBus) {
        this.selfName = selfName;
        this.messageBus = messageBus;
        this.workerRegistry = new WorkerRegistry(selfName);
        this.leaderElection = new LeaderElection(selfName, messageBus, this.workerRegistry);

        this.messageBus.subscribeToSystemMessages(this.handleSystemMessage.bind(this));
    }

    private handleSystemMessage(message: KenshoMessage): void {
        this.messageBus.notifyWorkerOnline(message.sourceWorker);
        this.workerRegistry.update(message.sourceWorker);

        const payload = message.payload as any;
        if (payload && payload.systemType) {
            switch (payload.systemType) {
                case 'ELECTION':
                    this.leaderElection.handleElectionMessage(payload.candidateId);
                    break;
                case 'ALIVE':
                    this.leaderElection.handleAliveMessage();
                    break;
                case 'NEW_LEADER':
                    this.handleNewLeader(payload.leaderId);
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
    }

    private handleNewLeader(leaderId: WorkerName): void {
        if (leaderId === this.currentLeader) return;

        log.info(`Nouveau leader reconnu: ${leaderId}`);
        this.currentLeader = leaderId;
        this.currentEpoch++;

        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer as any);
        if (this.failureDetectorTimer) clearTimeout(this.failureDetectorTimer as any);

        if (this.isSelfLeader()) {
            this.startHeartbeat();
        } else {
            this.startFailureDetector();
        }
    }

    private startHeartbeat(): void {
        log.info(`Leader: Démarrage de l'envoi des heartbeats.`);
        this.heartbeatTimer = setInterval(() => {
            this.messageBus.broadcastSystemMessage('HEARTBEAT', { epochId: this.currentEpoch });
        }, OrionGuardian.HEARTBEAT_INTERVAL);
    }

    private startFailureDetector(): void {
        log.info(`Follower: Démarrage du détecteur de panne pour le leader ${this.currentLeader}.`);
        this.failureDetectorTimer = setTimeout(() => {
            log.info(`Le leader ${this.currentLeader} est silencieux ! Déclenchement d'une nouvelle élection.`);
            this.currentLeader = null;
            this.leaderElection.startElection();
        }, OrionGuardian.FAILURE_THRESHOLD);
    }

    private resetFailureDetector(): void {
        if (this.failureDetectorTimer) clearTimeout(this.failureDetectorTimer as any);
        this.startFailureDetector();
    }

    public isSelfLeader(): boolean {
        return this.selfName === this.currentLeader;
    }

    public start(): void {
        this.leaderElection.startElection();
    }

    public stop(): void {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer as any);
        if (this.failureDetectorTimer) clearTimeout(this.failureDetectorTimer as any);
    }
}
