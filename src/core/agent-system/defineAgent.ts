// src/core/agent-system/defineAgent.ts
import { AgentRuntime } from './AgentRuntime';

export interface AgentDefinition {
    name: string;
    init: (runtime: AgentRuntime) => void;
}

// Cette fonction est le point d'entrée de chaque fichier de worker.
export function runAgent(definition: AgentDefinition): void {
    const runtime = new AgentRuntime(definition.name);
    definition.init(runtime);

    // NOUVEAU : Signaler que l'initialisation est terminée.
    self.postMessage({ type: 'READY' });
}
