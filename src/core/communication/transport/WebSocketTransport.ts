import { KenshoMessage } from '../types';
import { NetworkTransport } from './NetworkTransport';

/**
 * État de la connexion WebSocket
 */
enum ConnectionState {
    CONNECTING = 'CONNECTING',
    CONNECTED = 'CONNECTED',
    DISCONNECTED = 'DISCONNECTED',
    RECONNECTING = 'RECONNECTING',
    CIRCUIT_OPEN = 'CIRCUIT_OPEN', // Circuit breaker activé
    DISPOSED = 'DISPOSED'
}

interface WebSocketTransportConfig {
    url?: string;
    /** Délai initial de reconnexion en ms (défaut: 1000) */
    initialReconnectDelay?: number;
    /** Délai maximum de reconnexion en ms (défaut: 30000) */
    maxReconnectDelay?: number;
    /** Nombre maximum de tentatives de reconnexion (défaut: 10) */
    maxReconnectAttempts?: number;
    /** Intervalle du heartbeat en ms (défaut: 30000) */
    heartbeatInterval?: number;
    /** Taille maximale de la queue de messages (défaut: 1000) */
    maxQueueSize?: number;
}

/**
 * WebSocketTransport amélioré avec:
 * - Exponential backoff pour reconnexion
 * - Circuit breaker pattern
 * - Message queue pour messages perdus
 * - Heartbeat pour détecter connexions mortes
 * - Gestion d'état robuste
 */
export class WebSocketTransport implements NetworkTransport {
    private socket: WebSocket | null = null;
    private messageHandler: ((message: KenshoMessage) => void) | null = null;
    private readonly url: string;
    private state: ConnectionState = ConnectionState.DISCONNECTED;
    
    // Reconnection avec exponential backoff
    private reconnectAttempts = 0;
    private readonly initialReconnectDelay: number;
    private readonly maxReconnectDelay: number;
    private readonly maxReconnectAttempts: number;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    
    // Heartbeat pour détecter connexions mortes
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private readonly heartbeatInterval: number;
    private lastPongReceived: number = Date.now();
    
    // Message queue pour ne pas perdre de messages
    private messageQueue: KenshoMessage[] = [];
    private readonly maxQueueSize: number;
    
    // Disposed flag
    private isDisposed = false;

    constructor(config: WebSocketTransportConfig = {}) {
        this.url = config.url || 'ws://localhost:8080';
        this.initialReconnectDelay = config.initialReconnectDelay || 1000;
        this.maxReconnectDelay = config.maxReconnectDelay || 30000;
        this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
        this.heartbeatInterval = config.heartbeatInterval || 30000;
        this.maxQueueSize = config.maxQueueSize || 1000;
        
        this.connect();
    }

    private connect(): void {
        if (this.isDisposed || this.state === ConnectionState.CIRCUIT_OPEN) {
            return;
        }

        this.state = this.reconnectAttempts > 0 ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING;
        
        try {
            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                console.log(`[WebSocketTransport] ✅ Connected to ${this.url}`);
                this.state = ConnectionState.CONNECTED;
                this.reconnectAttempts = 0; // Reset sur succès
                this.lastPongReceived = Date.now();
                
                // Envoyer les messages en queue
                this.flushMessageQueue();
                
                // Démarrer le heartbeat
                this.startHeartbeat();
            };

            this.socket.onmessage = (event) => {
                // Gérer les pongs du heartbeat
                if (event.data === 'pong') {
                    this.lastPongReceived = Date.now();
                    return;
                }
                
                if (this.messageHandler) {
                    try {
                        const data = JSON.parse(event.data as string);
                        this.messageHandler(data);
                    } catch (e) {
                        console.error('[WebSocketTransport] ❌ Failed to parse message:', e);
                    }
                }
            };

            this.socket.onclose = (event) => {
                this.stopHeartbeat();
                
                if (this.isDisposed) {
                    this.state = ConnectionState.DISPOSED;
                    return;
                }
                
                const wasClean = event.wasClean;
                const reason = event.reason || 'Unknown reason';
                console.log(`[WebSocketTransport] 🔌 Disconnected (clean: ${wasClean}, reason: ${reason})`);
                
                this.state = ConnectionState.DISCONNECTED;
                this.scheduleReconnect();
            };

            this.socket.onerror = (err) => {
                console.error('[WebSocketTransport] ❌ WebSocket error:', err);
                // L'erreur sera suivie d'un onclose, on gère la reconnexion là-bas
            };
        } catch (error) {
            console.error('[WebSocketTransport] ❌ Failed to create WebSocket:', error);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.isDisposed || this.state === ConnectionState.CIRCUIT_OPEN) {
            return;
        }

