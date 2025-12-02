// src/core/models/ModelLoader.ts
import * as webllm from '@mlc-ai/web-llm';
import { createLogger } from '../../lib/logger';

const log = createLogger('ModelLoader');

export type ModelLoaderPhase = 'idle' | 'checking_gpu' | 'downloading' | 'compiling' | 'ready' | 'error';

export interface ModelLoaderProgress {
    phase: ModelLoaderPhase;
    progress: number;
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

    public cancel(): void {
        this.isCancelled = true;
        this.isPaused = false;
        if (this.pauseResolver) {
            this.pauseResolver();
            this.pauseResolver = null;
        }
        log.info('Téléchargement annulé');
        this.progressCallback({
            phase: 'downloading',
            progress: this.lastProgressUpdate,
            text: 'Téléchargement annulé',
        });
    }

    public isCancelledFlag(): boolean {
        return this.isCancelled;
    }

    public pause(): void {
        if (!this.options.allowPause || this.isPaused) return;
        this.isPaused = true;
        log.info('Téléchargement mis en pause');
        this.progressCallback({
            phase: 'downloading',
            progress: this.lastProgressUpdate,
            text: 'Téléchargement en pause',
        });
    }

    public resume(): void {
        if (!this.isPaused) return;
        this.isPaused = false;
        log.info('Reprise du téléchargement');
        if (this.pauseResolver) {
            this.pauseResolver();
            this.pauseResolver = null;
        }
    }

    private async checkPause(): Promise<void> {
        if (this.isCancelled) {
            throw new Error('Download cancelled by user');
        }
        if (this.isPaused) {
            await new Promise<void>((resolve) => {
                this.pauseResolver = resolve;
            });
        }
    }

    private async checkWebGPUAvailability(): Promise<boolean> {
        this.progressCallback({
            phase: 'checking_gpu',
            progress: 0.05,
            text: 'Vérification de la disponibilité WebGPU...',
        });

        const nav = navigator as any;
        if (!nav.gpu) {
            log.warn('WebGPU n\'est pas disponible dans ce navigateur');
            return false;
        }

        try {
            const adapter = await nav.gpu.requestAdapter();
            if (!adapter) {
                log.warn('Impossible d\'obtenir un adaptateur WebGPU');
                return false;
            }
            log.info('WebGPU est disponible et prêt');
            return true;
        } catch (error) {
            log.warn('Erreur lors de la vérification WebGPU:', error as Error);
            return false;
        }
    }

    public async loadModel(modelId: string): Promise<void> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
            try {
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

                await this.requestPersistentStorage();

                this.startTime = Date.now();
                const cacheCheck = await this.checkModelCache(modelId);
                
                const config: webllm.EngineConfig = {
                    initProgressCallback: async (progress: webllm.InitProgressReport) => {
                        await this.checkPause();
                        
                        const phase: ModelLoaderPhase = progress.text.includes('compiling') ? 'compiling' : 'downloading';
                        const now = Date.now();
                        const progressNum = progress.progress || 0;
                        
                        let downloadedMB: number | undefined;
                        let totalMB: number | undefined;
                        let speedMBps: number | undefined;
                        let etaSeconds: number | undefined;
                        
                        if (phase === 'downloading' && progress.text) {
                            const sizeMatch = progress.text.match(/(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)\s*MB/i);
                            if (sizeMatch) {
                                downloadedMB = parseFloat(sizeMatch[1]);
                                totalMB = parseFloat(sizeMatch[2]);
                                
                                const timeDiff = (now - this.lastProgressUpdate) / 1000;
                                if (timeDiff > 0 && this.lastDownloadedBytes > 0) {
                                    const bytesDiff = downloadedMB - this.lastDownloadedBytes;
                                    speedMBps = bytesDiff / timeDiff;
                                    
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
                            phase,
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
                log.info('Modèle chargé avec succès');
                return;

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                log.error(`Tentative ${attempt}/${this.options.maxRetries} échouée:`, lastError);

                if (attempt === this.options.maxRetries) {
                    const errorMessage = lastError.message;
                    this.progressCallback({ 
                        phase: 'error', 
                        progress: 0, 
                        text: `Échec après ${this.options.maxRetries} tentatives: ${errorMessage}` 
                    });
                    throw lastError;
                }

                this.progressCallback({
                    phase: 'downloading',
                    progress: 0.05,
                    text: `Erreur réseau, nouvelle tentative dans ${this.options.retryDelay / 1000}s... (${attempt}/${this.options.maxRetries})`,
                });

                await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
            }
        }

        if (lastError) {
            throw lastError;
        }
    }

    private async checkModelCache(modelId: string): Promise<boolean> {
        try {
            log.debug(`Vérification du cache pour: ${modelId}`);
            
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
                            log.debug(`Base de données "${dbName}" ouverte`);
                            
                            const possibleStores = ['models', 'model', 'cache', 'files', 'records'];
                            for (const storeName of possibleStores) {
                                if (db.objectStoreNames.contains(storeName)) {
                                    try {
                                        const transaction = db.transaction([storeName], 'readonly');
                                        const store = transaction.objectStore(storeName);
                                        
                                        const countRequest = store.count();
                                        countRequest.onsuccess = () => {
                                            const count = countRequest.result;
                                            log.debug(`Store "${storeName}" contient ${count} entrées`);
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
                            log.debug(`Base de données "${dbName}" introuvable`);
                            resolve(false);
                        };
                        
                        setTimeout(() => resolve(false), 2000);
                    });
                    
                    if (isCached) {
                        log.info(`Modèle trouvé en cache dans "${dbName}"`);
                        return true;
                    }
                } catch (err) {
                    log.warn(`Erreur lors de la vérification de "${dbName}":`, err as Error);
                }
            }
            
            log.debug('Modèle non trouvé en cache');
            return false;
        } catch (error) {
            log.warn('Impossible de vérifier le cache:', error as Error);
            return false;
        }
    }

    private async requestPersistentStorage(): Promise<void> {
        if (!(navigator.storage && navigator.storage.persist)) {
            log.warn('API de stockage persistant non disponible');
            this.progressCallback({
                phase: 'downloading',
                progress: 0.02,
                text: 'Stockage persistant non disponible',
            });
            return;
        }
        
        if (navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usedMB = (estimate.usage || 0) / (1024 * 1024);
            const totalMB = (estimate.quota || 0) / (1024 * 1024);
            log.debug(`Stockage: ${usedMB.toFixed(0)}MB / ${totalMB.toFixed(0)}MB utilisés`);
        }
        
        const isPersisted = await navigator.storage.persisted();
        if (isPersisted) {
            log.info('Stockage déjà persistant');
            this.progressCallback({
                phase: 'downloading',
                progress: 0.02,
                text: 'Stockage persistant activé - le modèle sera conservé entre les sessions',
            });
            return;
        }
        
        log.debug('Demande de stockage persistant...');
        const success = await navigator.storage.persist();
        if (success) {
            log.info('Stockage persistant accordé');
            this.progressCallback({
                phase: 'downloading',
                progress: 0.02,
                text: 'Stockage persistant activé - le modèle sera conservé',
            });
        } else {
            log.warn('Demande de stockage persistant refusée');
            log.warn('Le modèle sera téléchargé à nouveau si le navigateur vide le cache');
            this.progressCallback({
                phase: 'downloading',
                progress: 0.02,
                text: 'Stockage persistant refusé - le modèle pourrait être re-téléchargé',
            });
        }
    }

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
