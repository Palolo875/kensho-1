// src/agents/llm/mock.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';

runAgent({
    name: 'MainLLMAgent',
    init: (runtime: AgentRuntime) => {
        console.log('[MockLLMAgent] 🚀 Initialisation...');
        runtime.log('info', 'Mock LLM Agent initialisé.');

        // Simuler le chargement du modèle
        setTimeout(() => {
            self.postMessage({
                type: 'MODEL_PROGRESS',
                payload: { phase: 'downloading', progress: 0.2, text: 'Téléchargement (Mock)...', downloadedMB: 200, totalMB: 1000, speedMBps: 15, etaSeconds: 50 }
            });
        }, 1000);

        setTimeout(() => {
            self.postMessage({
                type: 'MODEL_PROGRESS',
                payload: { phase: 'downloading', progress: 0.6, text: 'Téléchargement (Mock)...', downloadedMB: 600, totalMB: 1000, speedMBps: 20, etaSeconds: 20 }
            });
        }, 2000);

        setTimeout(() => {
            self.postMessage({
                type: 'MODEL_PROGRESS',
                payload: { phase: 'compiling', progress: 0.9, text: 'Compilation (Mock)...' }
            });
        }, 3000);

        setTimeout(() => {
            self.postMessage({
                type: 'MODEL_PROGRESS',
                payload: { phase: 'ready', progress: 1, text: 'Modèle prêt.' }
            });
            self.postMessage({ type: 'READY' });
        }, 4000);

        runtime.registerStreamMethod(
            'generateResponse',
            async (payload: any, stream: AgentStreamEmitter) => {
                console.log('[MockLLMAgent] 📨 Requête reçue:', payload);
                const [prompt] = payload.args || [payload];

                const responseText = `Ceci est une réponse simulée pour le prompt : "${prompt}". \n\nJe suis un agent Mock qui permet de tester l'interface sans charger le lourd modèle WebLLM. \n\nVoici quelques points clés :\n1. Le streaming fonctionne.\n2. L'interface réagit bien.\n3. Pas de crash mémoire !`;

                const chunks = responseText.split(/(?=[ \n])/); // Split by words/spaces

                for (const chunk of chunks) {
                    await new Promise(resolve => setTimeout(resolve, 50)); // Simuler délai réseau/inférence
                    stream.chunk({ text: chunk });
                }

                stream.end({ totalChunks: chunks.length });
            }
        );
    }
});
