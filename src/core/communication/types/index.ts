// src/core/communication/types/index.ts

/**
 * Le nom unique d'un agent/worker dans la constellation.
 * @example 'PingAgent', 'OrionGuardian', 'MainThread'
 */
export type WorkerName = string;

/**
 * Représente une erreur sérialisée qui peut être transmise en toute sécurité
 * entre les workers, en préservant les informations essentielles.
 */
export interface SerializedError {
  message: string;
  stack?: string;
  name: string;
  code?: string;
}

/**
 * Le format standard et immuable de tous les messages échangés dans Kensho.
 * Chaque message est une enveloppe contenant des métadonnées de routage et une charge utile.
 */
export interface KenshoMessage<T = any> {
  /** Identifiant unique de ce message spécifique (UUID v4), généré à l'envoi. */
  readonly messageId: string;
  /** Identifiant de la transaction globale, pour suivre une requête de bout en bout. */
  readonly traceId: string;
  /** Le nom du worker qui envoie le message. */
  readonly sourceWorker: WorkerName;
  /** Le nom du worker destinataire. */
  readonly targetWorker: WorkerName;
  /** Le type de message, qui détermine comment il est traité. */
  readonly type: 'request' | 'response' | 'broadcast';
  /** La charge utile (payload) du message. */
  readonly payload: T;
  /** Pour les réponses, l'ID du message de la requête originale. */
  readonly responseFor?: string;
  /** En cas d'erreur dans le traitement d'une requête, ce champ contiendra l'erreur sérialisée. */
  readonly error?: SerializedError;
}

/**
 * La signature d'une fonction capable de gérer une requête entrante.
 * Elle reçoit la charge utile et doit retourner une réponse (ou une promesse de réponse).
 */
export type RequestHandler = (payload: any) => Promise<any> | any;

export interface AnnouncePayload {
  workerName: WorkerName;
}

export interface HeartbeatPayload {
  epochId: number;
}

// On pourrait créer un type uni pour les messages système
export type SystemPayload = AnnouncePayload | HeartbeatPayload | { type: 'ELECTION' } | { type: 'NEW_LEADER' };
