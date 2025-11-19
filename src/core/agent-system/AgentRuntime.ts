// src/core/agent-system/AgentRuntime.ts
import { MessageBus, StreamCallbacks } from '../communication/MessageBus';
import { WorkerName, RequestHandler } from '../communication/types';
import { OrionGuardian } from '../guardian/OrionGuardian';
import { NetworkTransport } from '../communication/transport/NetworkTransport';

interface LogEntry {
    timestamp: number;
    agent: WorkerName;
    level: 'info' | 'warn' | 'error';
    message: string;
    data?: unknown;
}

/**
 * AgentRuntime est l'environnement d'exécution pour chaque agent.
 * Il fournit une API de haut niveau pour la communication et la gestion des méthodes,
 * cachant la complexité du MessageBus sous-jacent.
 */
export class AgentRuntime {
    public readonly agentName: WorkerName;
    private readonly messageBus: MessageBus;
    private methods = new Map<string, RequestHandler>();
    private streamRequestHandlers = new Map<string, (payload: unknown, stream: AgentStreamEmitter) => void>();
    private readonly guardian: OrionGuardian;
    private logBuffer: LogEntry[] = [];
    private flushLogsInterval: NodeJS.Timeout;

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

    // Méthode de logging avec buffer
    public log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
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
        this.messageBus.request('TelemetryWorker', { method: 'logBatch', args: [this.logBuffer] }, 1000).catch(() => {
            // Ignorer les erreurs si le TelemetryWorker n'est pas là (ex: tests unitaires)
        });
        this.logBuffer = [];
    }

    private async handleRequest(payload: unknown): Promise<unknown> {
        // Validation basique du payload
        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid payload: must be an object');
        }

        const request = payload as { method: string, args: unknown[], streamId?: string };

        if (!request.method) {
            throw new Error('Invalid payload: missing method');
        }

        // Si c'est une requête de stream, on la route vers le bon handler de stream
        if (request.streamId) {
            const streamHandler = this.streamRequestHandlers.get(request.method);
            if (streamHandler) {
                const streamEmitter = new AgentStreamEmitter(request.streamId, this.messageBus, this.agentName);
                streamHandler(request, streamEmitter);
                return; // Les streams n'ont pas de réponse de requête directe
            }
            throw new Error(`Stream method '${request.method}' not found on agent '${this.agentName}'`);
        }

        const handler = this.methods.get(request.method);
        if (handler) {
            // Appeler la méthode enregistrée avec les arguments fournis
            // Note: on passe args tel quel, le handler doit savoir quoi en faire
            return await handler(request.args);
        }
        throw new Error(`Method '${request.method}' not found on agent '${this.agentName}'`);
    }

    public registerStreamMethod(name: string, handler: (payload: unknown, stream: AgentStreamEmitter) => void): void {
        if (this.streamRequestHandlers.has(name)) {
            console.warn(`[AgentRuntime] Stream method '${name}' on agent '${this.agentName}' is already registered and will be overwritten.`);
        }
        this.streamRequestHandlers.set(name, handler);
    }

    // API pour appeler un stream sur un autre agent
    public callAgentStream<TChunk>(
        targetAgent: WorkerName,
        method: string,
        args: unknown[],
        callbacks: StreamCallbacks<TChunk>
    ): string {
        return this.messageBus.requestStream(
            targetAgent,
            { method, args },
            callbacks
        );
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
        args: unknown[],
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

/**
 * NOUVELLE CLASSE HELPER
 * Fournit une API simple pour un agent pour émettre des données sur un stream.
 */
export class AgentStreamEmitter {
    constructor(
        private readonly streamId: string,
        private readonly messageBus: MessageBus,
        private readonly selfName: WorkerName
    ) { }

    public chunk(data: unknown): void {
        this.messageBus.sendStreamChunk(this.streamId, data, this.selfName);
    }

    public end(finalPayload?: unknown): void {
        this.messageBus.sendStreamEnd(this.streamId, finalPayload, this.selfName);
    }

    public error(error: Error): void {
        this.messageBus.sendStreamError(this.streamId, error, this.selfName);
    }
}
