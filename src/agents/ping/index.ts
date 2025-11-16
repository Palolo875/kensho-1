// src/agents/ping/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';

runAgent({
    name: 'PingAgent',
    init: (runtime) => {
        runtime.registerMethod('ping', async (message: string) => {
            return `pong: ${message}`;
        });
    }
});
