import { loadHnswlib, type HnswlibModule, type HierarchicalNSW } from 'hnswlib-wasm';
import { SQLiteManager } from './SQLiteManager';
import { createLogger } from '../../lib/logger';

const log = createLogger('HNSWManager');

const EMBEDDING_DIMENSION = 384;
const MAX_NODES_FOR_LINEAR_SEARCH = 300;

export class HNSWManager {
  private hnswlib: HnswlibModule | null = null;
  private index: HierarchicalNSW | null = null;
  private isIndexReady = false;
  private buildPromise: Promise<void> | null = null;
  private useLinearSearch = true;
  private nodeIdToLabel: Map<string, number> = new Map();
  private labelToNodeId: Map<number, string> = new Map();
  private nextLabel = 0;
  private pendingPoints: Map<string, number[]> = new Map();

  constructor(private readonly sqliteManager: SQLiteManager) {}

  public async initialize(): Promise<void> {
    log.info('Chargement du module WASM...');
    this.hnswlib = await loadHnswlib();
    
    const db = await this.sqliteManager.getDb();
    const result = db.exec('SELECT COUNT(*) FROM nodes');
    const nodeCount = (result[0]?.values[0][0] as number) || 0;

    log.info(`Nombre de nœuds: ${nodeCount}`);

    if (nodeCount > MAX_NODES_FOR_LINEAR_SEARCH) {
      log.warn(`${nodeCount} nœuds détectés. La recherche linéaire sera désactivée.`);
      log.info('Reconstruction de l\'index en arrière-plan...');
      this.useLinearSearch = false;
      this.getReadyIndex().catch(err => {
        log.error('Erreur lors de la construction de l\'index:', err as Error);
      });
    } else {
      log.info(`Peu de nœuds (${nodeCount}), utilisation du fallback linéaire.`);
    }
  }

  private async getReadyIndex(): Promise<HierarchicalNSW> {
    if (this.isIndexReady && this.index) {
      return this.index;
    }
    if (!this.buildPromise) {
      this.buildPromise = this.buildIndex();
    }
    await this.buildPromise;
    return this.index!;
  }

  private async buildIndex(): Promise<void> {
    log.info('Début de la reconstruction de l\'index HNSW...');
    const startTime = performance.now();

    if (!this.hnswlib) {
      throw new Error('[HNSWManager] Module WASM non chargé');
    }

    const db = await this.sqliteManager.getDb();
    const result = db.exec('SELECT id, embedding FROM nodes WHERE embedding IS NOT NULL');

    const pendingToAdd = new Map(this.pendingPoints);
    this.pendingPoints.clear();

    if (!result.length || !result[0].values.length) {
      this.index = new this.hnswlib.HierarchicalNSW('l2', EMBEDDING_DIMENSION, '');
      this.index.initIndex(Math.max(1, pendingToAdd.size), 16, 200, 100);
      this.index.setEfSearch(50);
      this.isIndexReady = true;
      log.info('Index vide initialisé.');

      if (pendingToAdd.size > 0) {
        for (const [nodeId, embedding] of pendingToAdd.entries()) {
          const label = this.nodeIdToLabel.get(nodeId);
          if (label !== undefined) {
            this.index.addPoint(embedding, label, false);
          }
        }
      }
      return;
    }

    const rows = result[0].values as [string, string][];
    log.info(`Chargement de ${rows.length} embeddings...`);

    this.index = new this.hnswlib.HierarchicalNSW('l2', EMBEDDING_DIMENSION, '');
    this.index.initIndex(rows.length + pendingToAdd.size, 16, 200, 100);
    this.index.setEfSearch(50);

    this.nodeIdToLabel.clear();
    this.labelToNodeId.clear();
    this.nextLabel = 0;

    for (const [nodeId, embeddingJson] of rows) {
      try {
        const embedding = JSON.parse(embeddingJson);
        const embeddingArray = Array.isArray(embedding)
          ? embedding
          : Array.from(embedding);

        const label = this.nextLabel++;
        this.nodeIdToLabel.set(nodeId, label);
        this.labelToNodeId.set(label, nodeId);

        this.index.addPoint(embeddingArray, label, false);
        pendingToAdd.delete(nodeId);
      } catch (err) {
        log.error(`Erreur lors du parsing de l'embedding pour ${nodeId}:`, err as Error);
      }
    }

    this.isIndexReady = true;

    if (pendingToAdd.size > 0) {
      log.info(`Ajout de ${pendingToAdd.size} points créés pendant le rebuild...`);
      for (const [nodeId, embedding] of pendingToAdd.entries()) {
        const label = this.nodeIdToLabel.get(nodeId);
        if (label !== undefined) {
          this.index.addPoint(embedding, label, false);
        }
      }
    }

    const duration = performance.now() - startTime;
    log.info(`Index reconstruit avec ${rows.length} éléments en ${duration.toFixed(0)}ms.`);
  }

