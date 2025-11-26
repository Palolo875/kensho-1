import { runAgent } from '../../core/agent-system/defineAgent';
import { createLogger } from '../../lib/logger';

const log = createLogger('RemotePingAgent');

interface PingRequest {
  message?: string;
}

interface EchoRequest {
  data: unknown;
}

interface EchoResponse {
  echoed: unknown;
  timestamp: number;
  agent: string;
}

runAgent({
    name: 'RemotePingAgent',
    config: {
        useWebSocket: true
    },
    init: (runtime) => {
        log.info(`Initialized with WebSocket transport`);

        runtime.registerMethod('ping', async (payload: PingRequest): Promise<string> => {
            const message = payload.message || 'default';
            log.info(`Received ping: ${message}`);
            return `remote-pong: ${message} (from ${runtime.agentName})`;
        });

        runtime.registerMethod('echo', async (payload: EchoRequest): Promise<EchoResponse> => {
            log.info(`Echo request:`, payload.data);
            return { echoed: payload.data, timestamp: Date.now(), agent: runtime.agentName };
        });
    }
});
