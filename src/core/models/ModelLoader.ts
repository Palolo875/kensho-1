// src/core/models/ModelLoader.ts
import * as webllm from '@mlc-ai/web-llm';

export type ModelLoaderPhase = 'idle' | 'checking_gpu' | 'downloading' | 'compiling' | 'ready' | 'error';

export interface ModelLoaderProgress {
    phase: ModelLoaderPhase;
    progress: number; // 0 à 1
    text: string;
    downloadedMB?: number;
    totalMB?: number;
    speedMBps?: number;
    etaSeconds?: number;
    isCached?: boolean;
}

export type ProgressCallback = (progress: ModelLoaderProgress) => void;

export interface ModelLoaderOptions {
    maxRetries?: number;
    retryDelay?: number;
    requireGPU?: boolean;
    allowPause?: boolean;
}

const DEFAULT_OPTIONS: Required<ModelLoaderOptions> = {
    maxRetries: 3,
    retryDelay: 2000,
    requireGPU: false,
    allowPause: true,
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
    private isPaused: boolean = false;
    private isCancelled: boolean = false;
    private pauseResolver: (() => void) | null = null;
    private startTime: number = 0;
    private lastProgressUpdate: number = 0;
    private lastDownloadedBytes: number = 0;

    constructor(progressCallback: ProgressCallback, options: ModelLoaderOptions = {}) {
        this.progressCallback = progressCallback;
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    public getEngine(): webllm.MLCEngine | null {
        return this.engine;
    }

    /**
     * Annule complètement le téléchargement
     */
    public cancel(): void {
        this.isCancelled = true;
        this.isPaused = false;
        if (this.pauseResolver) {
            this.pauseResolver();
            this.pauseResolver = null;
        }
        console.log('[ModelLoader] ⛔ Téléchargement annulé');
        this.progressCallback({
            phase: 'downloading',
            progress: this.lastProgressUpdate,
            text: '⛔ Téléchargement annulé',
        });
    }

    /**
     * Vérifie si le téléchargement est annulé
     */
    public isCancelledFlag(): boolean {
        return this.isCancelled;
    }

    /**
     * Met en pause le téléchargement
     */
    public pause(): void {
        if (!this.options.allowPause || this.isPaused) return;
        this.isPaused = true;
        console.log('[ModelLoader] Téléchargement mis en pause');
        this.progressCallback({
            phase: 'downloading',
            progress: this.lastProgressUpdate,
            text: '⏸️ Téléchargement en pause',
        });
    }

    /**
     * Reprend le téléchargement
     */
    public resume(): void {
        if (!this.isPaused) return;
        this.isPaused = false;
        console.log('[ModelLoader] Reprise du téléchargement');
        if (this.pauseResolver) {
            this.pauseResolver();
            this.pauseResolver = null;
        }
    }

    /**
     * Vérifie si le téléchargement est en pause et attend si nécessaire
     */
    private async checkPause(): Promise<void> {
        // Si annulé, arrêter complètement
        if (this.isCancelled) {
            throw new Error('Download cancelled by user');
        }
        if (this.isPaused) {
            await new Promise<void>((resolve) => {
                this.pauseResolver = resolve;
            });
        }
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

                // Étape 2: Vérifier si le modèle est déjà en cache
                this.startTime = Date.now();
                const cacheCheck = await this.checkModelCache(modelId);
                
                // Étape 3: Créer le moteur avec le callback de progression
                const config: any = {
                    initProgressCallback: async (progress: any) => {
                        // Vérifier la pause avant chaque mise à jour
                        await this.checkPause();
                        
                        // Traduire le progrès de web-llm en notre propre format
                        const phase: ModelLoaderPhase = progress.text.includes('compiling') ? 'compiling' : 'downloading';
                        
                        // Calculer les métriques de téléchargement
                        const now = Date.now();
                        const progressNum = progress.progress || 0;
                        
                        let downloadedMB: number | undefined;
                        let totalMB: number | undefined;
                        let speedMBps: number | undefined;
                        let etaSeconds: number | undefined;
                        
                        if (phase === 'downloading' && progress.text) {
                            // Extraire les informations de taille depuis le texte de progression
                            const sizeMatch = progress.text.match(/(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)\s*MB/i);
                            if (sizeMatch) {
                                downloadedMB = parseFloat(sizeMatch[1]);
                                totalMB = parseFloat(sizeMatch[2]);
                                
                                // Calculer la vitesse
                                const timeDiff = (now - this.lastProgressUpdate) / 1000; // en secondes
                                if (timeDiff > 0 && this.lastDownloadedBytes > 0) {
                                    const bytesDiff = downloadedMB - this.lastDownloadedBytes;
                                    speedMBps = bytesDiff / timeDiff;
                                    
                                    // Estimer le temps restant
                                    const remainingMB = totalMB - downloadedMB;
                                    if (speedMBps > 0) {
                                        etaSeconds = remainingMB / speedMBps;
                                    }
                                }
                                
                                this.lastDownloadedBytes = downloadedMB;
                                this.lastProgressUpdate = now;
                            }
                        }
                        
                        this.progressCallback({
                            phase: phase,
                            progress: progressNum,
                            text: progress.text,
                            downloadedMB,
                            totalMB,
                            speedMBps,
                            etaSeconds,
                            isCached: cacheCheck,
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

    /**
     * Vérifie si un modèle est déjà en cache
     */
    private async checkModelCache(modelId: string): Promise<boolean> {
        try {
            console.log('[ModelLoader] 🔍 Vérification du cache pour:', modelId);
            
            // web-llm utilise plusieurs bases de données possibles
            const possibleDbNames = [
                'webllm',
                'webllm/model',
                'webllm/cache',
                'tvmjs',
                'tvmjs/model'
            ];
            
            for (const dbName of possibleDbNames) {
                try {
                    const isCached = await new Promise<boolean>((resolve) => {
                        const dbRequest = indexedDB.open(dbName);
                        
                        dbRequest.onsuccess = () => {
                            const db = dbRequest.result;
                            console.log(`[ModelLoader] 📂 Base de données "${dbName}" ouverte, stores disponibles:`, Array.from(db.objectStoreNames));
                            
                            // Chercher dans tous les object stores possibles
                            const possibleStores = ['models', 'model', 'cache', 'files', 'records'];
                            for (const storeName of possibleStores) {
                                if (db.objectStoreNames.contains(storeName)) {
                                    try {
                                        const transaction = db.transaction([storeName], 'readonly');
                                        const store = transaction.objectStore(storeName);
                                        
                                        // Essayer de compter les entrées
                                        const countRequest = store.count();
                                        countRequest.onsuccess = () => {
                                            const count = countRequest.result;
                                            console.log(`[ModelLoader] 📊 Store "${storeName}" contient ${count} entrées`);
                                            if (count > 0) {
                                                resolve(true);
                                            }
                                        };
                                    } catch (err) {
                                        // Ignorer les erreurs de transaction
                                    }
                                }
                            }
                            
                            db.close();
                            resolve(false);
                        };
                        
                        dbRequest.onerror = () => {
                            console.log(`[ModelLoader] ⚠️ Base de données "${dbName}" introuvable`);
                            resolve(false);
                        };
                        
                        // Timeout après 2 secondes
                        setTimeout(() => resolve(false), 2000);
                    });
                    
                    if (isCached) {
                        console.log(`[ModelLoader] ✅ Modèle trouvé en cache dans "${dbName}"`);
                        return true;
                    }
                } catch (err) {
                    console.warn(`[ModelLoader] Erreur lors de la vérification de "${dbName}":`, err);
                }
            }
            
            console.log('[ModelLoader] ❌ Modèle non trouvé en cache');
            return false;
        } catch (error) {
            console.warn('[ModelLoader] Impossible de vérifier le cache:', error);
            return false;
        }
    }

    private async requestPersistentStorage(): Promise<void> {
        if (!(navigator.storage && navigator.storage.persist)) {
            console.warn('[ModelLoader] ⚠️ API de stockage persistant non disponible.');
            this.progressCallback({
                phase: 'downloading',
                progress: 0.02,
                text: '⚠️ Stockage persistant non disponible',
            });
            return;
        }
        
        // Vérifier le quota de stockage
        if (navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usedMB = (estimate.usage || 0) / (1024 * 1024);
            const totalMB = (estimate.quota || 0) / (1024 * 1024);
            console.log(`[ModelLoader] 💾 Stockage: ${usedMB.toFixed(0)}MB / ${totalMB.toFixed(0)}MB utilisés`);
        }
        
        const isPersisted = await navigator.storage.persisted();
        if (isPersisted) {
            console.log('[ModelLoader] ✅ Stockage déjà persistant');
            this.progressCallback({
                phase: 'downloading',
                progress: 0.02,
                text: '💾 Stockage persistant activé - le modèle sera conservé entre les sessions',
            });
            return;
        }
        
        console.log('[ModelLoader] 🔄 Demande de stockage persistant...');
        const success = await navigator.storage.persist();
        if (success) {
            console.log('[ModelLoader] ✅ Stockage persistant accordé');
            this.progressCallback({
                phase: 'downloading',
                progress: 0.02,
                text: '💾 Stockage persistant activé - le modèle sera conservé',
            });
        } else {
            console.warn('[ModelLoader] ❌ Demande de stockage persistant refusée');
            console.warn('[ModelLoader] ℹ️ Le modèle sera téléchargé à nouveau si le navigateur vide le cache');
            this.progressCallback({
                phase: 'downloading',
                progress: 0.02,
                text: '⚠️ Stockage persistant refusé - le modèle pourrait être re-téléchargé',
            });
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
