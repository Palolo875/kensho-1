// src/core/agent-system/defineAgent.ts
import { AgentRuntime } from './AgentRuntime';
import { WebSocketTransport } from '../communication/transport/WebSocketTransport';
import { HybridTransport } from '../communication/transport/HybridTransport';
import { IndexedDBAdapter } from '../storage/IndexedDBAdapter';
import { NoOpStorageAdapter } from '../storage/NoOpStorageAdapter';

export interface AgentDefinition {
    name: string;
    config?: {
        useWebSocket?: boolean;
        useHybrid?: boolean;
        useNoOpStorage?: boolean; // Utiliser le stockage léger (pas d'IndexedDB)
    };
    init: (runtime: AgentRuntime) => void;
}

// Cette fonction est le point d'entrée de chaque fichier de worker.
export function runAgent(definition: Omit<AgentDefinition, 'name'> & { name?: string }): void {
    const agentName = definition.name || self.name;
    if (!agentName) {
        throw new Error("Agent name must be provided either in the definition or as the worker's name.");
    }

    try {
        let transport;
        if (definition.config?.useHybrid) {
            transport = new HybridTransport();
        } else if (definition.config?.useWebSocket) {
            transport = new WebSocketTransport();
        }

        // Utiliser le stockage approprié
        const storage = definition.config?.useNoOpStorage 
            ? new NoOpStorageAdapter() 
            : new IndexedDBAdapter();

        const runtime = new AgentRuntime(agentName, transport, storage);
        definition.init(runtime);

        // Signaler que l'initialisation est terminée
        self.postMessage({ type: 'READY' });
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[${definition.name}] Erreur critique lors de l'initialisation:`, err.message);
        self.postMessage({ 
            type: 'INIT_ERROR',
            error: {
              message: err.message,
              stack: err.stack,
              name: err.name
            }
        });
    }
}
