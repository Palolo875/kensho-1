// src/core/agent-system/AgentRuntime.ts
import { MessageBus } from '../communication/MessageBus';
import { WorkerName, RequestHandler } from '../communication/types';
import { OrionGuardian } from '../guardian/OrionGuardian';
import { NetworkTransport } from '../communication/transport/NetworkTransport';

/**
 * AgentRuntime est l'environnement d'exécution pour chaque agent.
 * Il fournit une API de haut niveau pour la communication et la gestion des méthodes,
 * cachant la complexité du MessageBus sous-jacent.
 */
export class AgentRuntime {
    public readonly agentName: WorkerName;
    private readonly messageBus: MessageBus;
    private methods = new Map<string, RequestHandler>();
    private readonly guardian: OrionGuardian;
    private logBuffer: any[] = [];
    private flushLogsInterval: any;

    constructor(name: WorkerName, transport?: NetworkTransport) {
        this.agentName = name;
        this.messageBus = new MessageBus(name, { transport });
        this.guardian = new OrionGuardian(name, this.messageBus);

        this.messageBus.setRequestHandler(this.handleRequest.bind(this));

        // Annoncer son existence (déplacé dans le Guardian)
        this.guardian.start();

        // Enregistrer les méthodes de test/débogage
        this.registerMethod('getGuardianStatus', () => this.getGuardianStatus());
        this.registerMethod('getActiveWorkers', () => this.getActiveWorkers());

        // Démarrer le flush périodique des logs
        this.flushLogsInterval = setInterval(() => this.flushLogs(), 500);

        // Ajouter un logger interne pour le runtime lui-même
        this.log('info', `Agent ${name} initialisé.`);
    }

    // NOUVEAU : Méthode de logging avec buffer
    public log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
        this.logBuffer.push({
            timestamp: Date.now(),
            agent: this.agentName,
            level,
            message,
            data,
        });

        if (this.logBuffer.length >= 10) {
            this.flushLogs();
        }
    }

    private flushLogs(): void {
        if (this.logBuffer.length === 0) return;

        // Utiliser callAgent pour envoyer le lot au TelemetryWorker.
        // C'est un appel "fire-and-forget", donc on n'attend pas la réponse.
        // Note: On utilise une méthode interne pour éviter la dépendance circulaire ou l'échec si TelemetryWorker n'est pas là
        this.messageBus.request('TelemetryWorker', { method: 'logBatch', args: [this.logBuffer] }, 1000).catch(() => {
            // Ignorer les erreurs si le TelemetryWorker n'est pas là (ex: tests unitaires)
        });
        this.logBuffer = [];
    }

    private async handleRequest(payload: { method: string, args: any[] }): Promise<any> {
        const handler = this.methods.get(payload.method);
        if (handler) {
            // Appeler la méthode enregistrée avec les arguments fournis
            return await handler(payload.args);
        }
        throw new Error(`Method '${payload.method}' not found on agent '${this.agentName}'`);
    }

    public registerMethod(name: string, handler: RequestHandler): void {
        if (this.methods.has(name)) {
            console.warn(`[AgentRuntime] Method '${name}' on agent '${this.agentName}' is already registered and will be overwritten.`);
        }
        this.methods.set(name, handler);
    }

    // API explicite pour appeler d'autres agents (Version Sprint 1A)
    public async callAgent<TResponse>(
        targetAgent: WorkerName,
        method: string,
        args: any[],
        timeout?: number
    ): Promise<TResponse> {
        return this.messageBus.request<TResponse>(
            targetAgent,
            { method, args },
            timeout
        );
    }

    public setCurrentTraceId(traceId: string | null): void {
        this.messageBus.setCurrentTraceId(traceId);
    }

    // Exposer les méthodes du Guardian pour les tests
    public getGuardianStatus() {
        return this.guardian.getStatus();
    }

    public getActiveWorkers(): WorkerName[] {
        return this.guardian.workerRegistry.getActiveWorkers();
    }

    public dispose(): void {
        this.flushLogs(); // S'assurer que tous les logs sont envoyés avant de mourir
        clearInterval(this.flushLogsInterval);
        this.messageBus.dispose();
        this.guardian.dispose();
    }
}
