// src/core/agent-system/AgentRuntime.ts
import { MessageBus } from '../communication/MessageBus';
import { WorkerName, RequestHandler } from '../communication/types';
import { OrionGuardian } from '../guardian/OrionGuardian'; // Importer le Guardian

/**
 * AgentRuntime est l'environnement d'exécution pour chaque agent.
 * Il fournit une API de haut niveau pour la communication et la gestion des méthodes,
 * cachant la complexité du MessageBus sous-jacent.
 */
export class AgentRuntime {
    public readonly agentName: WorkerName;
    private readonly messageBus: MessageBus;
    private methods = new Map<string, RequestHandler>();
    private readonly guardian: OrionGuardian; // Ajouter une instance du Guardian

    constructor(name: WorkerName) {
        this.agentName = name;
        this.messageBus = new MessageBus(name);
        this.guardian = new OrionGuardian(name, this.messageBus); // Initialiser le Guardian

        this.messageBus.setRequestHandler(this.handleRequest.bind(this));

        // Annoncer son existence (déplacé dans le Guardian)
        this.guardian.start();

        // Enregistrer la méthode de statut pour le débogage/test
        this.registerMethod('getGuardianStatus', () => this.getGuardianStatus());
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

    // Exposer les méthodes du Guardian pour les tests
    public getGuardianStatus() {
        return this.guardian.getStatus();
    }

    public dispose(): void {
        this.messageBus.dispose();
        // this.guardian.dispose(); // TODO: Add dispose to guardian
    }
}
