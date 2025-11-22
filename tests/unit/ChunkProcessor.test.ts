import { describe, it, expect, vi } from 'vitest';
import { ChunkProcessor } from '../../src/core/processing/ChunkProcessor';

const mockRuntime = {
    log: vi.fn(),
    callAgent: vi.fn(async (agent, method, [prompt]) => {
        if (prompt.includes('Fragment')) {
            return `Résumé du fragment.`;
        }
        if (prompt.includes('global')) {
            return 'Résumé global final.';
        }
        return '';
    }),
};

describe('ChunkProcessor', () => {
    it('devrait retourner le texte complet si il est court', async () => {
        const processor = new ChunkProcessor(mockRuntime as any);
        const shortText = "Ceci est un texte court.";
        const result = await processor.process(shortText);

        expect(result.wasSummarized).toBe(false);
        expect(result.summary).toBeUndefined();
        expect(result.fullText).toBe(shortText);
        expect(mockRuntime.callAgent).not.toHaveBeenCalled();
    });

    it('devrait exécuter le processus Map-Reduce pour un texte long', async () => {
        const processor = new ChunkProcessor(mockRuntime as any);
        const longText = "Paragraphe 1.".repeat(500) + "\n\n" + "Paragraphe 2.".repeat(500);
        
        mockRuntime.callAgent.mockClear();
        const result = await processor.process(longText);

        expect(result.wasSummarized).toBe(true);
        expect(result.summary).toBe('Résumé global final.');
        expect(mockRuntime.callAgent).toHaveBeenCalled();
        expect(mockRuntime.callAgent.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
});
