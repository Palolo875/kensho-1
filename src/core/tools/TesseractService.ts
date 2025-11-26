import { createWorker, Worker } from 'tesseract.js';
import { createLogger } from '../../lib/logger';

const log = createLogger('TesseractService');

export class TesseractService {
    private worker: Worker | null = null;
    private initPromise: Promise<void> | null = null;

    public async initialize(): Promise<void> {
        if (this.worker) return;
        
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.doInitialize();
        return this.initPromise;
    }

    private async doInitialize(): Promise<void> {
        log.info('Initialisation du worker OCR...');
        try {
            this.worker = await createWorker('fra+eng', 1, {
                logger: (m: any) => {
                    if (m.status === 'recognizing text' && typeof m.progress === 'number') {
                        log.info(`Progression OCR: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            log.info('Worker OCR prêt.');
            this.initPromise = null;
        } catch (error) {
            log.error('Échec de l\'initialisation du worker OCR', error as Error);
            this.worker = null;
            this.initPromise = null;
            throw error;
        }
    }

    public async recognize(imageBuffer: ArrayBuffer): Promise<{ text: string; confidence: number }> {
        if (!this.worker) {
            await this.initialize();
            if (!this.worker) throw new Error('Le service OCR n\'a pas pu être initialisé.');
        }

        const result = await this.worker.recognize(imageBuffer as any);
        return { text: result.data.text, confidence: result.data.confidence };
    }

    public async dispose(): Promise<void> {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.initPromise = null;
            log.info('Worker OCR terminé.');
        }
    }
}