  public async search(
    queryVector: number[],
    k: number
  ): Promise<{ id: string; distance: number }[]> {
    if (!this.isIndexReady) {
      if (this.useLinearSearch) {
        log.warn('Index non prêt, utilisation du fallback de recherche linéaire.');
        return this.linearSearch(queryVector, k);
      } else {
        log.info('Index en cours de construction, attente de la fin...');
        await this.getReadyIndex();
      }
    }

    const index = await this.getReadyIndex();
    
    if (this.labelToNodeId.size === 0) {
      return [];
    }

    const result = index.searchKnn(queryVector, Math.min(k, this.labelToNodeId.size), undefined);
    
    return Array.from(result.neighbors, (label, i) => ({
      id: this.labelToNodeId.get(label) || '',
      distance: result.distances[i],
    })).filter(r => r.id !== '');
  }

  public async addPoint(embedding: number[], nodeId: string): Promise<void> {
    const label = this.nextLabel++;
    this.nodeIdToLabel.set(nodeId, label);
    this.labelToNodeId.set(label, nodeId);
    
    if (this.isIndexReady && this.index) {
      this.index.addPoint(embedding, label, false);
      this.pendingPoints.delete(nodeId);
    } else {
      this.pendingPoints.set(nodeId, embedding);
    }
  }

  public async hasPoint(nodeId: string): Promise<boolean> {
    return this.nodeIdToLabel.has(nodeId);
  }

  public async removePoint(nodeId: string): Promise<void> {
    const label = this.nodeIdToLabel.get(nodeId);
    if (label !== undefined) {
      if (this.isIndexReady && this.index) {
        try {
          this.index.markDelete(label);
        } catch (err) {
          log.warn(`Impossible de marquer le point ${label} comme supprimé:`, err as Error);
        }
      }
      this.nodeIdToLabel.delete(nodeId);
      this.labelToNodeId.delete(label);
    }
    this.pendingPoints.delete(nodeId);
  }

  private async linearSearch(
    queryVector: number[],
    k: number
  ): Promise<{ id: string; distance: number }[]> {
    const db = await this.sqliteManager.getDb();
    const result = db.exec('SELECT id, embedding FROM nodes WHERE embedding IS NOT NULL');

    if (!result.length || !result[0].values.length) {
      return [];
    }

    const rows = result[0].values as [string, string][];
    const distances: { id: string; distance: number }[] = [];

    for (const [nodeId, embeddingJson] of rows) {
      try {
        const embedding = JSON.parse(embeddingJson);
        const embeddingArray = Array.isArray(embedding)
          ? embedding
          : Array.from(embedding);

        const distance = this.euclideanDistance(queryVector, embeddingArray);
        distances.push({ id: nodeId, distance });
      } catch (err) {
        log.error(`Erreur lors du parsing de l'embedding pour ${nodeId}:`, err as Error);
      }
    }

    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, k);
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  public isReady(): boolean {
    return this.isIndexReady;
  }

  public async rebuild(): Promise<void> {
    this.isIndexReady = false;
    this.buildPromise = null;
    await this.buildIndex();
  }
}
