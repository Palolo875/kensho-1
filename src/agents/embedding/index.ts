import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { pipeline } from '@xenova/transformers';
import { DownloadManager } from '../../core/downloads/DownloadManager';
import { createLogger } from '../../lib/logger';

const log = createLogger('EmbeddingAgent');

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DOWNLOAD_ID = 'embedding-model';

interface EmbedRequest {
  text: string;
}

interface ProgressData {
  file: string;
  progress: number;
}

interface EmbeddingExtractor {
  (texts: string[], options: { pooling: string; normalize: boolean }): Promise<{ tolist(): number[][] }>;
}

interface QueueItem {
  text: string;
  resolve: (value: number[]) => void;
  reject: (reason?: Error) => void;
}

runAgent({
  name: 'EmbeddingAgent',
  init: async (runtime: AgentRuntime) => {
    let extractor: EmbeddingExtractor | null = null;
    let isLoadingModel = false;

    async function getExtractor(): Promise<EmbeddingExtractor> {
      if (!extractor && !isLoadingModel) {
        isLoadingModel = true;
        const dm = DownloadManager.getInstance();
        dm.register(DOWNLOAD_ID, 'embedding', 'Modèle d\'embedding', (progress) => {
          log.debug(`${progress.name}: ${Math.round(progress.progress * 100)}%`);
        });

        runtime.log('info', `[EmbeddingAgent] Chargement du modèle d'embedding: ${EMBEDDING_MODEL}...`);
        log.info(`Chargement du modèle: ${EMBEDDING_MODEL}`);
        try {
          extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, {
            progress_callback: (progress: ProgressData) => {
              if (dm.isPaused(DOWNLOAD_ID)) {
                dm.waitIfPaused(DOWNLOAD_ID);
              }
              log.debug(`Chargement: ${progress.file} (${Math.round(progress.progress)}%)`);
              dm.updateProgress(DOWNLOAD_ID, {
                id: DOWNLOAD_ID,
                type: 'embedding',
                name: 'Modèle d\'embedding',
                status: 'downloading',
                progress: progress.progress / 100,
              });
            }
          }) as EmbeddingExtractor;
          runtime.log('info', '[EmbeddingAgent] Modèle d\'embedding prêt.');
          log.info('Modèle d\'embedding prêt.');
          dm.unregister(DOWNLOAD_ID);
        } catch (error) {
          isLoadingModel = false;
          dm.unregister(DOWNLOAD_ID);
          const err = error instanceof Error ? error : new Error(String(error));
          log.error('Erreur modèle:', err);
          throw err;
        }
      }
      if (!extractor) {
        throw new Error('Extractor not available');
      }
      return extractor;
    }

    let embeddingQueue: QueueItem[] = [];
    let isProcessing = false;

    const processQueue = async (): Promise<void> => {
      if (isProcessing || embeddingQueue.length === 0) return;
      isProcessing = true;

      const itemsToProcess = [...embeddingQueue];
      embeddingQueue = [];

      try {
        const texts = itemsToProcess.map(item => item.text);
        log.info(`Traitement d'un batch de ${texts.length} textes.`);
        const extractorInstance = await getExtractor();
        
        const embeddings = await extractorInstance(texts, { pooling: 'mean', normalize: true });

        const embeddingList = embeddings.tolist();
        embeddingList.forEach((embedding: number[], i: number) => {
          itemsToProcess[i].resolve(embedding);
        });

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        itemsToProcess.forEach(item => item.reject(err));
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
          embeddingQueue.push({
            text: payload.text,
            resolve,
            reject
          });
        });
      }
    );
  }
});
