import { createWorker, Worker } from 'tesseract.js';

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
        console.log('[TesseractService] Initialisation du worker OCR...');
        try {
            this.worker = await createWorker('fra+eng', 1, {
                logger: (m: any) => {
                    if (m.status === 'recognizing text' && typeof m.progress === 'number') {
                        console.log(`[TesseractService] Progression OCR: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            console.log('[TesseractService] Worker OCR prêt.');
            this.initPromise = null;
        } catch (error) {
            console.error('[TesseractService] Échec de l\'initialisation du worker OCR', error);
            this.worker = null;
            this.initPromise = null;
            throw error;
        }
    }

    public async recognize(imageBuffer: ArrayBuffer, progressCallback: (p: number) => void): Promise<{ text: string; confidence: number }> {
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
            console.log('[TesseractService] Worker OCR terminé.');
        }
    }
}
