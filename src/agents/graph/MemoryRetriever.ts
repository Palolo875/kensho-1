import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { HNSWManager } from './HNSWManager';
import { SQLiteManager } from './SQLiteManager';
import { IMemoryNode } from './types';

const RECALL_WIDTH = 20;
const FINAL_K = 3;

export class MemoryRetriever {
  constructor(
    private runtime: AgentRuntime,
    private sqliteManager: SQLiteManager,
    private hnswManager: HNSWManager
  ) {}

  public async retrieve(query: string): Promise<IMemoryNode[]> {
    const startTime = performance.now();

    const queryEmbedding = await this.runtime.callAgent<number[]>(
      'EmbeddingAgent', 'embed', [{ text: query }]
    );

    const candidates = await this.hnswManager.search(queryEmbedding, RECALL_WIDTH);
    if (candidates.length === 0) return [];

    const db = await this.sqliteManager.getDb();
    const placeholders = candidates.map(() => '?').join(',');
    const result = db.exec(`
      SELECT * FROM nodes WHERE id IN (${placeholders})
    `, candidates.map(c => c.id));

    if (!result.length || !result[0].values.length) {
      return [];
    }

    const rows = result[0].values;
    const enrichedCandidates = rows.map(row => this.rowToNode(row));
    
    const candidateMap = new Map(enrichedCandidates.map(node => [node.id, node]));
    const candidatesWithDistance = candidates.map(c => ({
      node: candidateMap.get(c.id),
      distance: c.distance
    })).filter(c => c.node) as { node: IMemoryNode; distance: number }[];

    const rankedCandidates = candidatesWithDistance.map(c => {
      const recencyScore = this.calculateRecencyScore(c.node.createdAt);
      const importanceScore = c.node.importance;
      const similarityScore = 1 / (1 + c.distance);

      const compositeScore = 
        (similarityScore * 0.6) + 
        (recencyScore * 0.2) + 
        (importanceScore * 0.2);
      
      return { node: c.node, score: compositeScore };
    });

    // Grouper par replaces_node_id pour ne garder que la version la plus récente
    const versionedMap = new Map<string, { node: any; score: number; baseId: string }>();
    
    for (const rc of rankedCandidates) {
      const baseId = rc.node.replacesNodeId || rc.node.id;
      const existing = versionedMap.get(baseId);
      
      if (!existing || rc.node.version > existing.node.version) {
        versionedMap.set(baseId, { node: rc.node, score: rc.score, baseId });
      }
    }

    const finalMemories = Array.from(versionedMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, FINAL_K)
      .map(r => r.node);

    this.runtime.log('info', `[MemoryRetriever] Récupération de ${finalMemories.length} souvenirs en ${performance.now() - startTime}ms.`);
    return finalMemories;
  }

  private calculateRecencyScore(createdAt: number): number {
    const ageInDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
    return Math.exp(-ageInDays / 30);
  }

  private rowToNode(row: any[]): IMemoryNode {
    return {
      id: row[0] as string,
      content: row[1] as string,
      type: row[2] as string,
      provenanceId: row[3] as string,
      version: row[4] as number,
      replacesNodeId: (row[5] as string) || undefined,
      importance: row[6] as number,
      createdAt: row[7] as number,
      lastAccessedAt: row[8] as number,
      embedding: new Float32Array(JSON.parse(row[9] as string)),
    };
  }
}
