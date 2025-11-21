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
        // Le simple fait de recevoir un message est une preuve de vie
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
                    // Si on reçoit un heartbeat, on réinitialise notre détecteur de panne.
                    if (message.sourceWorker === this.currentLeader) {
                        this.resetFailureDetector();
                    }
                    break;
                // NOUVEAU cas pour gérer la notification interne
                case 'I_AM_THE_NEW_LEADER':
                    if (message.sourceWorker === this.selfName) {
                        this.handleNewLeader(this.selfName);
                        // Annoncer le leadership à tous les autres
                        this.messageBus.broadcastSystemMessage('NEW_LEADER', { leaderId: this.selfName });
                    }
                    break;
            }
        }
    }

    private handleNewLeader(leaderId: WorkerName): void {
        if (leaderId === this.currentLeader) return; // Pas de changement

        console.log(`[${this.selfName}] Nouveau leader reconnu: ${leaderId}`);
        this.currentLeader = leaderId;
        this.currentEpoch++; // Chaque changement de leader incrémente l'epoch

        // Arrêter tous les timers précédents
        clearInterval(this.heartbeatTimer);
        clearTimeout(this.failureDetectorTimer);

        if (this.isSelfLeader()) {
            // Si JE suis le nouveau leader, je commence à envoyer mon pouls.
            this.startHeartbeat();
        } else {
            // Si je suis un follower, je commence à écouter le pouls du leader.
            this.startFailureDetector();
        }
    }

    /**
     * Démarre l'envoi périodique de heartbeats. Uniquement pour le leader.
     */
    private startHeartbeat(): void {
        console.log(`[${this.selfName}] Leader: Démarrage de l'envoi des heartbeats.`);
        this.heartbeatTimer = setInterval(() => {
            this.messageBus.broadcastSystemMessage('HEARTBEAT', { epochId: this.currentEpoch });
        }, OrionGuardian.HEARTBEAT_INTERVAL);
    }

    /**
     * Démarre le timer qui déclenchera une élection si le leader est silencieux.
     */
    private startFailureDetector(): void {
        console.log(`[${this.selfName}] Follower: Démarrage du détecteur de panne pour le leader ${this.currentLeader}.`);
        this.failureDetectorTimer = setTimeout(() => {
            console.log(`[${this.selfName}] Le leader ${this.currentLeader} est silencieux ! Déclenchement d'une nouvelle élection.`);
            this.currentLeader = null; // Le leader est considéré comme mort.
            this.leaderElection.startElection();
        }, OrionGuardian.FAILURE_THRESHOLD);
    }

    /**
     * Réinitialise le timer du détecteur de panne. Appelé à chaque heartbeat reçu.
     */
    private resetFailureDetector(): void {
        clearTimeout(this.failureDetectorTimer);
        this.startFailureDetector();
    }

    public isSelfLeader(): boolean {
        return this.selfName === this.currentLeader;
    }

    public start(): void {
        // Au démarrage, chaque agent tente de lancer une élection.
        // L'algorithme Bully s'assurera qu'un seul leader émerge.
        setTimeout(() => this.leaderElection.startElection(), 1000 + Math.random() * 1000);
    }

    // Méthodes pour les tests et l'Observatory
    public getStatus() {
        return {
            isLeader: this.isSelfLeader(),
            leader: this.currentLeader,
            epoch: this.currentEpoch,
            activeWorkers: this.workerRegistry.getActiveWorkers(),
        };
    }

    public dispose(): void {
        clearInterval(this.heartbeatTimer);
        clearTimeout(this.failureDetectorTimer);
        this.workerRegistry.dispose();
    }
}
