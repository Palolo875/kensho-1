import { WorkerName } from '../communication/types';
import { MessageBus } from '../communication/MessageBus';
import { WorkerRegistry } from './WorkerRegistry';
import { createLogger } from '../../lib/logger';

const log = createLogger('LeaderElection');

export class LeaderElection {
    private readonly selfName: WorkerName;
    private readonly messageBus: MessageBus;
    private readonly workerRegistry: WorkerRegistry;

    private isElectionRunning = false;
    private receivedAliveInCurrentRound = false;
    private electionTimeout: any;

    private static readonly ELECTION_TIMEOUT = 1000;

    constructor(selfName: WorkerName, messageBus: MessageBus, workerRegistry: WorkerRegistry) {
        this.selfName = selfName;
        this.messageBus = messageBus;
        this.workerRegistry = workerRegistry;
    }

    public startElection(): void {
        if (this.isElectionRunning) {
            return;
        }
        log.info(`Déclenchement d'une élection.`);
        this.isElectionRunning = true;
        this.receivedAliveInCurrentRound = false;

        const higherWorkers = this.workerRegistry.getActiveWorkers()
            .filter(name => name > this.selfName);

        if (higherWorkers.length === 0) {
            this.becomeLeader();
            return;
        }

        higherWorkers.forEach(workerName => {
            this.messageBus.sendSystemMessage(workerName, 'ELECTION', { candidateId: this.selfName });
        });

        this.electionTimeout = setTimeout(() => {
            if (!this.receivedAliveInCurrentRound) {
                this.becomeLeader();
            } else {
                this.isElectionRunning = false;
            }
        }, LeaderElection.ELECTION_TIMEOUT);
    }

    public handleElectionMessage(candidateId: WorkerName): void {
        if (this.selfName > candidateId) {
            this.messageBus.sendSystemMessage(candidateId, 'ALIVE', { responderId: this.selfName });
            this.startElection();
        }
    }

    public handleAliveMessage(): void {
        this.receivedAliveInCurrentRound = true;
        clearTimeout(this.electionTimeout);
        this.isElectionRunning = false;
        log.info(`Élection annulée, un worker de plus haut rang est actif.`);
    }

    private becomeLeader(): void {
        if (this.isElectionRunning) {
            log.info(`Élection gagnée. Je deviens le nouveau Leader !`);
            this.isElectionRunning = false;

            this.messageBus.sendSystemMessage(this.selfName, 'I_AM_THE_NEW_LEADER', {});
        }
    }
}
