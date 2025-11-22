// src/agents/universal-reader/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../core/agent-system/AgentRuntime';

/**
 * Agent de lecture universelle de documents
 * Extrait le texte de PDF et d'images
 * Dans cette version simplifiée, on simule la lecture
 */
runAgent({
    name: 'UniversalReaderAgent',
    init: (runtime: AgentRuntime) => {
        console.log('[UniversalReaderAgent] 📄 Initialisation...');
        runtime.log('info', '[UniversalReaderAgent] Prêt à lire des documents.');

        runtime.registerMethod('read', async (fileBuffer: ArrayBuffer, fileType: string) => {
            try {
                console.log('[UniversalReaderAgent] 📖 Lecture d\'un fichier de type:', fileType);
                runtime.log('info', `Lecture d'un fichier: ${fileType}, taille: ${fileBuffer.byteLength} bytes`);

                // Validation
                if (!fileBuffer || !(fileBuffer instanceof ArrayBuffer)) {
                    throw new Error('fileBuffer doit être un ArrayBuffer');
                }

                if (!fileType || typeof fileType !== 'string') {
                    throw new Error('fileType doit être une chaîne de caractères');
                }

                // Simulation de l'extraction de texte
                // Dans une vraie implémentation, on utiliserait:
                // - pdf.js pour les PDFs
                // - Tesseract.js pour l'OCR d'images
                // - Un LLM pour la génération de résumés

                const simulatedText = `[Texte extrait simulé du fichier ${fileType}]\n\nCeci est un document de démonstration. Dans une implémentation complète, ce texte proviendrait d'un vrai extracteur PDF/OCR.\n\nLe document contient plusieurs sections avec du contenu structuré...`;

                // Seuil de longueur pour décider si on résume (ex: 1000 caractères)
                const SUMMARY_THRESHOLD = 1000;
                const wasSummarized = simulatedText.length > SUMMARY_THRESHOLD;

                let summary = '';
                if (wasSummarized) {
                    // Simulation d'un résumé (dans la vraie version, appeler un LLM)
                    summary = `Résumé: ${simulatedText.substring(0, 200)}... [Document résumé car > ${SUMMARY_THRESHOLD} caractères]`;
                    runtime.log('info', 'Document résumé car trop long');
                }

                const result = {
                    fullText: simulatedText,
                    summary: wasSummarized ? summary : '',
                    wasSummarized,
                    metadata: {
                        fileType,
                        fileSize: fileBuffer.byteLength,
                        extractedAt: new Date().toISOString(),
                        textLength: simulatedText.length
                    }
                };

                console.log('[UniversalReaderAgent] ✅ Lecture terminée, résumé:', wasSummarized);
                runtime.log('info', `Extraction réussie: ${simulatedText.length} caractères extraits`);

                return result;
            } catch (error: any) {
                console.error('[UniversalReaderAgent] ❌ Erreur:', error);
                runtime.log('error', `Erreur de lecture: ${error.message}`);
                throw error;
            }
        });
    }
});
