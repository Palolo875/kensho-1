// src/agents/llm/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { ModelLoader } from '../../core/models/ModelLoader';
import { DownloadManager } from '../../core/downloads/DownloadManager';
import * as webllm from '@mlc-ai/web-llm';
import { createLogger } from '../../lib/logger';

const log = createLogger('MainLLMAgent');

const MODEL_ID = 'gemma-3-270m-it-MLC';
const DOWNLOAD_ID = 'llm-model';

const DEFAULT_GENERATION_PARAMS = {
    temperature: 0.7,
    max_tokens: 1024,
    top_p: 0.95,
};

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
let modelLoadingPromise: Promise<void> | null = null;
let isDownloadCancelled = false;
const dm = DownloadManager.getInstance();

const modelLoader = new ModelLoader((progress) => {
    if (isDownloadCancelled) {
        log.info('Téléchargement annulé par l\'utilisateur');
        return;
    }
    
    self.postMessage({ type: 'MODEL_PROGRESS', payload: progress });
    dm.updateProgress(DOWNLOAD_ID, {
        id: DOWNLOAD_ID,
        type: 'llm',
        name: 'Modèle LLM (Gemma-3-270M)',
        status: progress.phase === 'ready' ? 'completed' : 'downloading' as any,
        progress: progress.progress,
    });
}, { allowPause: true });

self.addEventListener('message', (event) => {
    if (event.data.type === 'PAUSE_DOWNLOAD') {
        modelLoader.pause();
        dm.pause(DOWNLOAD_ID);
    } else if (event.data.type === 'RESUME_DOWNLOAD') {
        modelLoader.resume();
        dm.resume(DOWNLOAD_ID);
    } else if (event.data.type === 'CANCEL_DOWNLOAD') {
        log.info('Annulation du téléchargement demandée');
        isDownloadCancelled = true;
        modelLoader.cancel();
        dm.markCancelled(DOWNLOAD_ID);
        modelLoadingPromise = null;
        engine = null;
        self.postMessage({
            type: 'MODEL_PROGRESS',
            payload: { phase: 'idle', progress: 0, text: 'Téléchargement annulé' }
        });
    } else if (event.data.type === 'START_DOWNLOAD') {
        isDownloadCancelled = false;
        if (!modelLoadingPromise) {
            log.info(`Démarrage du chargement du modèle (sur demande): ${MODEL_ID}`);
            dm.register(DOWNLOAD_ID, 'llm', 'Modèle LLM (Gemma-3-270M)', (progress) => {
                log.debug(`${progress.name}: ${Math.round(progress.progress * 100)}%`);
            });
            modelLoadingPromise = modelLoader.loadModel(MODEL_ID).then(() => {
                engine = modelLoader.getEngine();
                log.info('Moteur LLM prêt et opérationnel');
                dm.unregister(DOWNLOAD_ID);
                self.postMessage({
                    type: 'MODEL_PROGRESS',
                    payload: { phase: 'ready', progress: 1, text: 'Modèle prêt.' }
                });
            }).catch((error) => {
                log.error('Échec du chargement du modèle', error);
                dm.unregister(DOWNLOAD_ID);
                self.postMessage({
                    type: 'MODEL_ERROR',
                    payload: { message: error.message }
                });
            });
        }
    }
});

log.info('Prêt à recevoir la commande de téléchargement du modèle');
self.postMessage({
    type: 'MODEL_PROGRESS',
    payload: { phase: 'idle', progress: 0, text: 'En attente du démarrage du téléchargement...' }
});

