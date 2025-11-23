import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GraphWorker } from '../../src/agents/graph';

describe('Memory System Integration Tests', () => {
  let graphWorker: GraphWorker;

  beforeAll(async () => {
    graphWorker = new GraphWorker();
    await graphWorker.ensureReady();
  });

  afterAll(async () => {
    await graphWorker.cleanup();
  });

  it('should add a memory node with atomic transaction', async () => {
    const node = {
      id: 'test-node-1',
      content: 'Test memory: AI assistants help users with tasks',
      embedding: new Float32Array(384).fill(0.5),
      type: 'user.stated',
      provenanceId: 'test-provenance-1',
      version: 1,
      importance: 0.8,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    await graphWorker.atomicAddNode(node);
    const retrieved = await graphWorker.getNode(node.id);
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.content).toBe(node.content);
    expect(retrieved?.importance).toBe(0.8);
  });

  it('should retrieve memory statistics', async () => {
    const stats = await graphWorker.getStats();
    
    expect(stats).toBeDefined();
    expect(stats.nodeCount).toBeGreaterThanOrEqual(0);
    expect(stats.indexReady).toBeDefined();
  });

  it('should handle multiple concurrent memory operations', async () => {
    const promises = Array.from({ length: 5 }, (_, i) => {
      return graphWorker.atomicAddNode({
        id: `concurrent-node-${i}`,
        content: `Concurrent memory ${i}`,
        embedding: new Float32Array(384).fill(0.1 * (i + 1)),
        type: 'user.stated',
        provenanceId: `provenance-${i}`,
        version: 1,
        importance: 0.5,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      });
    });

    await Promise.all(promises);
    const stats = await graphWorker.getStats();
    
    expect(stats.nodeCount).toBeGreaterThanOrEqual(5);
  });

  it('should persist data across graph worker recreation', async () => {
    const nodeId = 'persistence-test-node';
    await graphWorker.atomicAddNode({
      id: nodeId,
      content: 'This data should persist',
      embedding: new Float32Array(384).fill(0.7),
      type: 'user.stated',
      provenanceId: 'persistence-provenance',
      version: 1,
      importance: 0.9,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });

    const newGraphWorker = new GraphWorker();
    await newGraphWorker.ensureReady();
    
    const retrieved = await newGraphWorker.getNode(nodeId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.content).toBe('This data should persist');
    
    await newGraphWorker.cleanup();
  });
});
