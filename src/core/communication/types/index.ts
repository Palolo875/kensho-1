// src/core/communication/types/index.ts

/**
 * Le nom unique d'un agent/worker dans la constellation.
 * @example 'PingAgent', 'OrionGuardian', 'MainThread'
 */
export type WorkerName = string;

/**
 * Valide un nom de worker pour s'assurer qu'il ne contient que des caractères alphanumériques,
 * underscores et tirets. Cela évite les problèmes de sécurité et de parsing.
 * 
 * @param name - Le nom du worker à valider
 * @returns true si le nom est valide, false sinon
 */
export function isValidWorkerName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  // Accepte uniquement: lettres, chiffres, underscores, tirets
  // Doit commencer par une lettre
  const regex = /^[A-Za-z][A-Za-z0-9_-]*$/;
  return regex.test(name) && name.length <= 64; // Limite de longueur raisonnable
}

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
 * Métadonnées optionnelles pour enrichir un message.
 * Utile pour le debugging, le monitoring et l'analyse de performance.
 */
export interface MessageMetadata {
  /** Timestamp de création du message (epoch en millisecondes). */
  timestamp?: number;
  /** Informations custom spécifiques à l'application. */
  custom?: Record<string, unknown>;
}

/**
 * Le format standard et immuable de tous les messages échangés dans Kensho.
 * Chaque message est une enveloppe contenant des métadonnées de routage et une charge utile.
 */
export interface KenshoMessage<T = unknown> {
  /** Identifiant unique de ce message spécifique (UUID v4), généré à l'envoi. */
  readonly messageId: string;
  /** Identifiant de la transaction globale, pour suivre une requête de bout en bout. Optionnel. */
  readonly traceId?: string;
  /** Le nom du worker qui envoie le message. */
  readonly sourceWorker: WorkerName;
  /** Le nom du worker destinataire. */
  readonly targetWorker: WorkerName;
  /** Le type de message, qui détermine comment il est traité. */
  readonly type: 'request' | 'response' | 'broadcast' | 'stream_request' | 'stream_chunk' | 'stream_end' | 'stream_error' | 'stream_cancel';
  /** La charge utile (payload) du message. */
  readonly payload: T;
  /** Pour les réponses, l'ID du message de la requête originale (correlation ID). */
  readonly correlationId?: string;
  /** @deprecated Utiliser correlationId à la place. Conservé pour compatibilité. */
  readonly responseFor?: string;
  /** Pour les messages de stream, l'ID unique du flux de données. */
  readonly streamId?: string;
  /** En cas d'erreur dans le traitement d'une requête, ce champ contiendra l'erreur sérialisée. */
  readonly error?: SerializedError;
  /** Métadonnées optionnelles pour le debugging et le monitoring. */
  readonly metadata?: MessageMetadata;
}

/**
 * La signature d'une fonction capable de gérer une requête entrante.
 * Elle reçoit la charge utile et doit retourner une réponse (ou une promesse de réponse).
 */
export type RequestHandler = (payload: unknown) => Promise<unknown> | unknown;

export interface AnnouncePayload {
  workerName: WorkerName;
}

export interface HeartbeatPayload {
  epochId: number;
}

// On pourrait créer un type uni pour les messages système
export type SystemPayload = AnnouncePayload | HeartbeatPayload | { type: 'ELECTION' } | { type: 'NEW_LEADER' };

// Un message ELECTION est envoyé pour démarrer un vote.
export interface ElectionPayload {
  candidateId: WorkerName;
}

// Un message ALIVE est une réponse à un message ELECTION.
export interface AlivePayload {
  responderId: WorkerName;
}

// Un message NEW_LEADER est diffusé par le nouveau leader.
export interface NewLeaderPayload {
  leaderId: WorkerName;
  epochId: number;
}
