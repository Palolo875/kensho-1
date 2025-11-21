// benchmarks/throughput.ts
import { MessageBus } from '../src/core/communication/MessageBus';
import { BroadcastTransport } from '../src/core/communication/transport/BroadcastTransport';

/**
 * Benchmark: Message Throughput
 * Measures how many messages can be processed per second.
 */

const ITERATIONS = 10000;
const PAYLOAD_SIZE_BYTES = 1024; // 1KB payload

async function runBenchmark() {
    console.log('🚀 Starting Throughput Benchmark...');
    console.log(`iterations: ${ITERATIONS}, payload: ${PAYLOAD_SIZE_BYTES} bytes`);

    // Setup
    const bus1 = new MessageBus('BenchWorker1');
    const bus2 = new MessageBus('BenchWorker2');

    // Mock transport to avoid browser API dependency in Node env if needed,
    // but here we assume we run in an environment where BroadcastChannel works or is mocked.
    // For pure Node.js benchmark, we might need a mock transport.

    // Let's create a simple in-memory transport for pure speed testing of the Bus logic itself
    const mockTransport = {
        send: (msg: any) => {
            // Direct delivery simulation
            setTimeout(() => {
                // @ts-ignore
                if (msg.targetWorker === 'BenchWorker2') bus2['handleIncomingMessage'](msg);
                // @ts-ignore
                if (msg.targetWorker === 'BenchWorker1') bus1['handleIncomingMessage'](msg);
            }, 0);
        },
        onMessage: () => { }
    };

    // Inject mock transport (using any cast to bypass private/readonly for bench)
    (bus1 as any).transport = mockTransport;
    (bus2 as any).transport = mockTransport;

    // Register handler
    bus2.setRequestHandler(async (payload) => {
        return { ack: true };
    });

    // Warmup
    console.log('🔥 Warming up...');
    for (let i = 0; i < 100; i++) {
        await bus1.request('BenchWorker2', { test: true });
    }

    // Benchmark
    console.log('⏱️ Measuring...');
    const start = performance.now();

    const promises = [];
    const payload = new Uint8Array(PAYLOAD_SIZE_BYTES).fill(1);

    for (let i = 0; i < ITERATIONS; i++) {
        promises.push(bus1.request('BenchWorker2', { data: payload }));
    }

    await Promise.all(promises);

    const end = performance.now();
    const duration = end - start;
    const throughput = (ITERATIONS / duration) * 1000;

    console.log('\n📊 Results:');
    console.log(`Total Time: ${duration.toFixed(2)}ms`);
    console.log(`Throughput: ${throughput.toFixed(2)} messages/sec`);
    console.log(`Avg Latency: ${(duration / ITERATIONS).toFixed(4)}ms/req`);
}

runBenchmark().catch(console.error);
