// src/core/guardian/LeaderElection.ts
import { WorkerName } from '../communication/types';
import { MessageBus } from '../communication/MessageBus';
import { WorkerRegistry } from './WorkerRegistry';

/**
 * Gère le processus d'élection de leader pour un agent.
 * Implémente un algorithme "Lazy Bully" avec gestion d'epoch.
 */
export class LeaderElection {
    private readonly selfName: WorkerName;
    private readonly messageBus: MessageBus;
    private readonly workerRegistry: WorkerRegistry;

    private isElectionRunning = false;
    private receivedAliveInCurrentRound = false;
    private electionTimeout: any;

    // Délai avant de se considérer comme leader si personne ne répond.
    private static readonly ELECTION_TIMEOUT = 1000; // 1 seconde

    constructor(selfName: WorkerName, messageBus: MessageBus, workerRegistry: WorkerRegistry) {
        this.selfName = selfName;
        this.messageBus = messageBus;
        this.workerRegistry = workerRegistry;
    }

    /**
     * Déclenche une nouvelle élection.
     */
    public startElection(): void {
        if (this.isElectionRunning) {
            return; // Une élection est déjà en cours.
        }
        console.log(`[${this.selfName}] Déclenchement d'une élection.`);
        this.isElectionRunning = true;
        this.receivedAliveInCurrentRound = false;

        const higherWorkers = this.workerRegistry.getActiveWorkers()
            .filter(name => name > this.selfName);

        // Si je suis le worker avec l'ID le plus élevé, je deviens leader immédiatement.
        if (higherWorkers.length === 0) {
            this.becomeLeader();
            return;
        }

        // Envoyer un message ELECTION uniquement aux workers de plus haut rang.
        higherWorkers.forEach(workerName => {
            this.messageBus.sendSystemMessage(workerName, 'ELECTION', { candidateId: this.selfName });
        });

        // Démarrer un timer. Si aucun worker de plus haut rang ne répond "ALIVE" à temps, je deviens leader.
        this.electionTimeout = setTimeout(() => {
            if (!this.receivedAliveInCurrentRound) {
                this.becomeLeader();
            } else {
                // Un autre worker a pris la main, l'élection est terminée pour moi.
                this.isElectionRunning = false;
            }
        }, LeaderElection.ELECTION_TIMEOUT);
    }

    /**
     * Gère la réception d'un message ELECTION d'un worker de plus bas rang.
     */
    public handleElectionMessage(candidateId: WorkerName): void {
        // Si le message vient d'un worker avec un ID plus bas, je lui réponds "ALIVE"
        // pour lui dire d'arrêter son élection, et je démarre la mienne.
        if (this.selfName > candidateId) {
            this.messageBus.sendSystemMessage(candidateId, 'ALIVE', { responderId: this.selfName });
            this.startElection();
        }
    }

    /**
     * Gère la réception d'un message ALIVE d'un worker de plus haut rang.
     */
    public handleAliveMessage(): void {
        // Si je reçois un ALIVE, cela signifie qu'un worker de plus haut rang est actif
        // et va prendre en charge l'élection. J'arrête mon propre processus.
        this.receivedAliveInCurrentRound = true;
        clearTimeout(this.electionTimeout);
        this.isElectionRunning = false;
        console.log(`[${this.selfName}] Élection annulée, un worker de plus haut rang est actif.`);
    }

    /**
     * Se déclare leader et l'annonce à toute la constellation.
     */
    private becomeLeader(): void {
        if (this.isElectionRunning) {
            console.log(`[${this.selfName}] Élection gagnée. Je deviens le nouveau Leader !`);
            this.isElectionRunning = false;

            // On ne diffuse plus directement, on notifie le Guardian qui gère l'état.
            this.messageBus.sendSystemMessage(this.selfName, 'I_AM_THE_NEW_LEADER', {});
        }
    }
}
