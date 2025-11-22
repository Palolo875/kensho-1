/**
 * Configuration du transport réseau pour Kensho
 */

const IS_PRODUCTION = import.meta.env.PROD;
const WS_URL = import.meta.env.VITE_WS_URL;

export interface TransportConfig {
    websocket: {
        enabled: boolean;
        url: string;
        protocol: 'ws' | 'wss';
        reconnectDelay: number;
        reconnectMaxAttempts: number;
    };
    broadcast: {
        enabled: boolean;
    };
}

export const transportConfig: TransportConfig = {
    websocket: {
        enabled: IS_PRODUCTION || !!WS_URL,
        url: WS_URL || (IS_PRODUCTION ? getSecureWSURL() : 'ws://localhost:8080'),
        protocol: IS_PRODUCTION ? 'wss' : 'ws',
        reconnectDelay: 1000,
        reconnectMaxAttempts: 5
    },
    broadcast: {
        enabled: true
    }
};

/**
 * Construit l'URL WebSocket sécurisée pour la production
 */
function getSecureWSURL(): string {
    if (typeof window === 'undefined') {
        return 'wss://api.example.com/ws';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/ws`;
}

console.log('[TransportConfig]', {
    environment: IS_PRODUCTION ? 'production' : 'development',
    websocket: {
        enabled: transportConfig.websocket.enabled,
        protocol: transportConfig.websocket.protocol,
        url: transportConfig.websocket.url
    },
    broadcast: transportConfig.broadcast.enabled
});
