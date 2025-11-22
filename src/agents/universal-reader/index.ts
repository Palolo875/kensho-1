import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { TesseractService } from '../../core/tools/TesseractService';
import { ChunkProcessor } from '../../core/processing/ChunkProcessor';
import * as pdfjsLib from 'pdfjs-dist';
import { ReadResult } from './types';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

runAgent({
    name: 'UniversalReaderAgent',
    init: (runtime: AgentRuntime) => {
        const ocrService = new TesseractService();
        const chunkProcessor = new ChunkProcessor(runtime);
        
        ocrService.initialize();

        runtime.registerMethod(
            'read',
            async (payload: { fileBuffer: ArrayBuffer, fileType: string }): Promise<ReadResult> => {
                const startTime = performance.now();
                const { fileBuffer, fileType } = payload;

                if (fileType === 'application/pdf') {
                    return await readPdf(fileBuffer);
                } else if (fileType.startsWith('image/')) {
                    return await readImage(fileBuffer);
                } else {
                    throw new Error(`Type de fichier non supporté: ${fileType}`);
                }

                async function readPdf(buffer: ArrayBuffer): Promise<ReadResult> {
                    runtime.log('info', '[Reader] Début de la lecture du PDF...');
                    const loadingTask = pdfjsLib.getDocument({ data: buffer });
                    const pdf = await loadingTask.promise;
                    const pageCount = pdf.numPages;
                    
                    let text = await extractNativeText(pdf);

                    const fileSizeMB = buffer.byteLength / (1024 * 1024);
                    const textDensity = text.length / (fileSizeMB + 0.01);

                    if (text.trim().length < 100 || textDensity < 100) {
                        runtime.log('warn', '[Reader] Faible densité de texte. Tentative de fallback OCR...');
                        
                        const firstPage = await pdf.getPage(1);
                        const viewport = firstPage.getViewport({ scale: 2.0 });
                        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
                        const context = canvas.getContext('2d');
                        
                        if (!context) {
                            throw new Error('Impossible de créer le contexte canvas pour l\'OCR');
                        }

                        await firstPage.render({
                            canvasContext: context as any,
                            viewport: viewport,
                            canvas: canvas as any
                        }).promise;

                        const blob = await canvas.convertToBlob({ type: 'image/png' });
                        const imageBuffer = await blob.arrayBuffer();
                        
                        const ocrResult = await ocrService.recognize(imageBuffer, (progress) => {
                            runtime.log('info', `[Reader] Progression OCR: ${Math.round(progress * 100)}%`);
                        });
                        
                        text = ocrResult.text;
                        
                        const processedContent = await chunkProcessor.process(text);
                        
                        return {
                            success: true,
                            fullText: processedContent.fullText,
                            summary: processedContent.summary,
                            wasSummarized: processedContent.wasSummarized,
                            metadata: {
                                method: 'pdf-ocr',
                                processingTime: performance.now() - startTime,
                                confidence: ocrResult.confidence,
                                pageCount,
                                warnings: ['Le document semble être scanné. Seule la première page a été analysée par OCR pour ce sprint.'],
                            }
                        };
                    }

                    runtime.log('info', `[Reader] PDF lu avec succès (${pageCount} pages).`);
                    
                    const processedContent = await chunkProcessor.process(text);
                    
                    return {
                        success: true,
                        fullText: processedContent.fullText,
                        summary: processedContent.summary,
                        wasSummarized: processedContent.wasSummarized,
                        metadata: {
                            method: 'pdf-native',
                            processingTime: performance.now() - startTime,
                            pageCount,
                        }
                    };
                }

                async function readImage(buffer: ArrayBuffer): Promise<ReadResult> {
                    runtime.log('info', '[Reader] Début de l\'analyse OCR...');
                    
                    const ocrResult = await ocrService.recognize(buffer, (progress) => {
                        runtime.log('info', `[Reader] Progression OCR: ${Math.round(progress * 100)}%`);
                    });

                    runtime.log('info', `[Reader] OCR terminé avec une confiance de ${ocrResult.confidence}%.`);
                    
                    const processedContent = await chunkProcessor.process(ocrResult.text);
                    
                    return {
                        success: true,
                        fullText: processedContent.fullText,
                        summary: processedContent.summary,
                        wasSummarized: processedContent.wasSummarized,
                        metadata: {
                            method: 'image-ocr',
                            processingTime: performance.now() - startTime,
                            confidence: ocrResult.confidence,
                            warnings: ocrResult.confidence < 70 ? ['La confiance de l\'OCR est faible. Le texte peut contenir des erreurs.'] : [],
                        }
                    };
                }

                async function extractNativeText(pdf: PDFDocumentProxy): Promise<string> {
                    let fullText = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page: PDFPageProxy = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items
                            .map((item: any) => ('str' in item ? item.str : ''))
                            .join(' ');
                        fullText += pageText + '\n\n';
                    }
                    return fullText;
                }
            }
        );

        runtime.log('info', 'UniversalReaderAgent initialisé et prêt.');
    }
});
