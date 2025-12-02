/**
 * EventBus Production-Ready v2.0
 * 
 * Système d'événements robuste, typé et découplé pour streaming LLM
 * Remplace SSEStreamer avec:
 * - Type safety stricte (EventMap)
 * - Wildcard support (*)
 * - Cleanup automatique (on/off/once)
 * - Debug tools et monitoring
 * - Throttling pour éviter saturation
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('EventBus');

// ============ Type Definitions ============

export type StreamEvent = 
  | { type: 'TOKEN'; payload: { token: string } }
  | { type: 'STATUS'; payload: { status: string; details?: string } }
  | { type: 'METRICS'; payload: { ttft?: number; tokensPerSec?: number; totalTokens?: number } }
  | { type: 'COMPLETE'; payload: { response: string; totalTime?: number } }
  | { type: 'ERROR'; payload: { message: string; name?: string; stack?: string; retriable?: boolean } }
  | { type: 'INFO'; payload: { message: string } };

export type EventMap = {
  TOKEN: { token: string };
  STATUS: { status: string; details?: string };
  METRICS: { ttft?: number; tokensPerSec?: number; totalTokens?: number };
  COMPLETE: { response: string; totalTime?: number };
  ERROR: { message: string; name?: string; stack?: string; retriable?: boolean };
  INFO: { message: string };
};

export type EventType = keyof EventMap;
export type Listener<K extends EventType = any> = (data: EventMap[K]) => void;

// ============ EventBus Implementation ============

class EventBus {
  private listeners = new Map<EventType | '*', Set<Listener>>();
  private wildcardListeners = new Set<Listener>();
  private debugMode = false;
  private eventHistory: StreamEvent[] = [];
  private maxHistorySize = 100;
  private throttleTimers = new Map<string, NodeJS.Timeout>();
  private throttleBuffer = new Map<string, any>();

  constructor() {
    log.info('🚀 EventBus v2.0 initialisé (Production-Ready)');
    // Expose en dev
    if (typeof window !== 'undefined') {
      (window as any).__eventBus = this;
    }
  }

  /**
   * S'abonne à un événement typé
   * Retourne une fonction de cleanup automatique
   */
  public on<K extends EventType>(
    eventType: K | '*',
    listener: Listener<K>
  ): () => void {
    const isWildcard = eventType === '*';
    const listenersSet = isWildcard ? this.wildcardListeners : this.getOrCreateListeners(eventType as EventType);
    
    listenersSet.add(listener as any);
    this.debugLog(`[on] ${eventType} (total: ${listenersSet.size})`);

    // Retourne une fonction cleanup
    return () => this.off(eventType, listener as any);
  }

  /**
   * S'abonne une seule fois à un événement
   */
  public once<K extends EventType>(
    eventType: K,
    listener: Listener<K>
  ): () => void {
    const wrapper = (data: EventMap[K]) => {
      listener(data);
      this.off(eventType, wrapper as any);
    };
    return this.on(eventType, wrapper as Listener<K>);
  }

  /**
   * Se désabonne d'un événement
   */
  public off<K extends EventType>(
    eventType: K | '*',
    listener: Listener<K>
  ): void {
    const isWildcard = eventType === '*';
    const listenersSet = isWildcard ? this.wildcardListeners : this.listeners.get(eventType as EventType);
    
    if (listenersSet) {
      listenersSet.delete(listener as any);
      if (listenersSet.size === 0 && !isWildcard) {
        this.listeners.delete(eventType as EventType);
      }
      this.debugLog(`[off] ${eventType}`);
    }
  }

  /**
   * Émet un événement typé
   */
  public emit<K extends EventType>(eventType: K, payload: EventMap[K]): void {
    const event: StreamEvent = {
      type: eventType,
      payload: payload as any,
      timestamp: Date.now()
    };

    this.recordHistory(event);
    this.debugLog(`[emit] ${eventType}`, payload);

    // Spécifique au type
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(payload);
        } catch (error) {
          log.error(`❌ Erreur dans listener ${eventType}:`, error instanceof Error ? error.message : error);
        }
      });
    }

    // Wildcard
    this.wildcardListeners.forEach(listener => {
      try {
        (listener as any)(event);
      } catch (error) {
        log.error(`❌ Erreur dans wildcard listener:`, error instanceof Error ? error.message : error);
      }
    });
  }

  /**
   * Émet avec throttling (grouper les émissions rapides)
   * Utile pour les tokens haute fréquence
   */
  public emitThrottled<K extends EventType>(
    eventType: K,
    payload: EventMap[K],
    throttleMs: number = 50
  ): void {
    const key = `${eventType}`;
    
    // Stocker le dernier payload
    this.throttleBuffer.set(key, payload);

    // Si un timer existe, on ne fait rien (le timer va traiter)
    if (this.throttleTimers.has(key)) {
      return;
    }

    // Créer un nouveau timer
    const timer = setTimeout(() => {
      const bufferedPayload = this.throttleBuffer.get(key);
      if (bufferedPayload) {
        this.emit(eventType, bufferedPayload);
      }
      this.throttleTimers.delete(key);
      this.throttleBuffer.delete(key);
    }, throttleMs);

    this.throttleTimers.set(key, timer);
  }

  /**
   * Raccourcis pratiques
   */
  public streamToken(token: string): void {
    this.emit('TOKEN', { token });
  }

  public streamStatus(status: string, details?: string): void {
    this.emit('STATUS', { status, details });
  }

  public streamError(error: Error | string, retriable = false): void {
    if (typeof error === 'string') {
      this.emit('ERROR', { message: error, retriable });
    } else {
      this.emit('ERROR', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        retriable
      });
    }
  }

  public streamComplete(response: string, totalTime?: number): void {
    this.emit('COMPLETE', { response, totalTime });
  }

  public streamMetrics(ttft?: number, tokensPerSec?: number, totalTokens?: number): void {
    this.emit('METRICS', { ttft, tokensPerSec, totalTokens });
  }

  public streamInfo(message: string): void {
    this.emit('INFO', { message });
  }

  /**
   * Debug tools
   */
  public enableDebug(): void {
    this.debugMode = true;
    log.info('🔍 Debug mode activé');
  }

  public disableDebug(): void {
    this.debugMode = false;
    log.info('🔍 Debug mode désactivé');
  }

  private debugLog(msg: string, data?: any): void {
    if (this.debugMode) {
      log.debug(msg, data);
    }
  }

  /**
   * Stats et monitoring
   */
  public getStats() {
    const listenerCounts: Record<string, number> = {};
    this.listeners.forEach((set, eventType) => {
      listenerCounts[eventType] = set.size;
    });

    return {
      listenerCounts,
      totalListeners: Array.from(this.listeners.values()).reduce((sum, set) => sum + set.size, 0) + this.wildcardListeners.size,
      wildcardListeners: this.wildcardListeners.size,
      historySize: this.eventHistory.length
    };
  }

  public getHistory(): StreamEvent[] {
    return [...this.eventHistory];
  }

  private recordHistory(event: StreamEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Cleanup complet
   */
  public clear(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
    this.eventHistory = [];
    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.clear();
    this.throttleBuffer.clear();
    log.info('🧹 EventBus nettoyé');
  }

  /**
   * Retire tous les listeners d'un type ou de tous les types
   */
  public removeAllListeners(eventType?: EventType): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
      this.wildcardListeners.clear();
    }
  }

  private getOrCreateListeners(eventType: EventType): Set<Listener> {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    return this.listeners.get(eventType)!;
  }
}

export const eventBus = new EventBus();

// Alias for backward compatibility with SSEStreamer
export const sseStreamer = eventBus;

log.info('✅ EventBus + SSEStreamer alias disponibles');
