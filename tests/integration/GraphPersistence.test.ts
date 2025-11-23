import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphWorker, IMemoryNode } from '../../src/agents/graph';

describe('Robustesse de la Persistance du Graphe de Connaissances', () => {
  let graphWorker: GraphWorker;

  beforeEach(async () => {
    graphWorker = new GraphWorker('TestKenshoDB', 'test_files');
    await graphWorker.ensureReady();
  });

  afterEach(async () => {
    await graphWorker.cleanup();
  });

  it('devrait ajouter un nœud avec succès', async () => {
    const testNode: IMemoryNode = {
      id: crypto.randomUUID(),
      content: 'Le projet Phénix est confidentiel.',
      embedding: new Float32Array(384).fill(0.5),
      type: 'user.stated',
      provenanceId: crypto.randomUUID(),
      version: 1,
      importance: 2.0,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    await graphWorker.atomicAddNode(testNode);

    const retrievedNode = await graphWorker.getNode(testNode.id);
    expect(retrievedNode).not.toBeNull();
    expect(retrievedNode?.content).toBe(testNode.content);
  });

  it('devrait effectuer une recherche sémantique', async () => {
    const embedding = new Float32Array(384).fill(0.5);
    const testNode: IMemoryNode = {
      id: crypto.randomUUID(),
      content: 'Test de recherche sémantique',
      embedding,
      type: 'user.stated',
      provenanceId: crypto.randomUUID(),
      version: 1,
      importance: 2.0,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    await graphWorker.atomicAddNode(testNode);

    const queryVector = Array.from(embedding);
    const results = await graphWorker.search(queryVector, 1);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(testNode.id);
  });

  it('devrait récupérer les statistiques du graphe', async () => {
    const stats = await graphWorker.getStats();

    expect(stats).toHaveProperty('nodeCount');
    expect(stats).toHaveProperty('edgeCount');
    expect(stats).toHaveProperty('indexReady');
    expect(stats).toHaveProperty('pendingTransactions');
  });

  it('devrait persister les données après checkpoint', async () => {
    const testNode: IMemoryNode = {
      id: crypto.randomUUID(),
      content: 'Test de persistance',
      embedding: new Float32Array(384).fill(0.7),
      type: 'system.inferred',
      provenanceId: crypto.randomUUID(),
      version: 1,
      importance: 1.5,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    await graphWorker.atomicAddNode(testNode);
    await graphWorker.checkpoint();

    const newGraphWorker = new GraphWorker('TestKenshoDB', 'test_files');
    await newGraphWorker.ensureReady();

    const retrievedNode = await newGraphWorker.getNode(testNode.id);
    expect(retrievedNode).not.toBeNull();
    expect(retrievedNode?.content).toBe(testNode.content);

    await newGraphWorker.cleanup();
  });

  it('devrait rejeter les embeddings de mauvaise dimension', async () => {
    const invalidNode: IMemoryNode = {
      id: crypto.randomUUID(),
      content: 'Test de validation de dimension',
      embedding: new Float32Array(10).fill(0.5),
      type: 'user.stated',
      provenanceId: crypto.randomUUID(),
      version: 1,
      importance: 2.0,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    await expect(graphWorker.atomicAddNode(invalidNode)).rejects.toThrow('Dimension d\'embedding invalide');

    const retrievedNode = await graphWorker.getNode(invalidNode.id);
    expect(retrievedNode).toBeNull();
    
    const stats = await graphWorker.getStats();
    expect(stats.nodeCount).toBe(0);
  });
});

describe('Test de Rechargement Brutal (Sprint 5 - Jour 3)', () => {
  it('devrait survivre à un rechargement brutal pendant une écriture', async () => {
    const testNode: IMemoryNode = {
      id: 'brutal-test-node-' + crypto.randomUUID(),
      content: 'Le projet Phénix est confidentiel.',
      embedding: new Float32Array(384).fill(0.5),
      type: 'user.stated',
      provenanceId: crypto.randomUUID(),
      version: 1,
      importance: 2.0,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    let graphWorker1 = new GraphWorker('BrutalTestDB', 'brutal_files');
    await graphWorker1.ensureReady();

    const addPromise = graphWorker1.atomicAddNode(testNode);

    await graphWorker1.cleanup();

    let graphWorker2 = new GraphWorker('BrutalTestDB', 'brutal_files');

    await Promise.all([
      addPromise.catch(() => {}),
      graphWorker2.ensureReady(),
    ]);

    const retrievedNode = await graphWorker2.getNode(testNode.id);
    const stats = await graphWorker2.getStats();

    if (retrievedNode) {
      expect(retrievedNode.content).toBe(testNode.content);
      expect(retrievedNode.id).toBe(testNode.id);
      
      const provenanceCheck = await graphWorker2.getStats();
      expect(provenanceCheck.pendingTransactions).toBe(0);
      
      const searchResults = await graphWorker2.search(Array.from(testNode.embedding), 1);
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].id).toBe(testNode.id);
    } else {
      const orphanedProvenance = stats.pendingTransactions;
      expect(orphanedProvenance).toBe(0);
    }

    await graphWorker2.cleanup();
  });

  it('devrait nettoyer les données orphelines après rollback', async () => {
    const invalidEmbedding = new Float32Array(384).fill(NaN);
    const testNode: IMemoryNode = {
      id: crypto.randomUUID(),
      content: 'Test de rollback complet',
      embedding: invalidEmbedding,
      type: 'user.stated',
      provenanceId: crypto.randomUUID(),
      version: 1,
      importance: 2.0,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    const graphWorker = new GraphWorker('RollbackTestDB', 'rollback_files');
    await graphWorker.ensureReady();

    await expect(graphWorker.atomicAddNode(testNode)).rejects.toThrow();

    const stats = await graphWorker.getStats();
    const retrievedNode = await graphWorker.getNode(testNode.id);

    expect(retrievedNode).toBeNull();
    expect(stats.nodeCount).toBe(0);
    expect(stats.pendingTransactions).toBeLessThanOrEqual(1);

    await graphWorker.cleanup();
  });
});
