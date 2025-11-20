// src/core/agent-system/AgentRuntime.ts
import { MessageBus, StreamCallbacks } from '../communication/MessageBus';
import { WorkerName, RequestHandler } from '../communication/types';
import { OrionGuardian } from '../guardian/OrionGuardian';
import { NetworkTransport } from '../communication/transport/NetworkTransport';
import { StorageAdapter, STORES } from '../storage/types';

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
    private streamRequestHandlers = new Map<string, (payload: unknown, stream: AgentStreamEmitter<unknown>) => void>();
    private activeStreamEmitters = new Map<string, AgentStreamEmitter<unknown>>();
    private readonly guardian: OrionGuardian;
    private logBuffer: LogEntry[] = [];
    private flushLogsInterval: NodeJS.Timeout;
    private readonly storage?: StorageAdapter;

    constructor(name: WorkerName, transport?: NetworkTransport, storage?: StorageAdapter) {
        this.agentName = name;
        this.storage = storage;
        this.messageBus = new MessageBus(name, { transport, storage });
        this.guardian = new OrionGuardian(name, this.messageBus);

        this.messageBus.setRequestHandler(this.handleRequest.bind(this));

        // Écouter les messages de cancel de stream
        this.messageBus.subscribeToSystemMessages((msg) => {
            if (msg.type === 'stream_cancel' && msg.streamId) {
                this.handleStreamCancellation(msg.streamId, msg.payload as string || 'Stream cancelled by remote');
            }
        });

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
            const error = new Error('Invalid payload: must be an object');
            (error as any).code = 'INVALID_PAYLOAD';
            throw error;
        }

        const request = payload as { method: string, args: unknown[], streamId?: string };

        // Validation de la méthode
        if (!request.method || typeof request.method !== 'string') {
            const error = new Error('Invalid payload: missing or invalid method');
            (error as any).code = 'INVALID_METHOD';
            throw error;
        }

        // Si c'est une requête de stream, on la route vers le bon handler de stream
        if (request.streamId) {
            // Validation supplémentaire pour les streams
            if (typeof request.streamId !== 'string' || request.streamId.length === 0) {
                const error = new Error('Invalid payload: streamId must be a non-empty string');
                (error as any).code = 'INVALID_STREAM_ID';
                throw error;
            }

            const streamHandler = this.streamRequestHandlers.get(request.method);
            if (!streamHandler) {
                const error = new Error(`Stream method '${request.method}' not found on agent '${this.agentName}'`);
                (error as any).code = 'METHOD_NOT_FOUND';
                throw error;
            }

            const streamEmitter = new AgentStreamEmitter(request.streamId, this.messageBus, this.agentName);
            
            // Tracker l'emitter actif pour pouvoir le cancel si nécessaire
            this.activeStreamEmitters.set(request.streamId, streamEmitter);
            
            // Nettoyer quand le stream se termine
            const cleanup = () => {
                this.activeStreamEmitters.delete(request.streamId!);
            };
            
            // Wrapper l'emitter pour nettoyer automatiquement
            const originalEnd = streamEmitter.end.bind(streamEmitter);
            const originalError = streamEmitter.error.bind(streamEmitter);
            const originalAbort = streamEmitter.abort.bind(streamEmitter);
            
            streamEmitter.end = (finalPayload?: unknown) => {
                originalEnd(finalPayload);
                cleanup();
            };
            
            streamEmitter.error = (error: Error) => {
                originalError(error);
                cleanup();
            };
            
            streamEmitter.abort = (reason?: string) => {
                originalAbort(reason);
                cleanup();
            };
            
            streamHandler(request, streamEmitter);
            return; // Les streams n'ont pas de réponse de requête directe
        }

        // Handler pour requête standard
        const handler = this.methods.get(request.method);
        if (!handler) {
            const error = new Error(`Method '${request.method}' not found on agent '${this.agentName}'`);
            (error as any).code = 'METHOD_NOT_FOUND';
            throw error;
        }

        // Appeler la méthode enregistrée avec les arguments fournis
        return await handler(request.args);
    }

    /**
     * Enregistre une méthode qui peut émettre des données en streaming.
     * @param name - Nom de la méthode
     * @param handler - Fonction qui traite la requête et utilise le stream emitter
     * 
     * Note: Les erreurs non catchées dans les handlers async seront automatiquement
     * envoyées au stream via emitter.error(), mais le handler doit appeler
     * emitter.end() ou emitter.error() explicitement pour terminer le stream.
     */
    public registerStreamMethod<TChunk = unknown>(
        name: string,
        handler: (payload: unknown, stream: AgentStreamEmitter<TChunk>) => void | Promise<void>
    ): void {
        if (this.streamRequestHandlers.has(name)) {
            console.warn(`[AgentRuntime] Stream method '${name}' on agent '${this.agentName}' is already registered and will be overwritten.`);
        }
        // Wrapper pour gérer async/sync handlers
        this.streamRequestHandlers.set(name, (payload, emitter) => {
            try {
                const result = handler(payload, emitter as AgentStreamEmitter<TChunk>);
                if (result && typeof (result as any).catch === 'function') {
                    // C'est une Promise, gérer les erreurs
                    (result as Promise<void>).catch((error) => {
                        // Si le stream est toujours actif, envoyer l'erreur et terminer
                        if (emitter.active) {
                            console.error(`[AgentRuntime] Uncaught error in async stream handler '${name}':`, error);
                            emitter.error(error);
                        }
                    });
                }
            } catch (error) {
                // Erreur synchrone - envoyer immédiatement
                if (emitter.active) {
                    console.error(`[AgentRuntime] Error in stream handler '${name}':`, error);
                    emitter.error(error as Error);
                }
            }
        });
    }

    /**
     * Appelle une méthode de stream sur un autre agent.
     * @returns L'ID du stream créé
     */
    public callAgentStream<TChunk = unknown>(
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

    /**
     * Annule un stream actif (côté consommateur).
     * Ceci arrête la réception de nouveaux chunks et appelle le callback onError.
     * 
     * @param streamId - L'ID du stream à annuler
     * @param reason - Raison optionnelle de l'annulation
     * @returns true si le stream a été annulé, false s'il n'existait pas
     */
    public cancelStream(streamId: string, reason?: string): boolean {
        return this.messageBus.cancelStream(streamId, reason);
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

    /**
     * Sauvegarde une valeur dans le stockage persistant de l'agent.
     * La clé est préfixée par le nom de l'agent pour éviter les collisions.
     */
    public async saveState(key: string, value: unknown): Promise<void> {
        if (!this.storage) {
            console.warn(`[AgentRuntime] Cannot save state: no storage adapter configured for agent '${this.agentName}'`);
            return;
        }
        // Utiliser une clé composite : agentName:key
        const compositeKey = `${this.agentName}:${key}`;
        await this.storage.set(STORES.AGENT_STATE, compositeKey, value);
    }

    /**
     * Charge une valeur depuis le stockage persistant de l'agent.
     */
    public async loadState<T>(key: string): Promise<T | undefined> {
        if (!this.storage) {
            return undefined;
        }
        const compositeKey = `${this.agentName}:${key}`;
        return await this.storage.get<T>(STORES.AGENT_STATE, compositeKey);
    }

    // Exposer les méthodes du Guardian pour les tests
    public getGuardianStatus() {
        return this.guardian.getStatus();
    }

    public getActiveWorkers(): WorkerName[] {
        return this.guardian.workerRegistry.getActiveWorkers();
    }

    /**
     * Gère l'annulation d'un stream par le côté distant.
     */
    private handleStreamCancellation(streamId: string, reason: string): void {
        const emitter = this.activeStreamEmitters.get(streamId);
        if (emitter && emitter.active) {
            console.log(`[AgentRuntime] Stream ${streamId} cancelled by remote: ${reason}`);
            // Marquer l'emitter comme inactif pour empêcher d'autres émissions
            (emitter as any).isActive = false;
            this.activeStreamEmitters.delete(streamId);
        }
    }

    public dispose(): void {
        this.flushLogs(); // S'assurer que tous les logs sont envoyés avant de mourir
        clearInterval(this.flushLogsInterval);
        
        // Abortir tous les streams actifs
        this.activeStreamEmitters.forEach((emitter, streamId) => {
            if (emitter.active) {
                emitter.abort('Agent disposing');
            }
        });
        this.activeStreamEmitters.clear();
        
        this.messageBus.dispose();
        this.guardian.dispose();
    }
}

/**
 * NOUVELLE CLASSE HELPER
 * Fournit une API simple pour un agent pour émettre des données sur un stream.
 * 
 * @example
 * // Dans un stream handler
 * registerStreamMethod('generateText', (payload, emitter) => {
 *   try {
 *     for (const chunk of generateTokens()) {
 *       emitter.chunk(chunk);
 *     }
 *     emitter.end({ tokensGenerated: 100 });
 *   } catch (error) {
 *     emitter.error(error);
 *   }
 * });
 */
export class AgentStreamEmitter<TChunk = unknown> {
    private isActive = true;
    private chunkCount = 0;

    constructor(
        private readonly streamId: string,
        private readonly messageBus: MessageBus,
        private readonly selfName: WorkerName
    ) { }

    /**
     * Envoie un chunk de données au stream.
     * @throws Error si le stream a été terminé ou annulé
     */
    public chunk(data: TChunk): void {
        if (!this.isActive) {
            throw new Error(`Cannot send chunk: stream ${this.streamId} is no longer active`);
        }
        this.chunkCount++;
        this.messageBus.sendStreamChunk(this.streamId, data, this.selfName);
    }

    /**
     * Termine le stream avec un payload final optionnel.
     */
    public end(finalPayload?: unknown): void {
        if (!this.isActive) {
            console.warn(`Stream ${this.streamId} already ended or aborted`);
            return;
        }
        this.isActive = false;
        this.messageBus.sendStreamEnd(this.streamId, finalPayload, this.selfName);
    }

    /**
     * Signale une erreur et termine le stream.
     */
    public error(error: Error): void {
        if (!this.isActive) {
            console.warn(`Stream ${this.streamId} already ended or aborted`);
            return;
        }
        this.isActive = false;
        this.messageBus.sendStreamError(this.streamId, error, this.selfName);
    }

    /**
     * Annule le stream immédiatement.
     * Envoie une erreur STREAM_ABORTED au consommateur et termine le stream localement.
     * 
     * Note: Ceci termine le stream du côté producteur. Le consommateur recevra
     * un message stream_error avec le code STREAM_ABORTED.
     */
    public abort(reason?: string): void {
        if (!this.isActive) {
            console.warn(`Stream ${this.streamId} already ended or aborted`);
            return;
        }
        this.isActive = false;
        const error = new Error(reason || 'Stream aborted by producer');
        (error as any).code = 'STREAM_ABORTED';
        this.messageBus.sendStreamError(this.streamId, error, this.selfName);
    }

    /**
     * Retourne si le stream est toujours actif.
     */
    public get active(): boolean {
        return this.isActive;
    }

    /**
     * Retourne le nombre de chunks envoyés.
     */
    public get chunksEmitted(): number {
        return this.chunkCount;
    }

    /**
     * Retourne l'ID du stream.
     */
    public get id(): string {
        return this.streamId;
    }
}
