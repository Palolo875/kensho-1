import { runAgent } from '../../core/agent-system/defineAgent';
import { createLogger } from '../../lib/logger';

const log = createLogger('RemotePingAgent');

runAgent({
    name: 'RemotePingAgent',
    config: {
        useWebSocket: true
    },
    init: (runtime) => {
        log.info(`Initialized with WebSocket transport`);

        runtime.registerMethod('ping', async (args: any[]) => {
            const message = args[0] || 'default';
            log.info(`Received ping: ${message}`);
            return `remote-pong: ${message} (from ${runtime.agentName})`;
        });

        runtime.registerMethod('echo', async (args: any[]) => {
            const data = args[0];
            log.info(`Echo request:`, data);
            return { echoed: data, timestamp: Date.now(), agent: runtime.agentName };
        });
    }
});
