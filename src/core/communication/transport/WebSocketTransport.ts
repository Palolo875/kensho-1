import { KenshoMessage } from '../types';
import { NetworkTransport } from './NetworkTransport';
import { globalMetrics } from '../../monitoring';
import { createLogger } from '../../../lib/logger';

const log = createLogger('WebSocketTransport');

enum ConnectionState {
    CONNECTING = 'CONNECTING',
    CONNECTED = 'CONNECTED',
    DISCONNECTED = 'DISCONNECTED',
    RECONNECTING = 'RECONNECTING',
    CIRCUIT_OPEN = 'CIRCUIT_OPEN',
    DISPOSED = 'DISPOSED'
}

interface WebSocketTransportConfig {
    url?: string;
    initialReconnectDelay?: number;
    maxReconnectDelay?: number;
    maxReconnectAttempts?: number;
    heartbeatInterval?: number;
    maxQueueSize?: number;
}

export class WebSocketTransport implements NetworkTransport {
    private socket: WebSocket | null = null;
    private messageHandler: ((message: KenshoMessage) => void) | null = null;
    private readonly url: string;
    private state: ConnectionState = ConnectionState.DISCONNECTED;
    
    private reconnectAttempts = 0;
    private readonly initialReconnectDelay: number;
    private readonly maxReconnectDelay: number;
    private readonly maxReconnectAttempts: number;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private readonly heartbeatInterval: number;
    private lastPongReceived: number = Date.now();
    
    private messageQueue: KenshoMessage[] = [];
    private readonly maxQueueSize: number;
    
    private isDisposed = false;
    
    private messagesSent = 0;
    private messagesReceived = 0;
    private bytesReceived = 0;
    private bytesSent = 0;

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
                log.info(`Connected to ${this.url}`);
                this.state = ConnectionState.CONNECTED;
                this.reconnectAttempts = 0;
                this.lastPongReceived = Date.now();
                
                globalMetrics.incrementCounter('websocket.connections');
                globalMetrics.recordGauge('websocket.state', 1);
                
                this.flushMessageQueue();
                this.startHeartbeat();
            };

            this.socket.onmessage = (event) => {
                const startTime = performance.now();
                
                if (event.data === 'pong') {
                    this.lastPongReceived = Date.now();
                    globalMetrics.recordTiming('websocket.heartbeat.rtt_ms', performance.now() - startTime);
                    return;
                }
                
                this.messagesReceived++;
                const messageSize = typeof event.data === 'string' ? event.data.length : 0;
                this.bytesReceived += messageSize;
                globalMetrics.incrementCounter('websocket.messages_received');
                globalMetrics.incrementCounter('websocket.bytes_received', messageSize);
                
                if (this.messageHandler) {
                    try {
                        const data = JSON.parse(event.data as string);
                        const parseTime = performance.now() - startTime;
                        globalMetrics.recordTiming('websocket.message.parse_time_ms', parseTime);
                        this.messageHandler(data);
                        globalMetrics.recordTiming('websocket.message.process_time_ms', performance.now() - startTime);
                    } catch (e) {
                        log.error('Failed to parse message:', e as Error);
                        globalMetrics.incrementCounter('websocket.parse_errors');
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
                log.info(`Disconnected (clean: ${wasClean}, reason: ${reason})`);
                
                globalMetrics.incrementCounter('websocket.disconnections', 1, {
                    clean: wasClean.toString(),
                    reason: reason
                });
                globalMetrics.recordGauge('websocket.state', 0);
                
                this.state = ConnectionState.DISCONNECTED;
                this.scheduleReconnect();
            };

            this.socket.onerror = (err) => {
                log.error('WebSocket error:', err as Error);
                globalMetrics.incrementCounter('websocket.errors');
            };
        } catch (error) {
            log.error('Failed to create WebSocket:', error as Error);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.isDisposed || this.state === ConnectionState.CIRCUIT_OPEN) {
            return;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            log.error(`Circuit breaker OPEN - Max reconnect attempts (${this.maxReconnectAttempts}) reached`);
            this.state = ConnectionState.CIRCUIT_OPEN;
            globalMetrics.incrementCounter('websocket.circuit_breaker_open');
            globalMetrics.recordGauge('websocket.state', -1);
            return;
        }

        const delay = Math.min(
            this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        );
        
        this.reconnectAttempts++;
        log.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        
        this.heartbeatTimer = setInterval(() => {
            const timeSinceLastPong = Date.now() - this.lastPongReceived;
            if (timeSinceLastPong > this.heartbeatInterval * 2) {
                log.warn('No pong received, connection might be dead');
                this.socket?.close();
                return;
            }
            
            if (this.socket?.readyState === WebSocket.OPEN) {
                try {
                    this.socket.send('ping');
                } catch (e) {
                    log.error('Failed to send heartbeat:', e as Error);
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
        const startTime = performance.now();
        
        if (this.socket?.readyState === WebSocket.OPEN) {
            try {
                const messageStr = JSON.stringify(message);
                const messageSize = messageStr.length;
                
                this.socket.send(messageStr);
                
                this.messagesSent++;
                this.bytesSent += messageSize;
                globalMetrics.incrementCounter('websocket.messages_sent');
                globalMetrics.incrementCounter('websocket.bytes_sent', messageSize);
                globalMetrics.recordTiming('websocket.message.send_time_ms', performance.now() - startTime);
            } catch (e) {
                log.error('Failed to send message:', e as Error);
                globalMetrics.incrementCounter('websocket.send_errors');
                this.queueMessage(message);
            }
        } else {
            this.queueMessage(message);
        }
    }

    private queueMessage(message: KenshoMessage): void {
        if (this.messageQueue.length >= this.maxQueueSize) {
            log.warn('Message queue full, dropping oldest message');
            this.messageQueue.shift();
            globalMetrics.incrementCounter('websocket.messages_dropped');
        }
        this.messageQueue.push(message);
        globalMetrics.recordGauge('websocket.queue_size', this.messageQueue.length);
        log.debug(`Message queued (queue size: ${this.messageQueue.length})`);
    }

    public onMessage(handler: (message: KenshoMessage) => void): void {
        this.messageHandler = handler;
    }

    public getState(): string {
        return this.state;
    }

    public getStats() {
        const now = Date.now();
        const timeSinceLastPong = now - this.lastPongReceived;
        
        return {
            state: this.state,
            reconnectAttempts: this.reconnectAttempts,
            queueSize: this.messageQueue.length,
            lastPongReceived: new Date(this.lastPongReceived).toISOString(),
            timeSinceLastPong: timeSinceLastPong,
            isHealthy: this.state === ConnectionState.CONNECTED && 
                      timeSinceLastPong < this.heartbeatInterval * 2,
            messagesSent: this.messagesSent,
            messagesReceived: this.messagesReceived,
            bytesSent: this.bytesSent,
            bytesReceived: this.bytesReceived,
            throughput: {
                messagesPerSecond: this.messagesReceived / 60,
                bytesPerSecond: this.bytesReceived / 60
            }
        };
    }

    public resetCircuitBreaker(): void {
        if (this.state === ConnectionState.CIRCUIT_OPEN) {
            log.info('Resetting circuit breaker and reconnecting...');
            this.state = ConnectionState.DISCONNECTED;
            this.reconnectAttempts = 0;
            this.connect();
        }
    }

    public dispose(): void {
        log.info('Disposing...');
        this.isDisposed = true;
        this.state = ConnectionState.DISPOSED;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.stopHeartbeat();
        
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
        
        this.messageQueue = [];
    }
}
