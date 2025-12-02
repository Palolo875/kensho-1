import { SQLiteManager } from './SQLiteManager';
import { HNSWManager } from './HNSWManager';
import {
  IMemoryNode,
  IMemoryEdge,
  ISearchResult,
  IGraphStats,
} from './types';
import { createLogger } from '../../lib/logger';

const log = createLogger('GraphWorker');

/**
 * GraphWorker: Orchestrateur principal du système de Graphe de Connaissances.
 * Gère la persistance SQLite, l'indexation vectorielle HNSW, et garantit
 * la cohérence atomique entre les deux systèmes.
 */
export class GraphWorker {
  private sqliteManager: SQLiteManager;
  private hnswManager: HNSWManager;
  private isReady = false;
  private initPromise: Promise<void> | null = null;

  constructor(dbName = 'KenshoDB', storeName = 'files') {
    this.sqliteManager = new SQLiteManager(dbName, storeName);
    this.hnswManager = new HNSWManager(this.sqliteManager);
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      log.info('Initialisation du système de graphe de connaissances...');
      
      await this.sqliteManager.getDb();
      log.info('SQLite initialisé');
      
      await this.hnswManager.initialize();
      log.info('HNSW initialisé');
      
      this.isReady = true;
      log.info('Système de graphe prêt');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Échec de l\'initialisation:', err);
      throw err;
    }
  }

  public async ensureReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.isReady) {
      throw new Error('[GraphWorker] Le système n\'est pas prêt');
    }
  }

  public async atomicAddNode(node: IMemoryNode): Promise<void> {
    await this.ensureReady();
    
    if (node.embedding.length !== 384) {
      throw new Error(`Dimension d'embedding invalide: attendu 384, reçu ${node.embedding.length}`);
    }

    const db = await this.sqliteManager.getDb();
    const txId = crypto.randomUUID();

    try {
      db.run('BEGIN TRANSACTION');

      db.run(
        'INSERT INTO transactions (id, node_id, operation, status, timestamp) VALUES (?, ?, ?, ?, ?)',
        [txId, node.id, 'ADD', 'PENDING', Date.now()]
      );

      db.run(
        'INSERT INTO provenance (id, source_type, source_id, timestamp, metadata) VALUES (?, ?, ?, ?, ?)',
        [
          node.provenanceId,
          'user_chat',
          node.provenanceId,
          node.createdAt,
          JSON.stringify({}),
        ]
      );

      const embeddingJson = JSON.stringify(Array.from(node.embedding));
      db.run(
        `INSERT INTO nodes (id, content, type, provenance_id, version, replaces_node_id, 
         importance, created_at, last_accessed_at, embedding) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          node.id,
          node.content,
          node.type,
          node.provenanceId,
          node.version,
          node.replacesNodeId || null,
          node.importance,
          node.createdAt,
          node.lastAccessedAt,
          embeddingJson,
        ]
      );

      const embeddingArray = Array.from(node.embedding);
      await this.hnswManager.addPoint(embeddingArray, node.id);

      const isInHnsw = await this.hnswManager.hasPoint(node.id);
      if (!isInHnsw) {
        throw new Error(`Validation croisée échouée pour le nœud ${node.id}`);
      }

      db.run('UPDATE transactions SET status = ? WHERE id = ?', ['COMMITTED', txId]);
      
      db.run('COMMIT');
      this.sqliteManager.markAsDirty();

      log.info(`Nœud ${node.id} ajouté avec succès`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`ATOMIC FAIL TX ${txId}:`, err);

      try {
        db.run('ROLLBACK');
      } catch (rollbackError) {
        log.error('Échec du ROLLBACK:', rollbackError as Error);
      }

      await this.hnswManager.removePoint(node.id);

      this.sqliteManager.markAsDirty();

      try {
        localStorage.setItem(
          `failed_tx_${Date.now()}`,
          JSON.stringify({
            txId,
            nodeId: node.id,
            error: err.message,
          })
        );
      } catch (lsError) {
        log.error('Impossible d\'écrire dans localStorage', lsError as Error);
      }

      throw err;
    }
  }

  public async search(queryVector: number[], k: number): Promise<ISearchResult[]> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();

    const hnswResults = await this.hnswManager.search(queryVector, k);

    const results: ISearchResult[] = [];
    for (const { id, distance } of hnswResults) {
      const nodeResult = db.exec('SELECT * FROM nodes WHERE id = ?', [id]);
      if (nodeResult.length > 0 && nodeResult[0].values.length > 0) {
        const row = nodeResult[0].values[0];
        const node: IMemoryNode = {
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

        results.push({ id, distance, node });
      }
    }

    return results;
  }

  public async addEdge(edge: IMemoryEdge): Promise<void> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();

    db.run(
      'INSERT INTO edges (id, source_node_id, target_node_id, label, weight) VALUES (?, ?, ?, ?, ?)',
      [edge.id, edge.sourceNodeId, edge.targetNodeId, edge.label, edge.weight]
    );
    this.sqliteManager.markAsDirty();
  }

  public async getNode(nodeId: string): Promise<IMemoryNode | null> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();

    const result = db.exec('SELECT * FROM nodes WHERE id = ?', [nodeId]);
    if (!result.length || !result[0].values.length) {
      return null;
    }

    const row = result[0].values[0];
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

  public async getStats(): Promise<IGraphStats> {
    await this.ensureReady();
    const stats = await this.sqliteManager.getStats();

    return {
      ...stats,
      indexReady: this.hnswManager.isReady(),
      lastCheckpoint: Date.now(),
    };
  }

  public async checkpoint(): Promise<void> {
    await this.sqliteManager.checkpoint(true);
  }

  public async rebuildIndex(): Promise<void> {
    await this.ensureReady();
    await this.hnswManager.rebuild();
  }

  public async deleteNodesByTopic(topic: string): Promise<number> {
    await this.ensureReady();

    try {
      const db = await this.sqliteManager.getDb();
      
      const candidates = await this.hnswManager.search(Array.from(new Float32Array(384).fill(0.1)), 50);

      const txId = crypto.randomUUID();
      let deletedCount = 0;

      db.run('BEGIN TRANSACTION');

      for (const candidate of candidates) {
        const node = await this.getNode(candidate.id);
        if (node && candidate.distance < 0.5 && 
            (node.content.toLowerCase().includes(topic.toLowerCase()) || candidate.distance < 0.3)) {
          db.run('DELETE FROM nodes WHERE id = ?', [candidate.id]);
          db.run('DELETE FROM edges WHERE source_node_id = ? OR target_node_id = ?', [candidate.id, candidate.id]);
          await this.hnswManager.removePoint(candidate.id);
          deletedCount++;
          log.debug(`Nœud supprimé: ${candidate.id}`);
        }
      }

      db.run(
        'INSERT INTO transactions (id, node_id, operation, status, timestamp) VALUES (?, ?, ?, ?, ?)',
        [txId, 'batch-delete', 'DELETE', 'COMMITTED', Date.now()]
      );

      db.run('COMMIT');
      this.sqliteManager.markAsDirty();

      log.info(`${deletedCount} nœuds supprimés pour le sujet: ${topic}`);
      return deletedCount;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Erreur lors de la suppression:', err);
      throw err;
    }
  }

  public async cleanup(): Promise<void> {
    await this.sqliteManager.cleanup();
    this.isReady = false;
  }

  public getSQLiteManager(): SQLiteManager {
    return this.sqliteManager;
  }

  public getHNSWManager(): HNSWManager {
    return this.hnswManager;
  }

  public async createProject(name: string, goal: string = ''): Promise<string> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();
    
    const id = `proj-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = Date.now();
    
    db.run(`
      INSERT INTO projects (id, name, goal, createdAt, lastActivityAt, isArchived)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [id, name, goal, now, now]);
    
    this.sqliteManager.markAsDirty();
    log.info(`Projet créé: ${name} (${id})`);
    
    return id;
  }

  public async getProject(id: string): Promise<any | null> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();
    
    const result = db.exec(`
      SELECT id, name, goal, isArchived, createdAt, lastActivityAt
      FROM projects WHERE id = ? LIMIT 1
    `, [id]);
    
    if (!result[0] || result[0].values.length === 0) {
      return null;
    }
    
    const row = result[0].values[0];
    return {
      id: row[0],
      name: row[1],
      goal: row[2],
      isArchived: row[3],
      createdAt: row[4],
      lastActivityAt: row[5]
    };
  }

  public async getActiveProjects(): Promise<any[]> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();
    
    const result = db.exec(`
      SELECT id, name, goal, isArchived, createdAt, lastActivityAt
      FROM projects WHERE isArchived = 0
      ORDER BY lastActivityAt DESC
    `);
    
    if (!result[0]) {
      return [];
    }
    
    return result[0].values.map((row: unknown[]) => ({
      id: row[0],
      name: row[1],
      goal: row[2],
      isArchived: row[3],
      createdAt: row[4],
      lastActivityAt: row[5]
    }));
  }

  public async updateProject(id: string, updates: { name?: string; goal?: string; isArchived?: number }): Promise<void> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();
    
    const sets: string[] = [];
    const values: any[] = [];
    
    if (updates.name !== undefined) {
      sets.push('name = ?');
      values.push(updates.name);
    }
    if (updates.goal !== undefined) {
      sets.push('goal = ?');
      values.push(updates.goal);
    }
    if (updates.isArchived !== undefined) {
      sets.push('isArchived = ?');
      values.push(updates.isArchived);
    }
    
    if (sets.length === 0) return;
    
    sets.push('lastActivityAt = ?');
    values.push(Date.now());
    values.push(id);
    
    db.run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, values);
    this.sqliteManager.markAsDirty();
  }

  public async deleteProject(id: string): Promise<void> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();
    
    db.run('DELETE FROM project_tasks WHERE projectId = ?', [id]);
    db.run('DELETE FROM projects WHERE id = ?', [id]);
    
    this.sqliteManager.markAsDirty();
    log.debug(`Projet supprimé: ${id}`);
  }

  public async createTask(projectId: string, text: string): Promise<string> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();
    
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = Date.now();
    
    db.run(`
      INSERT INTO project_tasks (id, projectId, text, completed, createdAt)
      VALUES (?, ?, ?, 0, ?)
    `, [id, projectId, text, now]);
    
    db.run(`UPDATE projects SET lastActivityAt = ? WHERE id = ?`, [now, projectId]);
    
    this.sqliteManager.markAsDirty();
    log.debug(`Tâche créée pour projet ${projectId}: ${text}`);
    
    return id;
  }

  public async getProjectTasks(projectId: string): Promise<any[]> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();
    
    const result = db.exec(`
      SELECT id, projectId, text, completed, createdAt
      FROM project_tasks WHERE projectId = ?
      ORDER BY createdAt ASC
    `, [projectId]);
    
    if (!result[0]) {
      return [];
    }
    
    return result[0].values.map((row: unknown[]) => ({
      id: row[0],
      projectId: row[1],
      text: row[2],
      completed: row[3],
      createdAt: row[4]
    }));
  }

  public async toggleTask(taskId: string): Promise<void> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();
    
    db.run(`
      UPDATE project_tasks 
      SET completed = CASE WHEN completed = 0 THEN 1 ELSE 0 END
      WHERE id = ?
    `, [taskId]);
    
    const result = db.exec(`SELECT projectId FROM project_tasks WHERE id = ?`, [taskId]);
    if (result[0] && result[0].values.length > 0) {
      const projectId = result[0].values[0][0];
      db.run(`UPDATE projects SET lastActivityAt = ? WHERE id = ?`, [Date.now(), projectId]);
    }
    
    this.sqliteManager.markAsDirty();
  }

  public async deleteTask(taskId: string): Promise<void> {
    await this.ensureReady();
    const db = await this.sqliteManager.getDb();
    
    const result = db.exec(`SELECT projectId FROM project_tasks WHERE id = ?`, [taskId]);
    
    db.run('DELETE FROM project_tasks WHERE id = ?', [taskId]);
    
    if (result[0] && result[0].values.length > 0) {
      const projectId = result[0].values[0][0];
      db.run(`UPDATE projects SET lastActivityAt = ? WHERE id = ?`, [Date.now(), projectId]);
    }
    
    this.sqliteManager.markAsDirty();
    log.debug(`Tâche supprimée: ${taskId}`);
  }

  public async findEvidence(claimEmbedding: number[], k: number = 3): Promise<ISearchResult[]> {
    await this.ensureReady();
    
    if (!Array.isArray(claimEmbedding) || claimEmbedding.length !== 384) {
      log.warn(`Invalid embedding dimension: ${claimEmbedding.length}`);
      return [];
    }

    try {
      const candidates = await this.hnswManager.search(claimEmbedding, k);
      
      const enrichedResults: ISearchResult[] = [];
      
      for (const candidate of candidates) {
        const node = await this.getNode(candidate.id);
        if (node) {
          enrichedResults.push({
            id: candidate.id,
            distance: candidate.distance,
            node: {
              ...node,
              metadata: {
                content: node.content,
                type: node.type,
                importance: node.importance,
              },
            } as any,
          });
        }
      }

      log.debug(`Evidence search: ${enrichedResults.length} candidates found`);
      return enrichedResults;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Error in findEvidence:', err);
      return [];
    }
  }
}

export * from './types';
export { SQLiteManager } from './SQLiteManager';
export { HNSWManager } from './HNSWManager';
