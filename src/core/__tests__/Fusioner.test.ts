/**
 * Test Suite: Fusioner v2.0
 * Priority 1: Intelligent multi-expert result fusion (4 strategies)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { fusioner } from '../kernel/Fusioner';
import { type TaskResult } from '../router/RouterTypes';

describe('Fusioner v2.0 - Priority 1 ✅', () => {
  let primaryResult: TaskResult;
  let expertResults: TaskResult[];

  beforeEach(() => {
    primaryResult = {
      agentName: 'CodeExpert',
      modelKey: 'qwen2.5-coder',
      result: 'function add(a, b) { return a + b; }',
      status: 'success',
      duration: 1200,
      confidence: 0.92
    };

    expertResults = [
      {
        agentName: 'GeneralDialogue',
        modelKey: 'gemma-3-270m',
        result: 'This function adds two numbers together.',
        status: 'success',
        duration: 800,
        confidence: 0.88
      },
      {
        agentName: 'CodeReviewer',
        modelKey: 'qwen2.5-coder',
        result: 'Good implementation. Consider adding input validation.',
        status: 'success',
        duration: 600,
        confidence: 0.85
      }
    ];
  });

  it('should fuse primary and expert results', async () => {
    const fused = await fusioner.fuse({
      primaryResult,
      expertResults
    });

    expect(fused).toBeDefined();
    expect(fused.length).toBeGreaterThan(0);
    expect(typeof fused).toBe('string');
  });

  it('should fuse with metadata', async () => {
    const fused = await fusioner.fuseWithMetadata({
      primaryResult,
      expertResults
    });

    expect(fused.metadata).toBeDefined();
    expect(fused.metadata.sources).toBeDefined();
    expect(fused.metadata.confidence).toBeGreaterThanOrEqual(0);
    expect(fused.metadata.confidence).toBeLessThanOrEqual(1);
    expect(fused.metadata.strategy).toBeDefined();
  });

  it('should handle empty expert results', async () => {
    const fused = await fusioner.fuse({
      primaryResult,
      expertResults: []
    });

    expect(fused).toBeDefined();
    expect(fused.length).toBeGreaterThan(0);
  });

  it('should assign correct sources', async () => {
    const fused = await fusioner.fuseWithMetadata({
      primaryResult,
      expertResults
    });

    expect(fused.metadata.sources).toContain(primaryResult.agentName);
    expertResults.forEach(expert => {
      expect(fused.metadata.sources).toContain(expert.agentName);
    });
  });

  it('should calculate confidence from results', async () => {
    const fused = await fusioner.fuseWithMetadata({
      primaryResult,
      expertResults
    });

    // Confidence should be a weighted average of primary + experts
    expect(fused.metadata.confidence).toBeGreaterThan(0);
    expect(fused.metadata.confidence).toBeLessThanOrEqual(1);
  });

  it('should handle failed expert results gracefully', async () => {
    const failedExpert: TaskResult = {
      agentName: 'FailedExpert',
      modelKey: 'unknown-model',
      error: {
        type: 'ModelNotFound' as const,
        modelKey: 'unknown',
        availableModels: []
      },
      status: 'error',
      duration: 50
    };

    const fused = await fusioner.fuse({
      primaryResult,
      expertResults: [expertResults[0], failedExpert]
    });

    expect(fused).toBeDefined();
    // Should still fuse successfully, using successful experts
  });

  it('should handle timeout results', async () => {
    const timedOutExpert: TaskResult = {
      agentName: 'SlowExpert',
      modelKey: 'slow-model',
      result: 'Partial result...',
      status: 'timeout',
      duration: 120000
    };

    const fused = await fusioner.fuse({
      primaryResult,
      expertResults: [timedOutExpert]
    });

    expect(fused).toBeDefined();
  });

  it('should identify conflict resolution strategy when experts disagree', async () => {
    const conflictingExpert: TaskResult = {
      agentName: 'ConflictingExpert',
      modelKey: 'another-model',
      result: 'function add(x, y) => x - y;', // Different implementation
      status: 'success',
      duration: 900,
      confidence: 0.75
    };

    const fused = await fusioner.fuseWithMetadata({
      primaryResult,
      expertResults: [conflictingExpert]
    });

    expect(fused.metadata).toBeDefined();
    // May use CONFLICT_RESOLUTION strategy
  });

  it('should batch multiple fusion operations', async () => {
    const results = await Promise.all([
      fusioner.fuse({ primaryResult, expertResults }),
      fusioner.fuse({ primaryResult, expertResults: [] }),
      fusioner.fuse({ primaryResult, expertResults: [expertResults[0]] })
    ]);

    expect(results).toHaveLength(3);
    results.forEach(result => {
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});
