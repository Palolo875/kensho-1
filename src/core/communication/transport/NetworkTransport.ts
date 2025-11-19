import { KenshoMessage } from '../types';

export interface NetworkTransport {
    send(message: KenshoMessage): void;
    onMessage(handler: (message: KenshoMessage) => void): void;
    dispose(): void;
}
