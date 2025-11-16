// src/core/agent-system/defineAgent.ts
import { AgentRuntime } from './AgentRuntime';

export interface AgentDefinition {
    name: string;
    init: (runtime: AgentRuntime) => void;
}

// Cette fonction est le point d'entrée de chaque fichier de worker.
// Le nom est maintenant récupéré de l'environnement du worker.
export function runAgent(definition: Omit<AgentDefinition, 'name'> & { name?: string }): void {
    const agentName = definition.name || self.name;
    if (!agentName) {
        throw new Error("Agent name must be provided either in the definition or as the worker's name.");
    }
    const runtime = new AgentRuntime(agentName);
    definition.init(runtime);

    // NOUVEAU : Signaler que l'initialisation est terminée.
    self.postMessage({ type: 'READY' });
}
