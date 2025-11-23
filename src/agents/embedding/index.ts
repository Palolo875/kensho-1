import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { pipeline } from '@xenova/transformers';

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

interface EmbedRequest {
  text: string;
}

interface QueueItem {
  text: string;
  resolve: (value: number[]) => void;
  reject: (reason?: any) => void;
}

runAgent({
  name: 'EmbeddingAgent',
  init: async (runtime: AgentRuntime) => {
    let extractor: any = null;

    async function getExtractor(): Promise<any> {
      if (!extractor) {
        runtime.log('info', `[EmbeddingAgent] Chargement du modèle d'embedding: ${EMBEDDING_MODEL}...`);
        extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, {
          progress_callback: (progress: any) => {
            console.log(`[EmbeddingAgent] Chargement: ${progress.file} (${Math.round(progress.progress)}%)`);
          }
        });
        runtime.log('info', '[EmbeddingAgent] Modèle d\'embedding prêt.');
      }
      return extractor;
    }

    getExtractor();

    let embeddingQueue: QueueItem[] = [];
    let isProcessing = false;

    const processQueue = async (): Promise<void> => {
      if (isProcessing || embeddingQueue.length === 0) return;
      isProcessing = true;

      const itemsToProcess = [...embeddingQueue];
      embeddingQueue = [];

      try {
        const texts = itemsToProcess.map(item => item.text);
        console.log(`[EmbeddingAgent] Traitement d'un batch de ${texts.length} textes.`);
        const extractorInstance = await getExtractor();
        
        const embeddings = await extractorInstance(texts, { pooling: 'mean', normalize: true });

        const embeddingList = embeddings.tolist();
        embeddingList.forEach((embedding: number[], i: number) => {
          itemsToProcess[i].resolve(embedding);
        });

      } catch (error) {
        itemsToProcess.forEach(item => item.reject(error));
      } finally {
        isProcessing = false;
        if (embeddingQueue.length > 0) {
          processQueue();
        }
      }
    };

    setInterval(processQueue, 500);

    runtime.registerMethod(
      'embed',
      (payload: EmbedRequest): Promise<number[]> => {
        return new Promise((resolve, reject) => {
          embeddingQueue.push({ text: payload.text, resolve, reject });
        });
      }
    );

    runtime.log('info', '[EmbeddingAgent] Initialisé et prêt.');
  }
});