runAgent({
    name: 'MainLLMAgent',
    config: { useNoOpStorage: true },
    init: (runtime: AgentRuntime) => {
        log.info('Initialisation...');
        runtime.log('info', `LLM Agent initialisé. Chargement du modèle ${MODEL_ID}...`);
        log.info('Prêt à recevoir des requêtes de génération');

        runtime.registerMethod('getSystemCapabilities', async () => {
            return await ModelLoader.getSystemCapabilities();
        });

        runtime.registerStreamMethod(
            'generateResponse',
            async (payload: any, stream: AgentStreamEmitter) => {
                log.debug('Requête de génération reçue', { payload });

                const [prompt, customParams] = payload.args || [payload, {}];

                if (!engine) {
                    const error = new Error('Le moteur LLM n\'est pas encore prêt. Veuillez patienter...');
                    log.error('Moteur non prêt', error);
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                log.debug('Moteur disponible');

                if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
                    const error = new Error('Le prompt doit être une chaîne de caractères non vide.');
                    log.error('Prompt invalide', error);
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                log.debug('Prompt valide', { preview: prompt.substring(0, 50) + '...' });

                let systemPrompt = customParams?.system_prompt ?? DEFAULT_SYSTEM_PROMPT;

                const params: Required<GenerationParams> = {
                    temperature: customParams?.temperature ?? DEFAULT_GENERATION_PARAMS.temperature,
                    max_tokens: customParams?.max_tokens ?? DEFAULT_GENERATION_PARAMS.max_tokens,
                    top_p: customParams?.top_p ?? DEFAULT_GENERATION_PARAMS.top_p,
                    system_prompt: systemPrompt,
                };

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
                    log.info('Début de la génération...');
                    runtime.log('info', `Début de la génération pour le prompt: "${String(prompt).substring(0, 50)}..." (temp: ${params.temperature}, max_tokens: ${params.max_tokens})`);

                    const messages: any[] = [
                        { role: 'system', content: params.system_prompt },
                        { role: 'user', content: String(prompt) }
                    ];

                    log.debug('Appel du moteur LLM...');
                    const streamIterator = await engine.chat.completions.create({
                        messages,
                        stream: true,
                        temperature: params.temperature,
                        max_tokens: params.max_tokens,
                        top_p: params.top_p,
                    });

                    log.debug('Stream démarré, attente des chunks...');
                    let totalChunks = 0;
                    for await (const chunk of streamIterator) {
                        const textChunk = (chunk as any).choices?.[0]?.delta?.content || '';
                        if (textChunk) {
                            totalChunks++;
                            if (totalChunks === 1) {
                                log.debug('Premier chunk reçu');
                            }
                            stream.chunk({ text: textChunk });
                        }
                    }

                    log.info(`Génération terminée. ${totalChunks} chunks envoyés.`);
                    runtime.log('info', `Génération terminée. ${totalChunks} chunks envoyés.`);
                    stream.end({ totalChunks });

                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue durant l\'inférence');
                    log.error('Erreur d\'inférence', err);
                    runtime.log('error', `Erreur d'inférence: ${err.message}`);
                    stream.error(err);
                }
            }
        );

        runtime.registerMethod('generateSingleResponse', async (payload: any) => {
            log.debug('Requête de génération unique reçue:', { payload });

            const [prompt, customParams] = payload.args || [payload, {}];

            if (!engine) {
                const error = new Error('Le moteur LLM n\'est pas encore prêt. Veuillez patienter...');
                log.error('Moteur non prêt', error);
                runtime.log('error', error.message);
                throw error;
            }

            log.debug('Moteur disponible');

            if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
                const error = new Error('Le prompt doit être une chaîne de caractères non vide.');
                log.error('Prompt invalide', { prompt });
                runtime.log('error', error.message);
                throw error;
            }

            log.debug('Prompt valide pour génération unique');

            const params: Required<GenerationParams> = {
                temperature: customParams?.temperature ?? DEFAULT_GENERATION_PARAMS.temperature,
                max_tokens: customParams?.max_tokens ?? DEFAULT_GENERATION_PARAMS.max_tokens,
                top_p: customParams?.top_p ?? DEFAULT_GENERATION_PARAMS.top_p,
                system_prompt: customParams?.system_prompt ?? DEFAULT_SYSTEM_PROMPT,
            };

            if (params.temperature < 0 || params.temperature > 2) {
                throw new Error('Temperature doit être entre 0 et 2.');
            }

            if (params.max_tokens < 1 || params.max_tokens > 4096) {
                throw new Error('max_tokens doit être entre 1 et 4096.');
            }

            try {
                log.info('Début de la génération unique...');
                runtime.log('info', `Génération unique pour: "${String(prompt).substring(0, 50)}..." (temp: ${params.temperature})`);

                const messages: any[] = [
                    { role: 'system', content: params.system_prompt },
                    { role: 'user', content: String(prompt) }
                ];

                log.debug('Appel du moteur LLM (mode non-stream)...');
                const response = await engine.chat.completions.create({
                    messages,
                    stream: false,
                    temperature: params.temperature,
                    max_tokens: params.max_tokens,
                    top_p: params.top_p,
                });

                const textResponse = (response as any).choices?.[0]?.message?.content || '';
                
                log.info(`Génération unique terminée. ${textResponse.length} caractères.`);
                runtime.log('info', `Génération unique terminée. ${textResponse.length} caractères générés.`);
                
                return textResponse;

            } catch (error) {
                const err = error instanceof Error ? error : new Error('Erreur inconnue durant l\'inférence');
                log.error('Erreur d\'inférence:', err);
                runtime.log('error', `Erreur d'inférence (mode unique): ${err.message}`);
                throw err;
            }
        });

        runtime.registerStreamMethod(
            'synthesizeDebate',
            async (payload: any, stream: AgentStreamEmitter) => {
                log.debug('Synthèse de débat demandée (Sprint 8)');
                
                const { originalQuery, draftResponse, critique, validation } = payload.args?.[0] || payload;
                
                if (!engine) {
                    const error = new Error('Le moteur LLM n\'est pas encore prêt. Veuillez patienter...');
                    log.error('Moteur non prêt', error);
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }
                
                const validationInfo = validation ? `

**VALIDATION DE LA CRITIQUE (Arbitre) :**
Score de pertinence : ${validation.overall_relevance_score}/100
Point le plus pertinent : ${validation.most_relevant_point}
Critique forcée : ${validation.is_forced ? 'Oui' : 'Non'}

➡️ Cette validation t'indique à quel point la critique est pertinente pour la question posée.
` : '';
                
                const SYNTHESIS_PROMPT = `Tu es un assistant IA qui doit synthétiser un débat interne pour fournir une réponse équilibrée et nuancée.

**CONTEXTE :**
Question originale : "${originalQuery}"

**ANALYSE OPTIMISTE (Léo) :**
${draftResponse}

**CRITIQUE (Athéna) :**
${typeof critique === 'object' ? JSON.stringify(critique, null, 2) : critique}${validationInfo}

**TA MISSION :**
Synthétise ces deux perspectives pour fournir une réponse finale qui :
1. Reconnaît les points forts identifiés par Léo
2. Intègre les préoccupations légitimes d'Athéna${validation ? `
3. Prends en compte le score de pertinence de la critique (${validation.overall_relevance_score}/100)
   - Si le score est élevé (>70), accorde plus de poids aux préoccupations d'Athéna
   - Si le score est moyen (40-70), trouve un équilibre
   - Si le score est faible (<40), privilégie l'analyse de Léo` : ''}
4. Fournit une recommandation équilibrée et nuancée
5. Reste claire et actionnable pour l'utilisateur

**RÈGLES :**
- Ne mentionne PAS Léo, Athéna, ou l'Arbitre dans ta réponse
- Parle directement à l'utilisateur
- Sois concis (moins de 250 mots)
- Fournis une réponse pratique et équilibrée

**TA RÉPONSE FINALE :`;

                try {
                    log.info('Début de la synthèse...');
                    runtime.log('info', 'Synthèse du débat en cours...');

                    const messages: any[] = [
                        { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
                        { role: 'user', content: SYNTHESIS_PROMPT }
                    ];

                    log.debug('Appel du moteur LLM pour la synthèse...');
                    const streamIterator = await engine.chat.completions.create({
                        messages,
                        stream: true,
                        temperature: 0.7,
                        max_tokens: 1024,
                        top_p: 0.95,
                    });

                    log.debug('Stream de synthèse démarré...');
                    let totalChunks = 0;
                    for await (const chunk of streamIterator) {
                        const textChunk = (chunk as any).choices?.[0]?.delta?.content || '';
                        if (textChunk) {
                            totalChunks++;
                            stream.chunk({ text: textChunk });
                        }
                    }

                    log.info(`Synthèse terminée. ${totalChunks} chunks envoyés.`);
                    runtime.log('info', `Synthèse du débat terminée. ${totalChunks} chunks envoyés.`);
                    stream.end({ totalChunks });

                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue durant la synthèse');
                    log.error('Erreur de synthèse:', err);
                    runtime.log('error', `Erreur de synthèse: ${err.message}`);
                    stream.error(err);
                }
            }
        );

        runtime.registerMethod('resetEngine', async () => {
            runtime.log('info', 'Reset du moteur LLM...');
            engine = null;
            await modelLoader.loadModel(MODEL_ID);
            engine = modelLoader.getEngine();
            return { success: true };
        });

        runtime.registerMethod('getModelStats', async () => {
            if (!engine) {
                return { ready: false, model: MODEL_ID };
            }
            return {
                ready: true,
                model: MODEL_ID,
            };
        });
    }
});
