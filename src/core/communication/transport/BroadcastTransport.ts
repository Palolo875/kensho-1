import { KenshoMessage } from '../types';
import { NetworkTransport } from './NetworkTransport';

export class BroadcastTransport implements NetworkTransport {
    private readonly channel: BroadcastChannel;
    private messageHandler: ((message: KenshoMessage) => void) | null = null;

    constructor(channelName: string = 'kensho-main-bus') {
        this.channel = new BroadcastChannel(channelName);
        this.channel.onmessage = this.handleIncomingMessage.bind(this);
    }

    private handleIncomingMessage(event: MessageEvent<KenshoMessage>): void {
        if (this.messageHandler) {
            this.messageHandler(event.data);
        }
    }

    public send(message: KenshoMessage): void {
        this.channel.postMessage(message);
    }

    public onMessage(handler: (message: KenshoMessage) => void): void {
        this.messageHandler = handler;
    }

    public dispose(): void {
        this.channel.close();
    }
}
