import { eventBus } from './EventBus';

export type StreamEvent = {
  type: 'token' | 'complete' | 'error' | 'metrics';
  data: any;
  timestamp: number;
};

type SSEClient = {
  id: string;
  writer: NodeWriter | BrowserWriter;
};

type NodeWriter = {
  type: 'node';
  res: any; // Express Response
};

type BrowserWriter = {
  type: 'browser';
  writer: WritableStreamDefaultWriter;
};

/**
 * SSEStreamer isomorphe (Express + Web Streams)
 * Gère le streaming temps réel vers l'UI
 */
export class SSEStreamer {
  private clients: Map<string, SSEClient> = new Map();
  private metricsBuffer: { ttft?: number; tokensPerSec?: number } = {};

  /**
   * Register client Node/Express
   */
  public registerNodeClient(clientId: string, res: any): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    this.clients.set(clientId, {
      id: clientId,
      writer: { type: 'node', res }
    });

    console.log(`[SSE] 📡 Client Node ${clientId} connecté (total: ${this.clients.size})`);
  }

  /**
   * Register client Browser/Web Streams
   */
  public registerBrowserClient(clientId: string, writer: WritableStreamDefaultWriter): void {
    this.clients.set(clientId, {
      id: clientId,
      writer: { type: 'browser', writer }
    });

    console.log(`[SSE] 📡 Client Browser ${clientId} connecté (total: ${this.clients.size})`);
  }

  /**
   * Stream un token
   */
  public async streamToken(token: string): Promise<void> {
    const event: StreamEvent = {
      type: 'token',
      data: token,
      timestamp: Date.now()
    };

    await this.broadcast(event);
    eventBus.emit('stream:token', token); // Émettre aussi via EventBus
  }

  /**
   * Signale la fin du stream
   */
  public async streamComplete(finalResponse: string, metrics: any): Promise<void> {
    const event: StreamEvent = {
      type: 'complete',
      data: { response: finalResponse, metrics },
      timestamp: Date.now()
    };

    await this.broadcast(event);
    eventBus.emit('stream:complete', finalResponse);
  }

  /**
   * Stream une erreur
   */
  public async streamError(error: Error): Promise<void> {
    const event: StreamEvent = {
      type: 'error',
      data: { message: error.message, stack: error.stack },
      timestamp: Date.now()
    };

    await this.broadcast(event);
    eventBus.emit('stream:error', error);
  }

  /**
   * Broadcast isomorphe (Node + Browser)
   */
  private async broadcast(event: StreamEvent): Promise<void> {
    const data = `data: ${JSON.stringify(event)}\n\n`;

    const promises = Array.from(this.clients.values()).map(async (client) => {
      try {
        if (client.writer.type === 'node') {
          // Node/Express
          client.writer.res.write(data);
        } else {
          // Browser/Web Streams
          const encoder = new TextEncoder();
          await client.writer.writer.write(encoder.encode(data));
        }
      } catch (error) {
        console.error(`[SSE] Erreur broadcast client ${client.id}:`, error);
        this.clients.delete(client.id);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Désenregistre un client
   */
  public unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
    console.log(`[SSE] 📴 Client ${clientId} déconnecté (restant: ${this.clients.size})`);
  }

  /**
   * Met à jour les métriques de performance
   */
  public updateMetrics(ttft?: number, tokensPerSec?: number): void {
    if (ttft !== undefined) this.metricsBuffer.ttft = ttft;
    if (tokensPerSec !== undefined) this.metricsBuffer.tokensPerSec = tokensPerSec;
  }

  /**
   * Nombre de clients connectés
   */
  public getClientCount(): number {
    return this.clients.size;
  }
}

export const sseStreamer = new SSEStreamer();
