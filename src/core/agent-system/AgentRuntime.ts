// src/core/agent-system/AgentRuntime.ts
import { MessageBus } from '../communication/MessageBus';
import { WorkerName, RequestHandler, KenshoMessage } from '../communication/types';
import { WorkerRegistry } from '../guardian/WorkerRegistry'; // Importer le registre

/**
 * AgentRuntime est l'environnement d'exécution pour chaque agent.
 * Il fournit une API de haut niveau pour la communication et la gestion des méthodes,
 * cachant la complexité du MessageBus sous-jacent.
 */
export class AgentRuntime {
    public readonly agentName: WorkerName;
    private readonly messageBus: MessageBus;
    private readonly workerRegistry: WorkerRegistry; // Ajouter une instance du registre
    private methods = new Map<string, RequestHandler>();

    constructor(name: WorkerName) {
        this.agentName = name;
        this.messageBus = new MessageBus(name);
        this.workerRegistry = new WorkerRegistry(name); // Initialiser le registre

        // Le runtime écoute les requêtes et les route vers la bonne méthode enregistrée
        this.messageBus.setRequestHandler(this.handleRequest.bind(this));

        // NOUVEAU : S'abonner aux messages système pour mettre à jour le registre
        this.messageBus.subscribeToSystemMessages(this.handleSystemMessage.bind(this));

        // Annoncer son existence au démarrage
        this.announceSelf();

        // NOUVEAU : Enregistrer une méthode interne pour le débogage
        this.registerMethod('getActiveWorkers', () => this.getActiveWorkers());
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

    // NOUVEAU : Annoncer son existence à la constellation
    private announceSelf(): void {
        this.messageBus.broadcastSystemMessage('WORKER_ANNOUNCE', { workerName: this.agentName });
    }

    // NOUVEAU : Gérer les messages système pour le registre
    private handleSystemMessage(message: KenshoMessage): void {
        // Chaque message reçu d'un autre worker est une preuve de vie
        this.workerRegistry.update(message.sourceWorker);
    }

    // Exposer la liste des workers actifs
    public getActiveWorkers(): WorkerName[] {
        return this.workerRegistry.getActiveWorkers();
    }

    public dispose(): void {
        this.messageBus.dispose();
        this.workerRegistry.dispose();
    }
}
