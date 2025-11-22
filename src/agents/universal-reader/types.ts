export interface ReadResult {
    success: boolean;
    fullText: string;
    summary?: string;
    wasSummarized: boolean;
    metadata: {
        method: 'pdf-native' | 'pdf-ocr' | 'image-ocr';
        processingTime: number; // ms
        confidence?: number; // Pour OCR (0-100)
        pageCount?: number; // Pour PDF
        warnings?: string[];
    };
}
