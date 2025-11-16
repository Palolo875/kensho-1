// src/agents/ping/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';

runAgent({
    // Utilise le nom du worker s'il est fourni, sinon utilise "PingAgent" par défaut
    name: self.name || 'PingAgent',
    init: (runtime) => {
        runtime.registerMethod('ping', async (message: string) => {
            return `pong: ${message}`;
        });
    }
});
