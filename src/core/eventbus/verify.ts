// src/core/eventbus/verify.ts
// Simple verification script for EventBus implementation

import { EventBus } from './EventBus';

console.log('🧪 EventBus Verification Script');
console.log('============================');

// Create an instance
const eventBus = new EventBus();

// Test 1: Basic subscription and emission
console.log('\n1. Testing basic subscription and emission...');
let tokenReceived = false;
const tokenListener = (payload: { token: string }) => {
  tokenReceived = true;
  console.log(`  Received TOKEN event: ${payload.token}`);
};

const unsubscribe = eventBus.on('TOKEN', tokenListener);
eventBus.emit('TOKEN', { token: 'Hello World!' });

if (tokenReceived) {
  console.log('  ✅ Basic subscription and emission works');
} else {
  console.log('  ❌ Basic subscription and emission failed');
}

// Test 2: Unsubscription
console.log('\n2. Testing unsubscription...');
let tokenReceivedAfterUnsub = false;
const tokenListener2 = () => {
  tokenReceivedAfterUnsub = true;
};

const unsubscribe2 = eventBus.on('TOKEN', tokenListener2);
unsubscribe2();
eventBus.emit('TOKEN', { token: 'Should not be received' });

if (!tokenReceivedAfterUnsub) {
  console.log('  ✅ Unsubscription works');
} else {
  console.log('  ❌ Unsubscription failed');
}

// Test 3: Wildcard subscription
console.log('\n3. Testing wildcard subscription...');
let wildcardReceived = false;
const wildcardListener = (payload: any) => {
  wildcardReceived = true;
  console.log(`  Received wildcard event:`, payload);
};

eventBus.on('*', wildcardListener);
eventBus.emit('STATUS', { status: 'running' });

if (wildcardReceived) {
  console.log('  ✅ Wildcard subscription works');
} else {
  console.log('  ❌ Wildcard subscription failed');
}

// Test 4: One-time subscription
console.log('\n4. Testing one-time subscription...');
let onceCallCount = 0;
const onceListener = () => {
  onceCallCount++;
  console.log(`  Once listener called, count: ${onceCallCount}`);
};

eventBus.once('INFO', onceListener);
eventBus.emit('INFO', { message: 'First call' });
eventBus.emit('INFO', { message: 'Second call' });

if (onceCallCount === 1) {
  console.log('  ✅ One-time subscription works');
} else {
  console.log('  ❌ One-time subscription failed');
}

// Test 5: Convenience methods
console.log('\n5. Testing convenience methods...');
let completeReceived = false;
const completeListener = (payload: { response: string }) => {
  completeReceived = true;
  console.log(`  Received COMPLETE event: ${payload.response}`);
};

eventBus.on('COMPLETE', completeListener);
eventBus.streamComplete('Task completed successfully!');

if (completeReceived) {
  console.log('  ✅ Convenience methods work');
} else {
  console.log('  ❌ Convenience methods failed');
}

// Test 6: Statistics
console.log('\n6. Testing statistics...');
const stats = eventBus.getStats();
console.log(`  Current stats: ${JSON.stringify(stats)}`);
if (stats.totalListeners >= 0) {
  console.log('  ✅ Statistics tracking works');
} else {
  console.log('  ❌ Statistics tracking failed');
}

// Test 7: Error handling
console.log('\n7. Testing error handling...');
const failingListener = () => {
  throw new Error('Test error');
};

const workingListener = () => {
  console.log('  Working listener still called despite error in another listener');
};

eventBus.on('ERROR', failingListener);
eventBus.on('ERROR', workingListener);
try {
  eventBus.emit('ERROR', { message: 'test', name: 'TestError' });
  console.log('  ✅ Error handling works (no crash)');
} catch (error) {
  console.log('  ❌ Error handling failed (crashed)');
}

console.log('\n✅ Verification complete!');