/**
 * useFactCheckingStore - Priority 6
 * Manages fact-checking state and results
 */

import { create } from 'zustand';

interface VerificationClaim {
  id: string;
  text: string;
  status: 'VERIFIED' | 'CONTRADICTED' | 'AMBIGUOUS' | 'UNKNOWN';
  confidence: number;
  evidence: Array<{
    id: string;
    text: string;
    source: string;
    relevance: number;
    embedding?: number[];
  }>;
  sources: string[];
}

interface SemanticSearchResult {
  query: string;
  results: Array<{
    id: string;
    text: string;
    source: string;
    relevance: number;
    embedding?: number[];
  }>;
  totalTime: number;
}

interface FactCheckingState {
  claims: VerificationClaim[];
  semanticSearchResults: SemanticSearchResult | null;
  isVerifying: boolean;
  error: string | null;

  // Actions
  addClaims: (claims: VerificationClaim[]) => void;
  updateClaim: (id: string, claim: Partial<VerificationClaim>) => void;
  setSemanticSearchResults: (results: SemanticSearchResult) => void;
  setIsVerifying: (isVerifying: boolean) => void;
  setError: (error: string | null) => void;
  clearResults: () => void;
}

export const useFactCheckingStore = create<FactCheckingState>((set) => ({
  claims: [],
  semanticSearchResults: null,
  isVerifying: false,
  error: null,

  addClaims: (claims) => set((state) => ({
    claims: [...state.claims, ...claims]
  })),

  updateClaim: (id, claim) => set((state) => ({
    claims: state.claims.map(c => c.id === id ? { ...c, ...claim } : c)
  })),

  setSemanticSearchResults: (results) => set({ semanticSearchResults: results }),

  setIsVerifying: (isVerifying) => set({ isVerifying }),

  setError: (error) => set({ error }),

  clearResults: () => set({
    claims: [],
    semanticSearchResults: null,
    error: null
  })
}));
