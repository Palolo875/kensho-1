// src/core/models/ModelLoader.ts
import * as webllm from '@mlc-ai/web-llm';

export type ModelLoaderPhase = 'idle' | 'downloading' | 'compiling' | 'ready' | 'error';

export interface ModelLoaderProgress {
    phase: ModelLoaderPhase;
    progress: number; // 0 à 1
    text: string;
}

export type ProgressCallback = (progress: ModelLoaderProgress) => void;

/**
 * Gère le cycle de vie du chargement d'un modèle web-llm,
 * en fournissant un feedback détaillé pour l'UI.
 */
export class ModelLoader {
    private engine: webllm.MLCEngine | null = null;
    private readonly progressCallback: ProgressCallback;

    constructor(progressCallback: ProgressCallback) {
        this.progressCallback = progressCallback;
    }

    public getEngine(): webllm.MLCEngine | null {
        return this.engine;
    }

    public async loadModel(modelId: string): Promise<void> {
        try {
            // Étape 1: Vérifier le stockage persistant
            await this.requestPersistentStorage();

            // Étape 2: Créer le moteur avec le callback de progression
            this.engine = await webllm.CreateMLCEngine(
                modelId,
                { 
                    init: (progress: any) => {
                        // Traduire le progrès de web-llm en notre propre format
                        const phase: ModelLoaderPhase = progress.text.includes('compiling') ? 'compiling' : 'downloading';
                        this.progressCallback({
                            phase: phase,
                            progress: progress.progress,
                            text: progress.text,
                        });
                    }
                }
            );

            this.progressCallback({ phase: 'ready', progress: 1, text: 'Modèle prêt.' });
            console.log('[ModelLoader] Modèle chargé avec succès.');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.progressCallback({ phase: 'error', progress: 0, text: errorMessage });
            console.error('[ModelLoader] Erreur de chargement du modèle:', error);
        }
    }

    private async requestPersistentStorage(): Promise<void> {
        if (!(navigator.storage && navigator.storage.persist)) {
            console.warn('[ModelLoader] API de stockage persistant non disponible.');
            return;
        }
        const isPersisted = await navigator.storage.persisted();
        if (isPersisted) {
            console.log('[ModelLoader] Stockage déjà persistant.');
            return;
        }
        const success = await navigator.storage.persist();
        if (success) {
            console.log('[ModelLoader] Stockage persistant accordé.');
        } else {
            console.warn('[ModelLoader] Demande de stockage persistant refusée par l\'utilisateur ou le navigateur.');
        }
    }
}
