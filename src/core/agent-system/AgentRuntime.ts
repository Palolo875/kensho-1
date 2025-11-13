// src/core/agent-system/AgentRuntime.ts
import { MessageBus } from '../communication/MessageBus';
import { WorkerName, RequestHandler } from '../communication/types';

/**
 * AgentRuntime est l'environnement d'exécution pour chaque agent.
 * Il fournit une API de haut niveau pour la communication et la gestion des méthodes,
 * cachant la complexité du MessageBus sous-jacent.
 */
export class AgentRuntime {
    public readonly agentName: WorkerName;
    private readonly messageBus: MessageBus;
    private methods = new Map<string, RequestHandler>();

    constructor(name: WorkerName) {
        this.agentName = name;
        this.messageBus = new MessageBus(name);
        this.messageBus.setRequestHandler(this.handleRequest.bind(this));
    }

    private async handleRequest(payload: { method: string, args: any[] }): Promise<any> {
        const handler = this.methods.get(payload.method);
        if (handler) {
            // Appeler la méthode enregistrée avec les arguments fournis
            return await handler(...payload.args);
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

    public dispose(): void {
        this.messageBus.dispose();
    }
}
