// src/core/agent-system/defineAgent.ts
import { AgentRuntime } from './AgentRuntime';
import { WebSocketTransport } from '../communication/transport/WebSocketTransport';
import { HybridTransport } from '../communication/transport/HybridTransport';
import { IndexedDBAdapter } from '../storage/IndexedDBAdapter';

export interface AgentDefinition {
    name: string;
    config?: {
        useWebSocket?: boolean;
        useHybrid?: boolean; // Nouveau : utilise BroadcastChannel + WebSocket
    };
    init: (runtime: AgentRuntime) => void;
}

// Cette fonction est le point d'entrée de chaque fichier de worker.
// Le nom est maintenant récupéré de l'environnement du worker.
export function runAgent(definition: Omit<AgentDefinition, 'name'> & { name?: string }): void {
    const agentName = definition.name || self.name;
    if (!agentName) {
        throw new Error("Agent name must be provided either in the definition or as the worker's name.");
    }

    let transport;
    if (definition.config?.useHybrid) {
        // Transport hybride : local + distant
        transport = new HybridTransport();
    } else if (definition.config?.useWebSocket) {
        // Transport WebSocket uniquement
        transport = new WebSocketTransport();
    }
    // Sinon, BroadcastTransport par défaut (via MessageBus)

    // Initialiser le stockage persistant
    const storage = new IndexedDBAdapter();

    const runtime = new AgentRuntime(agentName, transport, storage);
    definition.init(runtime);

    // NOUVEAU : Signaler que l'initialisation est terminée.
    self.postMessage({ type: 'READY' });
}
