// src/agents/pong/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';

runAgent({
    name: 'PongAgent',
    init: (runtime) => {
        runtime.registerMethod('start', async (message: string) => {
            const response = await runtime.callAgent<string>(
                'PingAgent',
                'ping',
                [message]
            );
            return response;
        });
    }
});
