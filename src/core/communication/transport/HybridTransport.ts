import { KenshoMessage } from '../types';
import { NetworkTransport } from './NetworkTransport';
import { BroadcastTransport } from './BroadcastTransport';
import { WebSocketTransport } from './WebSocketTransport';

/**
 * Transport hybride qui combine BroadcastChannel (pour le local) 
 * et WebSocket (pour le réseau distant).
 * 
 * Les messages sont envoyés via les deux transports.
 * Les messages reçus via l'un ou l'autre sont dédupliqués.
 */
export class HybridTransport implements NetworkTransport {
    private readonly localTransport: BroadcastTransport;
    private readonly remoteTransport: WebSocketTransport;
    private messageHandler: ((message: KenshoMessage) => void) | null = null;
    private processedMessageIds = new Set<string>();

    constructor(wsUrl?: string) {
        this.localTransport = new BroadcastTransport();
        this.remoteTransport = new WebSocketTransport({ url: wsUrl });

        this.localTransport.onMessage(this.handleMessage.bind(this));
        this.remoteTransport.onMessage(this.handleMessage.bind(this));
    }

    private handleMessage(message: KenshoMessage): void {
        // Déduplication : ignorer si déjà traité
        if (this.processedMessageIds.has(message.messageId)) {
            return;
        }

        this.processedMessageIds.add(message.messageId);

        // Nettoyer l'historique après 10 secondes
        setTimeout(() => {
            this.processedMessageIds.delete(message.messageId);
        }, 10000);

        if (this.messageHandler) {
            this.messageHandler(message);
        }
    }

    public send(message: KenshoMessage): void {
        // Envoyer via les deux transports
        this.localTransport.send(message);
        this.remoteTransport.send(message);
    }

    public onMessage(handler: (message: KenshoMessage) => void): void {
        this.messageHandler = handler;
    }

    /**
     * Retourne les statistiques combinées des deux transports
     */
    public getStats() {
        return {
            remote: this.remoteTransport.getStats(),
            processedMessageCount: this.processedMessageIds.size
        };
    }

    /**
     * Réinitialise le circuit breaker du transport WebSocket
     */
    public resetCircuitBreaker(): void {
        this.remoteTransport.resetCircuitBreaker();
    }

    public dispose(): void {
        this.localTransport.dispose();
        this.remoteTransport.dispose();
        this.processedMessageIds.clear();
    }
}
