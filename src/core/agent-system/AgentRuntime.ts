// src/core/agent-system/AgentRuntime.ts
import { MessageBus, StreamCallbacks } from '../communication/MessageBus';
import { WorkerName, RequestHandler } from '../communication/types';
import { OrionGuardian } from '../guardian/OrionGuardian';
import { NetworkTransport } from '../communication/transport/NetworkTransport';
import { StorageAdapter, STORES } from '../storage/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('AgentRuntime');

interface LogEntry {
    timestamp: number;
    agent: WorkerName;
    level: 'info' | 'warn' | 'error';
    message: string;
    data?: unknown;
}

interface RequestPayload {
    method: string;
    args: unknown[];
    streamId?: string;
}

interface ErrorWithCode extends Error {
    code?: string;
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
    private flushLogsInterval: ReturnType<typeof setInterval>;
    private readonly storage?: StorageAdapter;

    constructor(name: WorkerName, transport?: NetworkTransport, storage?: StorageAdapter) {
        this.agentName = name;
        this.storage = storage;
        this.messageBus = new MessageBus(name, { transport, storage });
        this.guardian = new OrionGuardian(name, this.messageBus);

        this.messageBus.setRequestHandler(this.handleRequest.bind(this));

        this.messageBus.subscribeToSystemMessages((msg) => {
            if (msg.type === 'stream_cancel' && msg.streamId) {
                this.handleStreamCancellation(msg.streamId, (msg.payload as string) || 'Stream cancelled by remote');
            }
        });

        this.guardian.start();

        this.registerMethod('getGuardianStatus', () => this.getGuardianStatus());
        this.registerMethod('getActiveWorkers', () => this.getActiveWorkers());

        this.flushLogsInterval = setInterval(() => this.flushLogs(), 500);

        log.info(`Agent ${name} initialisé.`);
    }

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

