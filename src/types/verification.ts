/**
 * Types de vérification de faits
 * Utilisés par FactCheckerAgent et GraphWorker
 */

export interface Evidence {
  sourceNodeId: string;
  content: string;
  // La 'nuance' sera extraite par le LLM de vérification si le contexte est important
  nuance?: string;
}

export interface VerificationResult {
  claim: string;
  status: 'VERIFIED' | 'CONTRADICTED' | 'AMBIGUOUS' | 'UNKNOWN';
  // Score de 0.0 à 1.0, basé sur la similarité sémantique du meilleur candidat
  confidenceScore: number;
  // La preuve principale qui supporte ou contredit le claim
  evidence: Evidence | null;
  // Preuves additionnelles en cas d'ambiguïté ou de contradiction
  contradictoryEvidence?: Evidence[];
}
