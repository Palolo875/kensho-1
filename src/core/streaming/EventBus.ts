/**
 * EventBus simple pour communication interne
 * Alternative légère à EventEmitter pour Browser + Node
 */

type EventCallback = (data: any) => void;

class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  /**
   * Abonne un callback à un événement
   */
  public on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Désabonne un callback d'un événement
   */
  public off(event: string, callback: EventCallback): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Émet un événement avec des données
   */
  public emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventBus] Error in callback for event "${event}":`, error);
        }
      });
    }
  }

  /**
   * Abonne un callback une seule fois
   */
  public once(event: string, callback: EventCallback): void {
    const onceWrapper = (data: any) => {
      callback(data);
      this.off(event, onceWrapper);
    };
    this.on(event, onceWrapper);
  }

  /**
   * Compte le nombre de listeners pour un événement
   */
  public listenerCount(event: string): number {
    return this.listeners.get(event)?.size || 0;
  }

  /**
   * Retire tous les listeners
   */
  public removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const eventBus = new EventBus();