        this.messageBus.request('TelemetryWorker', { method: 'logBatch', args: [this.logBuffer] }, 1000).catch(() => {
            // TelemetryWorker may not be available (e.g., in unit tests)
        });
        this.logBuffer = [];
    }

    private async handleRequest(payload: unknown): Promise<unknown> {
        if (!payload || typeof payload !== 'object') {
            const error = new Error('Invalid payload: must be an object') as ErrorWithCode;
            error.code = 'INVALID_PAYLOAD';
            throw error;
        }

        const request = payload as RequestPayload;

        if (!request.method || typeof request.method !== 'string') {
            const error = new Error('Invalid payload: missing or invalid method') as ErrorWithCode;
            error.code = 'INVALID_METHOD';
            throw error;
        }

        if (request.streamId) {
            if (typeof request.streamId !== 'string' || request.streamId.length === 0) {
                const error = new Error('Invalid payload: streamId must be a non-empty string') as ErrorWithCode;
                error.code = 'INVALID_STREAM_ID';
                throw error;
            }

            const streamHandler = this.streamRequestHandlers.get(request.method);
            if (!streamHandler) {
                const error = new Error(`Stream method '${request.method}' not found on agent '${this.agentName}'`) as ErrorWithCode;
                error.code = 'METHOD_NOT_FOUND';
                throw error;
            }

            const streamEmitter = new AgentStreamEmitter(request.streamId, this.messageBus, this.agentName);
            
            this.activeStreamEmitters.set(request.streamId, streamEmitter);
            
            const cleanup = (): void => {
                this.activeStreamEmitters.delete(request.streamId!);
            };
            
            const originalEnd = streamEmitter.end.bind(streamEmitter);
            const originalError = streamEmitter.error.bind(streamEmitter);
            const originalAbort = streamEmitter.abort.bind(streamEmitter);
            
            streamEmitter.end = (finalPayload?: unknown): void => {
                originalEnd(finalPayload);
                cleanup();
            };
            
            streamEmitter.error = (err: Error): void => {
                originalError(err);
                cleanup();
            };
            
            streamEmitter.abort = (reason?: string): void => {
                originalAbort(reason);
                cleanup();
            };
            
            streamHandler(request, streamEmitter);
            return;
        }

        const handler = this.methods.get(request.method);
        if (!handler) {
            const error = new Error(`Method '${request.method}' not found on agent '${this.agentName}'`) as ErrorWithCode;
            error.code = 'METHOD_NOT_FOUND';
            throw error;
        }

        return await handler(request.args);
    }

    public registerStreamMethod<TChunk = unknown>(
        name: string,
        handler: (payload: unknown, stream: AgentStreamEmitter<TChunk>) => void | Promise<void>
    ): void {
        if (this.streamRequestHandlers.has(name)) {
            log.warn(`Stream method '${name}' on agent '${this.agentName}' is already registered and will be overwritten.`);
        }
        this.streamRequestHandlers.set(name, (payload, emitter) => {
            try {
                const result = handler(payload, emitter as AgentStreamEmitter<TChunk>);
                if (result && typeof result === 'object' && 'catch' in result && typeof (result as Promise<void>).catch === 'function') {
                    (result as Promise<void>).catch((err: unknown) => {
                        if (emitter.active) {
                            log.error(`Uncaught error in async stream handler '${name}'`, err as Error);
                            emitter.error(err as Error);
                        }
                    });
                }
            } catch (err: unknown) {
                if (emitter.active) {
                    log.error(`Error in stream handler '${name}'`, err as Error);
                    emitter.error(err as Error);
                }
            }
        });
    }

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

    public cancelStream(streamId: string, reason?: string): boolean {
        return this.messageBus.cancelStream(streamId, reason);
    }

    public registerMethod(name: string, handler: RequestHandler): void {
        if (this.methods.has(name)) {
            log.warn(`Method '${name}' on agent '${this.agentName}' is already registered and will be overwritten.`);
        }
        this.methods.set(name, handler);
    }

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

    public async saveState(key: string, value: unknown): Promise<void> {
        if (!this.storage) {
            log.warn(`Cannot save state: no storage adapter configured for agent '${this.agentName}'`);
            return;
        }
        const compositeKey = `${this.agentName}:${key}`;
        await this.storage.set(STORES.AGENT_STATE, compositeKey, value);
    }

    public async loadState<T>(key: string): Promise<T | undefined> {
        if (!this.storage) {
            return undefined;
        }
        const compositeKey = `${this.agentName}:${key}`;
        return await this.storage.get<T>(STORES.AGENT_STATE, compositeKey);
    }

    public getGuardianStatus(): ReturnType<OrionGuardian['getStatus']> {
        return this.guardian.getStatus();
    }

    public getActiveWorkers(): WorkerName[] {
        return this.guardian.workerRegistry.getActiveWorkers();
    }

    private handleStreamCancellation(streamId: string, reason: string): void {
        const emitter = this.activeStreamEmitters.get(streamId);
        if (emitter && emitter.active) {
            log.debug(`Stream ${streamId} cancelled by remote: ${reason}`);
            emitter.markInactive();
            this.activeStreamEmitters.delete(streamId);
        }
    }

    public dispose(): void {
        this.flushLogs();
        clearInterval(this.flushLogsInterval);
        
        this.activeStreamEmitters.forEach((emitter) => {
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
 * Fournit une API simple pour un agent pour émettre des données sur un stream.
 */
export class AgentStreamEmitter<TChunk = unknown> {
    private isActive = true;
    private chunkCount = 0;

    constructor(
        private readonly streamId: string,
        private readonly messageBus: MessageBus,
        private readonly selfName: WorkerName
    ) { }

    public chunk(data: TChunk): void {
        if (!this.isActive) {
            throw new Error(`Cannot send chunk: stream ${this.streamId} is no longer active`);
        }
        this.chunkCount++;
        this.messageBus.sendStreamChunk(this.streamId, data, this.selfName);
    }

    public end(finalPayload?: unknown): void {
        if (!this.isActive) {
            log.warn(`Stream ${this.streamId} already ended or aborted`);
            return;
        }
        this.isActive = false;
        this.messageBus.sendStreamEnd(this.streamId, finalPayload, this.selfName);
    }

    public error(error: Error): void {
        if (!this.isActive) {
            log.warn(`Stream ${this.streamId} already ended or aborted`);
            return;
        }
        this.isActive = false;
        this.messageBus.sendStreamError(this.streamId, error, this.selfName);
    }

    public abort(reason?: string): void {
        if (!this.isActive) {
            log.warn(`Stream ${this.streamId} already ended or aborted`);
            return;
        }
        this.isActive = false;
        const error = new Error(reason || 'Stream aborted by producer') as ErrorWithCode;
        error.code = 'STREAM_ABORTED';
        this.messageBus.sendStreamError(this.streamId, error, this.selfName);
    }

    public get active(): boolean {
        return this.isActive;
    }

    public get chunksEmitted(): number {
        return this.chunkCount;
    }

    public get id(): string {
        return this.streamId;
    }

    public markInactive(): void {
        this.isActive = false;
    }
}
