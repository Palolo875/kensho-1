// src/agents/llm/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime, AgentStreamEmitter } from '../../core/agent-system/AgentRuntime';
import { ModelLoader } from '../../core/models/ModelLoader';
import { DownloadManager } from '../../core/downloads/DownloadManager';
import * as webllm from '@mlc-ai/web-llm';

const MODEL_ID = 'Phi-3-mini-4k-instruct-q4f32_1-MLC'; // Upgrade Sprint 3 : Phi-3 pour une meilleure qualité
const DOWNLOAD_ID = 'llm-model';

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
let modelLoadingPromise: Promise<void> | null = null;
let isDownloadCancelled = false;
const dm = DownloadManager.getInstance();

// Le ModelLoader enverra ses mises à jour au thread principal via postMessage
const modelLoader = new ModelLoader((progress) => {
    // Vérifier si l'utilisateur a annulé
    if (isDownloadCancelled) {
        console.log('[MainLLMAgent] ⛔ Téléchargement annulé par l\'utilisateur');
        return;
    }
    
    self.postMessage({ type: 'MODEL_PROGRESS', payload: progress });
    // Mettre à jour le DownloadManager aussi
    dm.updateProgress(DOWNLOAD_ID, {
        id: DOWNLOAD_ID,
        type: 'llm',
        name: 'Modèle LLM (Phi-3)',
        status: progress.phase === 'ready' ? 'completed' : 'downloading' as any,
        progress: progress.progress,
    });
}, { allowPause: true });

// Gérer les messages de pause/reprise/start/cancel du téléchargement
self.addEventListener('message', (event) => {
    if (event.data.type === 'PAUSE_DOWNLOAD') {
        modelLoader.pause();
        dm.pause(DOWNLOAD_ID);
    } else if (event.data.type === 'RESUME_DOWNLOAD') {
        modelLoader.resume();
        dm.resume(DOWNLOAD_ID);
    } else if (event.data.type === 'CANCEL_DOWNLOAD') {
        // Annuler complètement le téléchargement
        console.log('[MainLLMAgent] ⛔ Annulation du téléchargement demandée');
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
        // Réinitialiser isDownloadCancelled si c'est un nouveau téléchargement
        isDownloadCancelled = false;
        // Démarrer le téléchargement à la demande de l'utilisateur
        if (!modelLoadingPromise) {
            console.log('[MainLLMAgent] 🚀 Démarrage du chargement du modèle (sur demande):', MODEL_ID);
            dm.register(DOWNLOAD_ID, 'llm', 'Modèle LLM (Phi-3)', (progress) => {
                console.log(`[MainLLMAgent] 📥 ${progress.name}: ${Math.round(progress.progress * 100)}%`);
            });
            modelLoadingPromise = modelLoader.loadModel(MODEL_ID).then(() => {
                engine = modelLoader.getEngine();
                console.log('[MainLLMAgent] ✅ Moteur LLM prêt et opérationnel');
                dm.unregister(DOWNLOAD_ID);
                self.postMessage({
                    type: 'MODEL_PROGRESS',
                    payload: { phase: 'ready', progress: 1, text: 'Modèle prêt.' }
                });
            }).catch((error) => {
                console.error('[MainLLMAgent] ❌ Échec du chargement du modèle:', error);
                dm.unregister(DOWNLOAD_ID);
                self.postMessage({
                    type: 'MODEL_ERROR',
                    payload: { message: error.message }
                });
            });
        }
    }
});

// NE PAS charger automatiquement le modèle
// L'utilisateur décidera quand démarrer le téléchargement
console.log('[MainLLMAgent] ⏳ Prêt à recevoir la commande de téléchargement du modèle');
self.postMessage({
    type: 'MODEL_PROGRESS',
    payload: { phase: 'idle', progress: 0, text: 'En attente du démarrage du téléchargement...' }
});

