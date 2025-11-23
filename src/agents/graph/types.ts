/**
 * Représente un nœud unique dans le Graphe de Connaissances.
 * C'est l'unité de base de la mémoire de Kensho.
 */
export interface IMemoryNode {
  id: string;
  content: string;
  embedding: Float32Array;
  type: string;
  provenanceId: string;
  version: number;
  replacesNodeId?: string;
  importance: number;
  createdAt: number;
  lastAccessedAt: number;
}

/**
 * Représente une relation (arête) entre deux nœuds.
 */
export interface IMemoryEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
  weight: number;
}

/**
 * Décrit l'origine d'un souvenir. C'est la clé de la traçabilité.
 */
export interface IProvenance {
  id: string;
  sourceType: 'user_chat' | 'document_import' | 'system_inferred' | 'self_correction';
  sourceId: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Représente une transaction atomique pour garantir la synchronisation.
 */
export interface IMemoryTransaction {
  id: string;
  nodeId: string;
  status: 'PENDING' | 'COMMITTED' | 'FAILED';
  operation: 'ADD' | 'DELETE' | 'UPDATE';
  timestamp: number;
  error?: string;
}

/**
 * Résultat d'une recherche de similarité.
 */
export interface ISearchResult {
  id: string;
  distance: number;
  node: IMemoryNode;
}

/**
 * Configuration pour le système de graphe.
 */
export interface IGraphConfig {
  embeddingDimension: number;
  maxNodesForLinearSearch: number;
  checkpointIntervalMs: number;
  dbName: string;
  storeName: string;
}

/**
 * Statistiques du système de graphe.
 */
export interface IGraphStats {
  nodeCount: number;
  edgeCount: number;
  indexReady: boolean;
  lastCheckpoint: number;
  pendingTransactions: number;
}
