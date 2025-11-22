import { AgentRuntime } from '../agent-system/AgentRuntime';

/**
 * Gère le découpage et le résumé de textes longs pour qu'ils puissent
 * être traités par des LLM avec une fenêtre de contexte limitée.
 */
export class ChunkProcessor {
    // ~3000 tokens, avec une marge de sécurité. 1 token ~= 4 caractères.
    private readonly MAX_CHUNK_LENGTH = 3000 * 3;

    constructor(private readonly runtime: AgentRuntime) {}

    /**
     * Traite un texte. Si le texte est court, il le retourne.
     * Si le texte est long, il le découpe et génère un résumé.
     * @param fullText Le texte complet à traiter.
     * @returns Un objet contenant le texte complet et un résumé si nécessaire.
     */
    public async process(fullText: string): Promise<{ fullText: string; summary?: string; wasSummarized: boolean }> {
        if (fullText.length <= this.MAX_CHUNK_LENGTH) {
            return { fullText, wasSummarized: false };
        }

        this.runtime.log('info', `[ChunkProcessor] Texte trop long (${fullText.length} chars). Début du processus de résumé Map-Reduce.`);

        // Étape 1 : Découper intelligemment en chunks
        const chunks = this.splitIntoChunks(fullText);
        this.runtime.log('info', `[ChunkProcessor] Texte découpé en ${chunks.length} chunks.`);

        // Étape 2 : Résumer chaque chunk en parallèle (MAP)
        const summaryPromises = chunks.map((chunk, i) =>
            this.summarizeChunk(chunk, i + 1, chunks.length)
        );
        const chunkSummaries = await Promise.all(summaryPromises);

        // Étape 3 : Combiner les résumés et faire un résumé final (REDUCE)
        const combinedSummaries = chunkSummaries.join('\n\n---\n\n');
        const finalSummary = await this.summarizeFinal(combinedSummaries);

        this.runtime.log('info', `[ChunkProcessor] Résumé final généré.`);

        return {
            fullText, // On garde le texte complet au cas où
            summary: finalSummary,
            wasSummarized: true,
        };
    }

    private splitIntoChunks(text: string): string[] {
        const paragraphs = text.split(/(\r\n|\n){2,}/).filter(p => p.trim() !== '');
        const chunks: string[] = [];
        let currentChunk = '';

        for (const para of paragraphs) {
            if ((currentChunk.length + para.length + 2) > this.MAX_CHUNK_LENGTH) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                }
                currentChunk = para;
            } else {
                currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + para;
            }
        }
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        return chunks;
    }

    private async summarizeChunk(chunk: string, index: number, total: number): Promise<string> {
        const prompt = `Ceci est le fragment ${index}/${total} d'un document plus long. Résume les points clés de ce fragment de manière concise. Ne conclus pas, reste factuel sur ce fragment.\n\nFragment:\n"""\n${chunk}\n"""`;
        return this.runtime.callAgent('MainLLMAgent', 'generateSingleResponse', [prompt]);
    }

    private async summarizeFinal(combinedSummaries: string): Promise<string> {
        const prompt = `Voici une série de résumés partiels d'un long document. Ta mission est de les synthétiser en un résumé global cohérent et bien structuré.\n\nRésumés partiels:\n"""\n${combinedSummaries}\n"""\n\nRésumé global:`;
        return this.runtime.callAgent('MainLLMAgent', 'generateSingleResponse', [prompt]);
    }
}