        // Circuit breaker: arrêter après trop d'échecs
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(
                `[WebSocketTransport] 🔴 Circuit breaker OPEN - Max reconnect attempts (${this.maxReconnectAttempts}) reached`
            );
            this.state = ConnectionState.CIRCUIT_OPEN;
            return;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
        const delay = Math.min(
            this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        );
        
        this.reconnectAttempts++;
        console.log(
            `[WebSocketTransport] 🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
        );
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        
        this.heartbeatTimer = setInterval(() => {
            // Vérifier si on a reçu un pong récemment
            const timeSinceLastPong = Date.now() - this.lastPongReceived;
            if (timeSinceLastPong > this.heartbeatInterval * 2) {
                console.warn('[WebSocketTransport] ⚠️ No pong received, connection might be dead');
                this.socket?.close();
                return;
            }
            
            // Envoyer un ping
            if (this.socket?.readyState === WebSocket.OPEN) {
                try {
                    this.socket.send('ping');
                } catch (e) {
                    console.error('[WebSocketTransport] ❌ Failed to send heartbeat:', e);
                }
            }
        }, this.heartbeatInterval);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private flushMessageQueue(): void {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            if (message) {
                this.send(message);
            }
        }
    }

    public send(message: KenshoMessage): void {
        if (this.socket?.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(message));
            } catch (e) {
                console.error('[WebSocketTransport] ❌ Failed to send message:', e);
                this.queueMessage(message);
            }
        } else {
            // Queue le message pour plus tard
            this.queueMessage(message);
        }
    }

    private queueMessage(message: KenshoMessage): void {
        if (this.messageQueue.length >= this.maxQueueSize) {
            console.warn('[WebSocketTransport] ⚠️ Message queue full, dropping oldest message');
            this.messageQueue.shift();
        }
        this.messageQueue.push(message);
        console.log(`[WebSocketTransport] 📦 Message queued (queue size: ${this.messageQueue.length})`);
    }

    public onMessage(handler: (message: KenshoMessage) => void): void {
        this.messageHandler = handler;
    }

    /**
     * Retourne l'état actuel de la connexion
     */
    public getState(): string {
        return this.state;
    }

    /**
     * Retourne des statistiques pour l'observabilité
     */
    public getStats() {
        return {
            state: this.state,
            reconnectAttempts: this.reconnectAttempts,
            queueSize: this.messageQueue.length,
            lastPongReceived: new Date(this.lastPongReceived).toISOString(),
            isHealthy: this.state === ConnectionState.CONNECTED && 
                      (Date.now() - this.lastPongReceived) < this.heartbeatInterval * 2
        };
    }

    /**
     * Tente de réinitialiser le circuit breaker et reconnecter
     */
    public resetCircuitBreaker(): void {
        if (this.state === ConnectionState.CIRCUIT_OPEN) {
            console.log('[WebSocketTransport] 🔄 Resetting circuit breaker and reconnecting...');
            this.state = ConnectionState.DISCONNECTED;
            this.reconnectAttempts = 0;
            this.connect();
        }
    }

    public dispose(): void {
        console.log('[WebSocketTransport] 🛑 Disposing...');
        this.isDisposed = true;
        this.state = ConnectionState.DISPOSED;
        
        // Nettoyer les timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.stopHeartbeat();
        
        // Fermer le socket
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.onerror = null;
            this.socket.onmessage = null;
            this.socket.onopen = null;
            
            if (this.socket.readyState === WebSocket.OPEN || 
                this.socket.readyState === WebSocket.CONNECTING) {
                this.socket.close();
            }
            this.socket = null;
        }
        
        // Vider la queue
        this.messageQueue = [];
    }
}
