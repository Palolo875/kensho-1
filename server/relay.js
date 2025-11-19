import { WebSocketServer } from 'ws';

const port = 8080;
const wss = new WebSocketServer({ port });

console.log(`Kensho Relay Server started on port ${port}`);

wss.on('connection', function connection(ws) {
    console.log('New client connected');

    ws.on('error', console.error);

    ws.on('message', function message(data, isBinary) {
        // Broadcast to all other clients
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === 1) { // 1 = OPEN
                client.send(data, { binary: isBinary });
            }
        });
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});
