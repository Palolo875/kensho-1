// src/agents/llm/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { ModelLoader } from '../../core/models/ModelLoader';
import * as webllm from '@mlc-ai/web-llm';

const MODEL_ID = 'TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC'; // Notre modèle pour le Sprint 2

// Paramètres de génération par défaut
const DEFAULT_GENERATION_PARAMS = {
    temperature: 0.7,
    max_tokens: 1024,
    top_p: 0.95,
};

// System prompt par défaut pour guider le modèle
const DEFAULT_SYSTEM_PROMPT = `Tu es un assistant IA intelligent et serviable. 
Réponds de manière claire, précise et dans la même langue que la question posée.
Si tu ne sais pas quelque chose, admets-le honnêtement.`;

export interface GenerationParams {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    system_prompt?: string;
}

let engine: webllm.MLCEngine | null = null;

// Le ModelLoader enverra ses mises à jour au thread principal via postMessage
const modelLoader = new ModelLoader((progress) => {
    self.postMessage({ type: 'MODEL_PROGRESS', payload: progress });
}, { allowPause: true });

// Gérer les messages de pause/reprise du téléchargement
self.addEventListener('message', (event) => {
    if (event.data.type === 'PAUSE_DOWNLOAD') {
        modelLoader.pause();
    } else if (event.data.type === 'RESUME_DOWNLOAD') {
        modelLoader.resume();
    }
});

// Charger le modèle dès le démarrage du worker
modelLoader.loadModel(MODEL_ID).then(() => {
    engine = modelLoader.getEngine();
    console.log('[MainLLMAgent] Moteur LLM prêt.');
    // Poster un message final indiquant que le modèle est prêt
    self.postMessage({ 
        type: 'MODEL_PROGRESS', 
        payload: { phase: 'ready', progress: 1, text: 'Modèle prêt.' } 
    });
}).catch((error) => {
    console.error('[MainLLMAgent] Échec du chargement du modèle:', error);
    self.postMessage({ 
        type: 'MODEL_ERROR', 
        payload: { message: error.message } 
    });
});

runAgent({
    name: 'MainLLMAgent',
    init: (runtime: AgentRuntime) => {
        runtime.log('info', `LLM Agent initialisé. Chargement du modèle ${MODEL_ID}...`);

        // Exposer une méthode pour obtenir les capacités du système
        runtime.registerMethod('getSystemCapabilities', async () => {
            return await ModelLoader.getSystemCapabilities();
        });

        // Exposer la méthode de streaming 'generateResponse'
        runtime.registerStreamMethod(
            'generateResponse',
            async (payload: any, stream: AgentStreamEmitter) => {
                const [prompt, customParams] = payload.args || [payload, {}];
                
                if (!engine) {
                    const error = new Error('Le moteur LLM n\'est pas encore prêt. Veuillez patienter...');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                // Valider le prompt
                if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
                    const error = new Error('Le prompt doit être une chaîne de caractères non vide.');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                // Fusionner les paramètres par défaut avec les paramètres personnalisés
                const params: Required<GenerationParams> = {
                    temperature: customParams?.temperature ?? DEFAULT_GENERATION_PARAMS.temperature,
                    max_tokens: customParams?.max_tokens ?? DEFAULT_GENERATION_PARAMS.max_tokens,
                    top_p: customParams?.top_p ?? DEFAULT_GENERATION_PARAMS.top_p,
                    system_prompt: customParams?.system_prompt ?? DEFAULT_SYSTEM_PROMPT,
                };

                // Valider les paramètres
                if (params.temperature < 0 || params.temperature > 2) {
                    const error = new Error('Temperature doit être entre 0 et 2.');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                if (params.max_tokens < 1 || params.max_tokens > 4096) {
                    const error = new Error('max_tokens doit être entre 1 et 4096.');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                try {
                    runtime.log('info', `Début de la génération pour le prompt: "${String(prompt).substring(0, 50)}..." (temp: ${params.temperature}, max_tokens: ${params.max_tokens})`);
                    
                    // Construire les messages avec le system prompt
                    const messages: any[] = [
                        { role: 'system', content: params.system_prompt },
                        { role: 'user', content: String(prompt) }
                    ];

                    const streamIterator = await engine.chat.completions.create({
                        messages,
                        stream: true,
                        temperature: params.temperature,
                        max_tokens: params.max_tokens,
                        top_p: params.top_p,
                    });

                    let totalChunks = 0;
                    for await (const chunk of streamIterator) {
                        const textChunk = (chunk as any).choices?.[0]?.delta?.content || '';
                        if (textChunk) {
                            totalChunks++;
                            // Envoyer chaque morceau de texte via le stream
                            stream.chunk({ text: textChunk });
                        }
                    }

                    runtime.log('info', `Génération terminée. ${totalChunks} chunks envoyés.`);
                    stream.end({ totalChunks }); // Signaler la fin du stream

                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue durant l\'inférence');
                    runtime.log('error', `Erreur d'inférence: ${err.message}`);
                    stream.error(err);
                }
            }
        );

        // Méthode pour reset le moteur si nécessaire
        runtime.registerMethod('resetEngine', async () => {
            runtime.log('info', 'Reset du moteur LLM...');
            engine = null;
            await modelLoader.loadModel(MODEL_ID);
            engine = modelLoader.getEngine();
            return { success: true };
        });

        // Méthode pour obtenir les stats du modèle
        runtime.registerMethod('getModelStats', async () => {
            if (!engine) {
                return { ready: false, model: MODEL_ID };
            }
            return {
                ready: true,
                model: MODEL_ID,
                // Ajouter d'autres stats si disponibles via web-llm
            };
        });
    }
});
