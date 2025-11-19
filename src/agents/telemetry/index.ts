// src/agents/telemetry/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';

// Ce worker est très simple pour l'instant. Son seul rôle est de recevoir
// des lots de logs et de les transmettre au thread principal (l'UI).
runAgent({
    name: 'TelemetryWorker',
    init: (runtime) => {
        runtime.registerMethod('logBatch', (logBatch: any[]) => {
            // Transférer le lot de logs au thread principal pour affichage.
            self.postMessage({ type: 'LOG_BATCH', payload: logBatch });
        });
    }
});
