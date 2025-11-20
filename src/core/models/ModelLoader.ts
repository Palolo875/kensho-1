// src/core/models/ModelLoader.ts
import * as webllm from '@mlc-ai/web-llm';

export type ModelLoaderPhase = 'idle' | 'checking_gpu' | 'downloading' | 'compiling' | 'ready' | 'error';

export interface ModelLoaderProgress {
    phase: ModelLoaderPhase;
    progress: number; // 0 à 1
    text: string;
}

export type ProgressCallback = (progress: ModelLoaderProgress) => void;

export interface ModelLoaderOptions {
    maxRetries?: number;
    retryDelay?: number;
    requireGPU?: boolean;
}

const DEFAULT_OPTIONS: Required<ModelLoaderOptions> = {
    maxRetries: 3,
    retryDelay: 2000,
    requireGPU: false,
};

/**
 * Gère le cycle de vie du chargement d'un modèle web-llm,
 * en fournissant un feedback détaillé pour l'UI.
 * Inclut retry logic et vérification WebGPU.
 */
export class ModelLoader {
    private engine: webllm.MLCEngine | null = null;
    private readonly progressCallback: ProgressCallback;
    private readonly options: Required<ModelLoaderOptions>;

    constructor(progressCallback: ProgressCallback, options: ModelLoaderOptions = {}) {
        this.progressCallback = progressCallback;
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    public getEngine(): webllm.MLCEngine | null {
        return this.engine;
    }

    /**
     * Vérifie la disponibilité de WebGPU
     */
    private async checkWebGPUAvailability(): Promise<boolean> {
        this.progressCallback({
            phase: 'checking_gpu',
            progress: 0.05,
            text: 'Vérification de la disponibilité WebGPU...',
        });

        const nav = navigator as any;
        if (!nav.gpu) {
            console.warn('[ModelLoader] WebGPU n\'est pas disponible dans ce navigateur.');
            return false;
        }

        try {
            const adapter = await nav.gpu.requestAdapter();
            if (!adapter) {
                console.warn('[ModelLoader] Impossible d\'obtenir un adaptateur WebGPU.');
                return false;
            }
            console.log('[ModelLoader] WebGPU est disponible et prêt.');
            return true;
        } catch (error) {
            console.warn('[ModelLoader] Erreur lors de la vérification WebGPU:', error);
            return false;
        }
    }

    public async loadModel(modelId: string): Promise<void> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
            try {
                // Étape 0: Vérifier WebGPU
                const hasWebGPU = await this.checkWebGPUAvailability();
                
                if (this.options.requireGPU && !hasWebGPU) {
                    throw new Error('WebGPU est requis mais non disponible. Veuillez utiliser un navigateur compatible (Chrome/Edge 113+).');
                }

                if (!hasWebGPU) {
                    this.progressCallback({
                        phase: 'downloading',
                        progress: 0.1,
                        text: 'WebGPU non disponible, fallback vers CPU (performance réduite)...',
                    });
                }

                // Étape 1: Vérifier le stockage persistant
                await this.requestPersistentStorage();

                // Étape 2: Créer le moteur avec le callback de progression
                const config: any = {
                    initProgressCallback: (progress: any) => {
                        // Traduire le progrès de web-llm en notre propre format
                        const phase: ModelLoaderPhase = progress.text.includes('compiling') ? 'compiling' : 'downloading';
                        this.progressCallback({
                            phase: phase,
                            progress: progress.progress,
                            text: progress.text,
                        });
                    }
                };

                this.engine = await webllm.CreateMLCEngine(modelId, config);

                this.progressCallback({ phase: 'ready', progress: 1, text: 'Modèle prêt.' });
                console.log('[ModelLoader] Modèle chargé avec succès.');
                return; // Succès, on sort de la boucle de retry

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.error(`[ModelLoader] Tentative ${attempt}/${this.options.maxRetries} échouée:`, error);

                // Si c'est la dernière tentative, on propage l'erreur
                if (attempt === this.options.maxRetries) {
                    const errorMessage = lastError.message;
                    this.progressCallback({ 
                        phase: 'error', 
                        progress: 0, 
                        text: `Échec après ${this.options.maxRetries} tentatives: ${errorMessage}` 
                    });
                    throw lastError;
                }

                // Attendre avant de retry
                this.progressCallback({
                    phase: 'downloading',
                    progress: 0.05,
                    text: `Erreur réseau, nouvelle tentative dans ${this.options.retryDelay / 1000}s... (${attempt}/${this.options.maxRetries})`,
                });

                await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
            }
        }

        // Ce point ne devrait jamais être atteint, mais par sécurité
        if (lastError) {
            throw lastError;
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

    /**
     * Retourne les informations sur les capacités du système
     */
    public static async getSystemCapabilities(): Promise<{
        hasWebGPU: boolean;
        hasPersistentStorage: boolean;
        estimatedStorage?: number;
    }> {
        const nav = navigator as any;
        const hasWebGPU = !!(nav.gpu && await nav.gpu.requestAdapter());
        const hasPersistentStorage = !!(navigator.storage && navigator.storage.persist);
        
        let estimatedStorage: number | undefined;
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            estimatedStorage = estimate.quota;
        }

        return {
            hasWebGPU,
            hasPersistentStorage,
            estimatedStorage,
        };
    }
}
