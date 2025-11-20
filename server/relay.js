import { WebSocketServer } from 'ws';

const port = 8080;
const wss = new WebSocketServer({ port });

console.log('🚀 Kensho Relay Server started on port', port);
console.log('📡 Features: Message relay, Heartbeat ping/pong, Connection stats\n');

// Statistiques
let stats = {
    totalConnections: 0,
    currentConnections: 0,
    messagesRelayed: 0,
    heartbeatsProcessed: 0
};

// Afficher les stats toutes les 30 secondes
setInterval(() => {
    console.log('📊 Stats:', {
        current: stats.currentConnections,
        total: stats.totalConnections,
        messages: stats.messagesRelayed,
        heartbeats: stats.heartbeatsProcessed
    });
}, 30000);

wss.on('connection', function connection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    stats.totalConnections++;
    stats.currentConnections++;
    
    console.log(`✅ New client connected from ${clientIp} (total: ${stats.currentConnections})`);

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
    });

    ws.on('message', function message(data, isBinary) {
        // Gérer les heartbeats (ping/pong)
        if (!isBinary && data.toString() === 'ping') {
            stats.heartbeatsProcessed++;
            ws.send('pong');
            return;
        }

        // Broadcast to all other clients (sauf l'émetteur)
        let relayCount = 0;
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === 1) { // 1 = OPEN
                try {
                    client.send(data, { binary: isBinary });
                    relayCount++;
                } catch (error) {
                    console.error('❌ Failed to relay message:', error.message);
                }
            }
        });
        
        if (relayCount > 0) {
            stats.messagesRelayed++;
        }
    });

    ws.on('close', (code, reason) => {
        stats.currentConnections--;
        const reasonStr = reason ? reason.toString() : 'No reason';
        console.log(`🔌 Client disconnected (code: ${code}, reason: ${reasonStr}, remaining: ${stats.currentConnections})`);
    });

    // Envoyer un message de bienvenue
    ws.send(JSON.stringify({
        type: 'server_info',
        message: 'Connected to Kensho Relay Server',
        serverTime: new Date().toISOString(),
        features: ['message_relay', 'heartbeat']
    }));
});
