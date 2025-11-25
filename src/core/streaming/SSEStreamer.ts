// src/core/streaming/SSEStreamer.ts

import { EventEmitter } from 'events';

console.log("📡✨ Initialisation du SSEStreamer v1.0 (Elite)...");

// Définit les types d'événements que notre système peut diffuser.
export type StreamEvent = {
  type: 'token' | 'complete' | 'error' | 'metrics' | 'info';
  data: any;
  timestamp: number;
};

/**
 * SSEStreamer gère le streaming d'événements en temps réel vers l'UI.
 * Il agit comme un bus d'événements centralisé pour toute l'application.
 * 
 * C'est un système découplé: n'importe quel composant (TaskExecutor, DialoguePlugin, Router)
 * peut émettre des événements, et l'UI s'y abonne pour les traiter.
 */
class SSEStreamer extends EventEmitter {
  private metricsBuffer: { ttft?: number; tokensPerSec?: number } = {};

  constructor() {
    super();
    console.log("[SSE] Prêt à diffuser des événements.");
  }

  /**
   * Diffuse un token de texte généré.
   * @param token Le morceau de texte.
   */
  public async streamToken(token: string): Promise<void> {
    const event: StreamEvent = {
      type: 'token',
      data: token,
      timestamp: Date.now()
    };
    this.emit('stream-event', event);
  }

  /**
   * Signale la fin réussie d'un stream.
   * @param finalResponse La réponse complète.
   * @param metrics Les métriques de performance.
   */
  public async streamComplete(finalResponse: string, metrics: any): Promise<void> {
    const event: StreamEvent = {
      type: 'complete',
      data: { response: finalResponse, metrics },
      timestamp: Date.now()
    };
    this.emit('stream-event', event);
  }

  /**
   * Diffuse une erreur qui s'est produite pendant le traitement.
   * @param error L'objet Erreur.
   */
  public async streamError(error: Error): Promise<void> {
    const event: StreamEvent = {
      type: 'error',
      data: { message: error.message, stack: error.stack },
      timestamp: Date.now()
    };
    this.emit('stream-event', event);
  }

  /**
   * Diffuse une information générale sur l'état du système.
   * @param message Le message d'information.
   */
  public streamInfo(message: string): void {
    const event: StreamEvent = {
      type: 'info',
      data: message,
      timestamp: Date.now()
    };
    this.emit('stream-event', event);
  }

  /**
   * Diffuse les métriques de performance.
   * @param ttft Time-To-First-Token en ms (optionnel)
   * @param tokensPerSec Tokens par seconde (optionnel)
   */
  public updateMetrics(ttft?: number, tokensPerSec?: number): void {
    if (ttft !== undefined) {
      this.metricsBuffer.ttft = ttft;
    }
    if (tokensPerSec !== undefined) {
      this.metricsBuffer.tokensPerSec = tokensPerSec;
    }

    const event: StreamEvent = {
      type: 'metrics',
      data: { ...this.metricsBuffer },
      timestamp: Date.now()
    };
    this.emit('stream-event', event);
  }

  /**
   * S'abonne aux événements de stream
   * Utilisation côté UI:
   * sseStreamer.on('stream-event', (event) => {
   *   if (event.type === 'token') { ... }
   *   if (event.type === 'complete') { ... }
   * });
   */
  public subscribe(listener: (event: StreamEvent) => void): void {
    this.on('stream-event', listener);
  }

  /**
   * Se désabonne des événements
   */
  public unsubscribe(listener: (event: StreamEvent) => void): void {
    this.off('stream-event', listener);
  }

  /**
   * Vide le buffer de métriques
   */
  public clearMetrics(): void {
    this.metricsBuffer = {};
  }
}

export const sseStreamer = new SSEStreamer();
