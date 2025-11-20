// src/agents/llm/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { ModelLoader } from '../../core/models/ModelLoader';
import * as webllm from '@mlc-ai/web-llm';

const MODEL_ID = 'TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC'; // Notre modèle pour le Sprint 2

let engine: webllm.MLCEngine | null = null;

// Le ModelLoader enverra ses mises à jour au thread principal via postMessage
const modelLoader = new ModelLoader((progress) => {
    self.postMessage({ type: 'MODEL_PROGRESS', payload: progress });
});

// Charger le modèle dès le démarrage du worker
modelLoader.loadModel(MODEL_ID).then(() => {
    engine = modelLoader.getEngine();
});

runAgent({
    name: 'MainLLMAgent',
    init: (runtime: AgentRuntime) => {
        runtime.log('info', `LLM Agent initialisé. Chargement du modèle ${MODEL_ID}...`);

        // Exposer la méthode de streaming 'generateResponse'
        runtime.registerStreamMethod(
            'generateResponse',
            async (payload: any, stream: AgentStreamEmitter) => {
                const [prompt] = payload.args || [payload];
                
                if (!engine) {
                    const error = new Error('Le moteur LLM n\'est pas encore prêt.');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                try {
                    runtime.log('info', `Début de la génération pour le prompt: "${String(prompt).substring(0, 50)}..."`);
                    
                    const streamIterator = await engine.chat.completions.create({
                        messages: [{ role: 'user', content: String(prompt) }],
                        stream: true,
                    });

                    for await (const chunk of streamIterator) {
                        const textChunk = (chunk as any).choices?.[0]?.delta?.content || '';
                        if (textChunk) {
                            // Envoyer chaque morceau de texte via le stream
                            stream.chunk({ text: textChunk });
                        }
                    }

                    runtime.log('info', 'Génération terminée.');
                    stream.end(); // Signaler la fin du stream

                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue durant l\'inférence');
                    runtime.log('error', `Erreur d'inférence: ${err.message}`);
                    stream.error(err);
                }
            }
        );
    }
});
