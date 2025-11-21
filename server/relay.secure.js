// server/relay.secure.js
/**
 * Kensho Relay Server - SECURE VERSION
 * 
 * Features:
 * - JWT Authentication
 * - Rate Limiting
 * - Payload Validation
 * - Audit Logging
 * - Error Handling
 */

import { WebSocketServer } from 'ws';
import AuthMiddleware from './middleware/auth.js';
import RateLimiter from './middleware/rate-limiter.js';
import crypto from 'crypto';

const PORT = process.env.PORT || 8080;
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true';
const MAX_PAYLOAD_SIZE = 256 * 1024; // 256KB

// Initialize middleware
const authMiddleware = new AuthMiddleware();
const rateLimiter = new RateLimiter({
    maxRequests: 100,
    windowMs: 60000,      // 1 minute window
    blockDurationMs: 120000, // 2 minutes block
});

// WebSocket Server
const wss = new WebSocketServer({
    port: PORT,
    maxPayload: MAX_PAYLOAD_SIZE,

    // Verify client connection
    verifyClient: (info, callback) => {
        if (!ENABLE_AUTH) {
            // Auth disabled - accept all connections (dev mode)
            callback(true);
            return;
        }

        // Authenticate the connection
        const authResult = authMiddleware.authenticate(info.req);

        if (!authResult.authenticated) {
            console.warn(`[Auth] Connection rejected: ${authResult.error}`);
            callback(false, 401, authResult.error);
            return;
        }

        // Store user info for later use
        info.req.userId = authResult.userId;
        info.req.metadata = authResult.metadata;

        console.log(`[Auth] User ${authResult.userId} authenticated successfully`);
        callback(true);
    },
});

// Client connection map
const clients = new Map();

// Generate unique client ID
function generateClientId() {
    return crypto.randomUUID();
}

// Audit logger
function auditLog(level, event, details = {}) {
    const log = {
        timestamp: new Date().toISOString(),
        level,
        event,
        ...details,
    };
    console.log(`[AUDIT]`, JSON.stringify(log));
}

// Handle new connection
wss.on('connection', function connection(ws, req) {
    const clientId = generateClientId();
    const userId = req.userId || 'anonymous';
    const clientInfo = {
        id: clientId,
        userId,
        connectedAt: Date.now(),
        messageCount: 0,
        lastActivity: Date.now(),
    };

    clients.set(ws, clientInfo);

    auditLog('info', 'client_connected', {
        clientId,
        userId,
        ip: req.socket.remoteAddress,
    });

    console.log(`✅ Client ${clientId} (${userId}) connected. Total clients: ${wss.clients.size}`);

    // Handle errors
    ws.on('error', (error) => {
        auditLog('error', 'websocket_error', {
            clientId,
            userId,
            error: error.message,
        });
        console.error(`❌ WebSocket error for client ${clientId}:`, error);
    });

    // Handle messages
    ws.on('message', function message(data, isBinary) {
        const clientInfo = clients.get(ws);
        if (!clientInfo) return;

        // Update activity
        clientInfo.lastActivity = Date.now();
        clientInfo.messageCount++;

        // Rate limiting
        const rateLimitCheck = rateLimiter.check(clientInfo.userId);
        if (!rateLimitCheck.allowed) {
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Rate limit exceeded',
                retryAfter: rateLimitCheck.retryAfter,
            }));

            auditLog('warn', 'rate_limit_exceeded', {
                clientId: clientInfo.id,
                userId: clientInfo.userId,
                retryAfter: rateLimitCheck.retryAfter,
            });

            return;
        }

        // Validate message size
        if (data.length > MAX_PAYLOAD_SIZE) {
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Message too large',
                maxSize: MAX_PAYLOAD_SIZE,
            }));

            auditLog('warn', 'message_too_large', {
                clientId: clientInfo.id,
                userId: clientInfo.userId,
                size: data.length,
            });

            return;
        }

        // Try to parse and validate payload
        try {
            if (!isBinary) {
                // Validate JSON format
                JSON.parse(data.toString());
            }
        } catch (error) {
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Invalid message format',
            }));

            auditLog('warn', 'invalid_message_format', {
                clientId: clientInfo.id,
                userId: clientInfo.userId,
            });

            return;
        }

        // Broadcast to all other clients
        let broadcastCount = 0;
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === 1) { // 1 = OPEN
                try {
                    client.send(data, { binary: isBinary });
                    broadcastCount++;
                } catch (error) {
                    console.error('[Relay] Failed to send to client:', error);
                }
            }
        });

        // Log successful relay
        if (broadcastCount > 0) {
            console.log(`📨 Relayed message from ${clientInfo.id} to ${broadcastCount} clients`);
        }
    });

    // Handle disconnection
    ws.on('close', () => {
        const clientInfo = clients.get(ws);
        if (clientInfo) {
            const sessionDuration = Date.now() - clientInfo.connectedAt;

            auditLog('info', 'client_disconnected', {
                clientId: clientInfo.id,
                userId: clientInfo.userId,
                sessionDuration,
                messageCount: clientInfo.messageCount,
            });

            console.log(`👋 Client ${clientInfo.id} (${clientInfo.userId}) disconnected. Session: ${Math.round(sessionDuration / 1000)}s, Messages: ${clientInfo.messageCount}`);

            clients.delete(ws);
        }
    });
});

// Server stats endpoint (for monitoring)
setInterval(() => {
    const stats = {
        activeConnections: wss.clients.size,
        rateLimiterStats: rateLimiter.getStats(),
        uptime: process.uptime(),
    };

    console.log(`[Stats] Active: ${stats.activeConnections}, Blocked: ${stats.rateLimiterStats.blockedClients}`);
}, 60000); // Every minute

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');

    auditLog('info', 'server_shutdown', {
        reason: 'SIGTERM',
    });

    wss.clients.forEach((ws) => {
        ws.close(1000, 'Server shutting down');
    });

    wss.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
        console.error('❌ Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
});

// Startup message
console.log(`
╔════════════════════════════════════════╗
║  Kensho Relay Server (SECURE)         ║
╠════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(32)} ║
║  Auth: ${(ENABLE_AUTH ? 'ENABLED' : 'DISABLED').padEnd(32)} ║
║  Max Payload: ${(MAX_PAYLOAD_SIZE / 1024 + 'KB').padEnd(25)} ║
║  Rate Limit: 100 req/min              ║
╚════════════════════════════════════════╝
`);

if (!ENABLE_AUTH) {
    console.warn('⚠️  WARNING: Authentication is DISABLED. Set ENABLE_AUTH=true for production!');
}

export { wss, authMiddleware, rateLimiter };
