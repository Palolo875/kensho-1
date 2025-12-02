import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HybridTransport } from '../HybridTransport';

describe('HybridTransport', () => {
  let transport: HybridTransport;
  let mockPort: any;

  beforeEach(() => {
    mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
    };
    
    // Mock the SharedWorker
    (global as any).SharedWorker = vi.fn().mockImplementation(() => ({
      port: mockPort,
    }));
    
    transport = new HybridTransport();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default values', () => {
    expect(transport.isConnected()).toBe(false);
    expect(transport.getPendingMessages()).toEqual([]);
  });

  it('should connect to shared worker', async () => {
    const connectPromise = transport.connect();
    
    // Simulate worker ready message
    const onMessageCallback = mockPort.addEventListener.mock.calls.find(call => call[0] === 'message')[1];
    onMessageCallback({ data: { type: 'ready' } });
    
    await connectPromise;
    
    expect(transport.isConnected()).toBe(true);
  });

  it('should handle message sending', () => {
    const message = { type: 'test', payload: 'data' };
    
    transport.send(message);
    
    // Should queue message when not connected
    expect(transport.getPendingMessages()).toHaveLength(1);
    
    // Simulate connection
    transport['isConnectedFlag'] = true;
    transport['workerPort'] = mockPort;
    
    transport.send(message);
    
    // Should send message when connected
    expect(mockPort.postMessage).toHaveBeenCalledWith(message);
  });

  it('should handle message receiving', () => {
    const messageHandler = vi.fn();
    transport.setMessageHandler(messageHandler);
    
    const testMessage = { type: 'response', payload: 'test data' };
    
    // Simulate receiving message
    const onMessageCallback = mockPort.addEventListener.mock.calls.find(call => call[0] === 'message')[1];
    onMessageCallback({ data: testMessage });
    
    expect(messageHandler).toHaveBeenCalledWith(testMessage);
  });

  it('should enforce message history limit to prevent memory leaks', () => {
    // Simulate sending many messages
    for (let i = 0; i < 1100; i++) {
      const messageId = transport['storePendingMessage']({ type: 'test', id: i });
      transport['messageTimestamps'].set(messageId, Date.now());
    }
    
    // Should enforce the limit of 1000 messages
    expect(transport.getPendingMessages().length).toBeLessThanOrEqual(1000);
    
    // Check that the oldest messages were removed
    const timestamps = Array.from(transport['messageTimestamps'].values());
    expect(timestamps.length).toBeLessThanOrEqual(1000);
  });

  it('should clean up old messages periodically', async () => {
    // Add some old messages
    const oldTimestamp = Date.now() - 15000; // 15 seconds ago
    
    for (let i = 0; i < 5; i++) {
      const messageId = transport['storePendingMessage']({ type: 'old', id: i });
      transport['messageTimestamps'].set(messageId, oldTimestamp);
    }
    
    // Add a recent message
    const recentMessageId = transport['storePendingMessage']({ type: 'recent', id: 'recent' });
    transport['messageTimestamps'].set(recentMessageId, Date.now());
    
    expect(transport.getPendingMessages()).toHaveLength(6);
    
    // Force cleanup
    transport['cleanupOldMessages']();
    
    // Should keep recent messages and remove old ones
    expect(transport.getPendingMessages()).toHaveLength(1);
    expect(transport.getPendingMessages()[0].id).toBe('recent');
  });

  it('should get oldest message ID for emergency cleanup', () => {
    // Add messages
    const messageIds = [];
    for (let i = 0; i < 3; i++) {
      const messageId = transport['storePendingMessage']({ type: 'test', id: i });
      transport['messageTimestamps'].set(messageId, Date.now() + i); // Different timestamps
      messageIds.push(messageId);
    }
    
    const oldestId = transport['getOldestMessageId']();
    expect(oldestId).toBe(messageIds[0]); // First added should be oldest
  });

  it('should disconnect properly', () => {
    transport['workerPort'] = mockPort;
    transport['isConnectedFlag'] = true;
    
    transport.disconnect();
    
    expect(transport.isConnected()).toBe(false);
    expect(mockPort.removeEventListener).toHaveBeenCalled();
  });
});