runAgent({
    name: 'MainLLMAgent',
    init: (runtime: AgentRuntime) => {
        console.log('[MainLLMAgent] 🚀 Initialisation...');
        runtime.log('info', `LLM Agent initialisé. Chargement du modèle ${MODEL_ID}...`);
        console.log('[MainLLMAgent] ✅ Prêt à recevoir des requêtes de génération');

        // Exposer une méthode pour obtenir les capacités du système
        runtime.registerMethod('getSystemCapabilities', async () => {
            return await ModelLoader.getSystemCapabilities();
        });

        // Exposer la méthode de streaming 'generateResponse'
        runtime.registerStreamMethod(
            'generateResponse',
            async (payload: any, stream: AgentStreamEmitter) => {
                console.log('[MainLLMAgent] 📨 Requête de génération reçue:', payload);

                const [prompt, customParams] = payload.args || [payload, {}];

                if (!engine) {
                    const error = new Error('Le moteur LLM n\'est pas encore prêt. Veuillez patienter...');
                    console.error('[MainLLMAgent] ❌ Moteur non prêt');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                console.log('[MainLLMAgent] ✅ Moteur disponible');

                // Valider le prompt
                if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
                    const error = new Error('Le prompt doit être une chaîne de caractères non vide.');
                    console.error('[MainLLMAgent] ❌ Prompt invalide:', prompt);
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }

                console.log('[MainLLMAgent] ✅ Prompt valide:', prompt.substring(0, 50) + '...');

                // Sprint 7: Enrichir le system prompt avec contexte projet si actif
                let systemPrompt = customParams?.system_prompt ?? DEFAULT_SYSTEM_PROMPT;
                if (typeof window !== 'undefined') {
                    const kenshoStore = (window as any)?.useKenshoStore?.getState?.();
                    if (kenshoStore?.activeProjectId && kenshoStore?.projects) {
                        const activeProject = kenshoStore.projects.find((p: any) => p.id === kenshoStore.activeProjectId);
                        const projectTasks = kenshoStore.projectTasks?.get(kenshoStore.activeProjectId) || [];
                        if (activeProject) {
                            const ProjectContextBuilder = require('../../core/oie/ProjectContextBuilder').ProjectContextBuilder;
                            const projectContext = ProjectContextBuilder.buildProjectContext(activeProject, projectTasks);
                            systemPrompt = DEFAULT_SYSTEM_PROMPT + '\n' + projectContext;
                        }
                    }
                }

                // Fusionner les paramètres par défaut avec les paramètres personnalisés
                const params: Required<GenerationParams> = {
                    temperature: customParams?.temperature ?? DEFAULT_GENERATION_PARAMS.temperature,
                    max_tokens: customParams?.max_tokens ?? DEFAULT_GENERATION_PARAMS.max_tokens,
                    top_p: customParams?.top_p ?? DEFAULT_GENERATION_PARAMS.top_p,
                    system_prompt: systemPrompt,
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
                    console.log('[MainLLMAgent] 🔄 Début de la génération...');
                    runtime.log('info', `Début de la génération pour le prompt: "${String(prompt).substring(0, 50)}..." (temp: ${params.temperature}, max_tokens: ${params.max_tokens})`);

                    // Construire les messages avec le system prompt
                    const messages: any[] = [
                        { role: 'system', content: params.system_prompt },
                        { role: 'user', content: String(prompt) }
                    ];

                    console.log('[MainLLMAgent] 🤖 Appel du moteur LLM...');
                    const streamIterator = await engine.chat.completions.create({
                        messages,
                        stream: true,
                        temperature: params.temperature,
                        max_tokens: params.max_tokens,
                        top_p: params.top_p,
                    });

                    console.log('[MainLLMAgent] 📡 Stream démarré, attente des chunks...');
                    let totalChunks = 0;
                    for await (const chunk of streamIterator) {
                        const textChunk = (chunk as any).choices?.[0]?.delta?.content || '';
                        if (textChunk) {
                            totalChunks++;
                            if (totalChunks === 1) {
                                console.log('[MainLLMAgent] 📦 Premier chunk reçu');
                            }
                            // Envoyer chaque morceau de texte via le stream
                            stream.chunk({ text: textChunk });
                        }
                    }

                    console.log(`[MainLLMAgent] ✅ Génération terminée. ${totalChunks} chunks envoyés.`);
                    runtime.log('info', `Génération terminée. ${totalChunks} chunks envoyés.`);
                    stream.end({ totalChunks }); // Signaler la fin du stream

                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue durant l\'inférence');
                    console.error('[MainLLMAgent] ❌ Erreur d\'inférence:', err);
                    runtime.log('error', `Erreur d'inférence: ${err.message}`);
                    stream.error(err);
                }
            }
        );

        // Exposer une méthode request/response pour générer une réponse complète (sans streaming)
        // Utilisée par le LLMPlanner pour générer les plans
        runtime.registerMethod('generateSingleResponse', async (payload: any) => {
            console.log('[MainLLMAgent] 📨 Requête de génération unique reçue:', payload);

            const [prompt, customParams] = payload.args || [payload, {}];

            if (!engine) {
                const error = new Error('Le moteur LLM n\'est pas encore prêt. Veuillez patienter...');
                console.error('[MainLLMAgent] ❌ Moteur non prêt');
                runtime.log('error', error.message);
                throw error;
            }

            console.log('[MainLLMAgent] ✅ Moteur disponible');

            // Valider le prompt
            if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
                const error = new Error('Le prompt doit être une chaîne de caractères non vide.');
                console.error('[MainLLMAgent] ❌ Prompt invalide:', prompt);
                runtime.log('error', error.message);
                throw error;
            }

            console.log('[MainLLMAgent] ✅ Prompt valide pour génération unique');

            // Fusionner les paramètres par défaut avec les paramètres personnalisés
            const params: Required<GenerationParams> = {
                temperature: customParams?.temperature ?? DEFAULT_GENERATION_PARAMS.temperature,
                max_tokens: customParams?.max_tokens ?? DEFAULT_GENERATION_PARAMS.max_tokens,
                top_p: customParams?.top_p ?? DEFAULT_GENERATION_PARAMS.top_p,
                system_prompt: customParams?.system_prompt ?? DEFAULT_SYSTEM_PROMPT,
            };

            // Valider les paramètres
            if (params.temperature < 0 || params.temperature > 2) {
                throw new Error('Temperature doit être entre 0 et 2.');
            }

            if (params.max_tokens < 1 || params.max_tokens > 4096) {
                throw new Error('max_tokens doit être entre 1 et 4096.');
            }

            try {
                console.log('[MainLLMAgent] 🔄 Début de la génération unique...');
                runtime.log('info', `Génération unique pour: "${String(prompt).substring(0, 50)}..." (temp: ${params.temperature})`);

                // Construire les messages avec le system prompt
                const messages: any[] = [
                    { role: 'system', content: params.system_prompt },
                    { role: 'user', content: String(prompt) }
                ];

                console.log('[MainLLMAgent] 🤖 Appel du moteur LLM (mode non-stream)...');
                const response = await engine.chat.completions.create({
                    messages,
                    stream: false, // Mode request/response
                    temperature: params.temperature,
                    max_tokens: params.max_tokens,
                    top_p: params.top_p,
                });

                const textResponse = (response as any).choices?.[0]?.message?.content || '';
                
                console.log(`[MainLLMAgent] ✅ Génération unique terminée. ${textResponse.length} caractères.`);
                runtime.log('info', `Génération unique terminée. ${textResponse.length} caractères générés.`);
                
                return textResponse;

            } catch (error) {
                const err = error instanceof Error ? error : new Error('Erreur inconnue durant l\'inférence');
                console.error('[MainLLMAgent] ❌ Erreur d\'inférence:', err);
                runtime.log('error', `Erreur d'inférence (mode unique): ${err.message}`);
                throw err;
            }
        });

        // Méthode de streaming pour synthétiser un débat (Sprint 6)
        // Prend la réponse initiale de l'Optimiste et la critique d'Athéna,
        // et génère une réponse finale équilibrée
        runtime.registerStreamMethod(
            'synthesizeDebate',
            async (payload: any, stream: AgentStreamEmitter) => {
                console.log('[MainLLMAgent] 🧠 Synthèse de débat demandée');
                
                const { originalQuery, draftResponse, critique } = payload.args?.[0] || payload;
                
                if (!engine) {
                    const error = new Error('Le moteur LLM n\'est pas encore prêt. Veuillez patienter...');
                    console.error('[MainLLMAgent] ❌ Moteur non prêt');
                    runtime.log('error', error.message);
                    stream.error(error);
                    return;
                }
                
                // Construire le prompt de synthèse
                const SYNTHESIS_PROMPT = `Tu es un assistant IA qui doit synthétiser un débat interne pour fournir une réponse équilibrée et nuancée.

**CONTEXTE :**
Question originale : "${originalQuery}"

**ANALYSE OPTIMISTE (Léo) :**
${draftResponse}

**CRITIQUE (Athéna) :**
${typeof critique === 'object' ? JSON.stringify(critique, null, 2) : critique}

**TA MISSION :**
Synthétise ces deux perspectives pour fournir une réponse finale qui :
1. Reconnaît les points forts identifiés par Léo
2. Intègre les préoccupations légitimes d'Athéna
3. Fournit une recommandation équilibrée et nuancée
4. Reste claire et actionnable pour l'utilisateur

**RÈGLES :**
- Ne mentionne PAS Léo ni Athéna dans ta réponse
- Parle directement à l'utilisateur
- Sois concis (moins de 250 mots)
- Fournis une réponse pratique et équilibrée

**TA RÉPONSE FINALE :`;

                try {
                    console.log('[MainLLMAgent] 🔄 Début de la synthèse...');
                    runtime.log('info', 'Synthèse du débat en cours...');

                    const messages: any[] = [
                        { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
                        { role: 'user', content: SYNTHESIS_PROMPT }
                    ];

                    console.log('[MainLLMAgent] 🤖 Appel du moteur LLM pour la synthèse...');
                    const streamIterator = await engine.chat.completions.create({
                        messages,
                        stream: true,
                        temperature: 0.7,
                        max_tokens: 1024,
                        top_p: 0.95,
                    });

                    console.log('[MainLLMAgent] 📡 Stream de synthèse démarré...');
                    let totalChunks = 0;
                    for await (const chunk of streamIterator) {
                        const textChunk = (chunk as any).choices?.[0]?.delta?.content || '';
                        if (textChunk) {
                            totalChunks++;
                            stream.chunk({ text: textChunk });
                        }
                    }

                    console.log(`[MainLLMAgent] ✅ Synthèse terminée. ${totalChunks} chunks envoyés.`);
                    runtime.log('info', `Synthèse du débat terminée. ${totalChunks} chunks envoyés.`);
                    stream.end({ totalChunks });

                } catch (error) {
                    const err = error instanceof Error ? error : new Error('Erreur inconnue durant la synthèse');
                    console.error('[MainLLMAgent] ❌ Erreur de synthèse:', err);
                    runtime.log('error', `Erreur de synthèse: ${err.message}`);
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
