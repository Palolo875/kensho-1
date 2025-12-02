// src/core/eventbus/SSEStreamerCompat.ts
// Compatibility layer for existing SSEStreamer API

import { eventBus, type EventMap } from './EventBus';
import type { Listener } from './EventBus';

export type StreamEvent = {
  type: 'token' | 'complete' | 'error' | 'metrics' | 'info';
  data: any;
  timestamp: number;
};

/**
 * Compatibility wrapper for the legacy SSEStreamer API
 * This class provides the same interface as the original SSEStreamer
 * but uses the new EventBus internally.
 */
export class SSEStreamerCompat {
  private metricsBuffer: { ttft?: number; tokensPerSec?: number } = {};

  constructor() {
    // Constructor left empty for compatibility
  }

  /**
   * Diffuse un token de texte généré.
   * @param token Le morceau de texte.
   */
  public async streamToken(token: string): Promise<void> {
    eventBus.streamToken(token);
  }

  /**
   * Signale la fin réussie d'un stream.
   * @param finalResponse La réponse complète.
   * @param metrics Les métriques de performance.
   */
  public async streamComplete(finalResponse: string, metrics: any): Promise<void> {
    eventBus.streamComplete(finalResponse);
    if (metrics) {
      eventBus.updateMetrics(metrics.ttft, metrics.tokensPerSec);
    }
  }

  /**
   * Diffuse une erreur qui s'est produite pendant le traitement.
   * @param error L'objet Erreur.
   */
  public async streamError(error: Error): Promise<void> {
    eventBus.streamError(error);
  }

  /**
   * Diffuse une information générale sur l'état du système.
   * @param message Le message d'information.
   */
  public streamInfo(message: string): void {
    eventBus.streamInfo(message);
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

    eventBus.updateMetrics(this.metricsBuffer.ttft, this.metricsBuffer.tokensPerSec);
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
    const wrappedListener = (payload: { type: keyof EventMap; data: any }) => {
      // Convert the new event format to the old format
      const streamEvent: StreamEvent = {
        type: this.mapEventType(payload.type),
        data: payload.data,
        timestamp: Date.now()
      };
      listener(streamEvent);
    };

    eventBus.on('*', wrappedListener as Listener);
  }

  /**
   * Se désabonne des événements
   */
  public unsubscribe(listener: (event: StreamEvent) => void): void {
    // Note: Due to the wrapping, exact unsubscription isn't possible
    // This is a limitation of the compatibility layer
    // In the new API, consumers should use the cleanup function returned by on()
    console.warn('unsubscribe() in compatibility mode may not work perfectly. Use the new EventBus API for better control.');
  }

  /**
   * Map new event types to old event types
   */
  private mapEventType(newType: keyof EventMap): StreamEvent['type'] {
    switch (newType) {
      case 'TOKEN': return 'token';
      case 'COMPLETE': return 'complete';
      case 'ERROR': return 'error';
      case 'METRICS': return 'metrics';
      case 'INFO': return 'info';
      case 'STATUS': 
        // STATUS doesn't exist in the old API, map to info as a fallback
        return 'info';
      default: 
        return 'info';
    }
  }

  /**
   * Emit method for compatibility with EventEmitter
   */
  public emit(eventType: string, payload: any): boolean {
    // This is a simplified compatibility method
    if (eventType === 'stream-event') {
      // Try to determine the event type from the payload
      if (payload && typeof payload === 'object' && payload.type) {
        switch (payload.type) {
          case 'token':
            if (payload.data) eventBus.streamToken(payload.data);
            break;
          case 'complete':
            if (payload.data && payload.data.response) eventBus.streamComplete(payload.data.response);
            break;
          case 'error':
            if (payload.data) {
              const error = new Error(payload.data.message);
              error.name = payload.data.name || 'Error';
              error.stack = payload.data.stack;
              eventBus.streamError(error);
            }
            break;
          case 'metrics':
            if (payload.data) eventBus.updateMetrics(payload.data.ttft, payload.data.tokensPerSec);
            break;
          case 'info':
            if (payload.data) eventBus.streamInfo(payload.data);
            break;
        }
      }
      return true;
    }
    return false;
  }

  /**
   * On method for compatibility with EventEmitter
   */
  public on(eventType: string, listener: (...args: any[]) => void): this {
    if (eventType === 'stream-event') {
      this.subscribe(listener as (event: StreamEvent) => void);
    }
    return this;
  }

  /**
   * Off method for compatibility with EventEmitter
   */
  public off(eventType: string, listener: (...args: any[]) => void): this {
    if (eventType === 'stream-event') {
      this.unsubscribe(listener as (event: StreamEvent) => void);
    }
    return this;
  }

  /**
   * Vide le buffer de métriques
   */
  public clearMetrics(): void {
    this.metricsBuffer = {};
  }
}

// Export singleton instance for backward compatibility
export const sseStreamer = new SSEStreamerCompat();