import { KenshoMessage } from '../types';
import { NetworkTransport } from './NetworkTransport';

export class WebSocketTransport implements NetworkTransport {
    private socket: WebSocket | null = null;
    private messageHandler: ((message: KenshoMessage) => void) | null = null;
    private readonly url: string;

    constructor(url: string = 'ws://localhost:8080') {
        this.url = url;
        this.connect();
    }

    private connect(): void {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            console.log(`[WebSocketTransport] Connected to ${this.url}`);
        };

        this.socket.onmessage = (event) => {
            if (this.messageHandler) {
                try {
                    const data = JSON.parse(event.data as string);
                    this.messageHandler(data);
                } catch (e) {
                    console.error('[WebSocketTransport] Failed to parse message', e);
                }
            }
        };

        this.socket.onclose = () => {
            console.log('[WebSocketTransport] Disconnected. Reconnecting in 1s...');
            setTimeout(() => this.connect(), 1000);
        };

        this.socket.onerror = (err) => {
            console.error('[WebSocketTransport] Error:', err);
        };
    }

    public send(message: KenshoMessage): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        } else {
            console.warn('[WebSocketTransport] Socket not open, message lost:', message);
        }
    }

    public onMessage(handler: (message: KenshoMessage) => void): void {
        this.messageHandler = handler;
    }

    public dispose(): void {
        if (this.socket) {
            this.socket.onclose = null; // Prevent reconnection
            this.socket.close();
        }
    }
}
