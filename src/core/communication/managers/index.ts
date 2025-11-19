// src/core/communication/managers/index.ts

export { RequestManager } from './RequestManager';
export { StreamManager, type StreamCallbacks } from './StreamManager';
export { DuplicateDetector } from './DuplicateDetector';
export { MessageRouter, type MessageHandler, type MessageHandlers } from './MessageRouter';
