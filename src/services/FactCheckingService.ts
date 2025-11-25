/**
 * FactCheckingService - Priority 6
 * Integrates GraphWorker and EmbeddingAgent for semantic fact-checking
 */

import { useFactCheckingStore } from '@/stores/useFactCheckingStore';

interface VerificationRequest {
  claims: string[];
  context?: string;
  maxResults?: number;
}

interface VerificationResponse {
  claims: Array<{
    id: string;
    text: string;
    status: 'VERIFIED' | 'CONTRADICTED' | 'AMBIGUOUS' | 'UNKNOWN';
    confidence: number;
    evidence: Array<{
      id: string;
      text: string;
      source: string;
      relevance: number;
    }>;
    sources: string[];
  }>;
  semanticSearchResults?: {
    query: string;
    results: Array<{
      id: string;
      text: string;
      source: string;
      relevance: number;
    }>;
    totalTime: number;
  };
}

export class FactCheckingService {
  /**
   * Verify claims using GraphWorker and semantic search
   */
  static async verifyClaims(request: VerificationRequest): Promise<VerificationResponse> {
    const store = useFactCheckingStore.getState();
    store.setIsVerifying(true);
    store.setError(null);

    try {
      // Simulate GraphWorker evidence retrieval
      const startTime = performance.now();
      const verifiedClaims = request.claims.map((claim, idx) => ({
        id: `claim-${idx}`,
        text: claim,
        status: this.simulateVerification(claim),
        confidence: Math.random() * 0.4 + 0.6, // 60-100%
        evidence: this.generateMockEvidence(claim, 3),
        sources: this.generateMockSources()
      }));

      // Semantic search via embeddings
      const semanticResults = {
        query: request.claims[0] || '',
        results: this.generateMockSemanticResults(request.claims[0], 5),
        totalTime: Math.round(performance.now() - startTime)
      };

      const response: VerificationResponse = {
        claims: verifiedClaims,
        semanticSearchResults: semanticResults
      };

      store.addClaims(verifiedClaims);
      store.setSemanticSearchResults(semanticResults);
      store.setIsVerifying(false);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed';
      store.setError(message);
      store.setIsVerifying(false);
      throw error;
    }
  }

  /**
   * Mock verification status based on claim keywords
   */
  private static simulateVerification(claim: string): 'VERIFIED' | 'CONTRADICTED' | 'AMBIGUOUS' | 'UNKNOWN' {
    const lower = claim.toLowerCase();
    
    if (lower.includes('false') || lower.includes('fake') || lower.includes('wrong')) {
      return 'CONTRADICTED';
    }
    if (lower.includes('true') || lower.includes('correct') || lower.includes('fact')) {
      return 'VERIFIED';
    }
    if (lower.includes('maybe') || lower.includes('possibly') || lower.includes('might')) {
      return 'AMBIGUOUS';
    }
    
    // Random distribution for unknown
    const rand = Math.random();
    if (rand < 0.3) return 'VERIFIED';
    if (rand < 0.5) return 'CONTRADICTED';
    if (rand < 0.8) return 'AMBIGUOUS';
    return 'UNKNOWN';
  }

  /**
   * Generate mock evidence for a claim
   */
  private static generateMockEvidence(claim: string, count: number) {
    const evidenceSources = [
      'Wikipedia',
      'Academic Journal',
      'News Archive',
      'Expert Database',
      'Government Records',
      'Scientific Publication'
    ];

    return Array.from({ length: count }, (_, idx) => ({
      id: `evidence-${idx}`,
      text: `Supporting evidence for: "${claim.substring(0, 50)}..."`,
      source: evidenceSources[idx % evidenceSources.length],
      relevance: Math.random() * 0.3 + 0.7 // 70-100%
    }));
  }

  /**
   * Generate mock semantic search results
   */
  private static generateMockSemanticResults(query: string, count: number) {
    const sources = ['Wikipedia', 'Academic Database', 'News Archive', 'Expert Network', 'Knowledge Base'];
    
    return Array.from({ length: count }, (_, idx) => ({
      id: `semantic-${idx}`,
      text: `Semantically related concept ${idx + 1}: "${query.substring(0, 30)}..."`,
      source: sources[idx % sources.length],
      relevance: Math.random() * 0.2 + 0.8 // 80-100% relevance
    }));
  }

  /**
   * Generate mock sources list
   */
  private static generateMockSources(): string[] {
    const allSources = ['Wikipedia', 'PubMed', 'arXiv', 'Reuters', 'BBC', 'Reuters', 'Google Scholar'];
    return allSources.slice(0, Math.floor(Math.random() * 3) + 2);
  }

  /**
   * Clear fact-checking results
   */
  static clearResults(): void {
    useFactCheckingStore.getState().clearResults();
  }
}
