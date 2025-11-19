// src/agents/remote-ping/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';

runAgent({
    name: 'RemotePingAgent',
    config: {
        useWebSocket: true // Utilise WebSocket au lieu de BroadcastChannel
    },
    init: (runtime) => {
        console.log(`[RemotePingAgent] Initialized with WebSocket transport`);

        runtime.registerMethod('ping', async (args: any[]) => {
            const message = args[0] || 'default';
            console.log(`[RemotePingAgent] Received ping: ${message}`);
            return `remote-pong: ${message} (from ${runtime.agentName})`;
        });

        runtime.registerMethod('echo', async (args: any[]) => {
            const data = args[0];
            console.log(`[RemotePingAgent] Echo request:`, data);
            return { echoed: data, timestamp: Date.now(), agent: runtime.agentName };
        });
    }
});
