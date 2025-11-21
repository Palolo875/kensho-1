// benchmarks/latency.ts
import { MessageBus } from '../src/core/communication/MessageBus';

/**
 * Benchmark: Message Latency
 * Measures Round Trip Time (RTT) for different payload sizes.
 */

const SAMPLES = 1000;
const PAYLOAD_SIZES = [128, 1024, 10240, 102400]; // 128B, 1KB, 10KB, 100KB

async function runBenchmark() {
    console.log('🚀 Starting Latency Benchmark...');

    // Setup (Mock Transport)
    const bus1 = new MessageBus('BenchWorker1');
    const bus2 = new MessageBus('BenchWorker2');

    const mockTransport = {
        send: (msg: any) => {
            // Immediate delivery to test bus overhead
            // @ts-ignore
            if (msg.targetWorker === 'BenchWorker2') bus2['handleIncomingMessage'](msg);
            // @ts-ignore
            if (msg.targetWorker === 'BenchWorker1') bus1['handleIncomingMessage'](msg);
        },
        onMessage: () => { }
    };

    (bus1 as any).transport = mockTransport;
    (bus2 as any).transport = mockTransport;

    bus2.setRequestHandler(async (payload) => {
        return payload; // Echo
    });

    console.log(`\nRunning ${SAMPLES} samples per size...`);
    console.log('| Payload Size | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) |');
    console.log('|--------------|----------|----------|----------|----------|');

    for (const size of PAYLOAD_SIZES) {
        const payload = new Uint8Array(size).fill(1);
        const latencies: number[] = [];

        for (let i = 0; i < SAMPLES; i++) {
            const start = performance.now();
            await bus1.request('BenchWorker2', { data: payload });
            const end = performance.now();
            latencies.push(end - start);
        }

        latencies.sort((a, b) => a - b);

        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const p50 = latencies[Math.floor(latencies.length * 0.50)];
        const p95 = latencies[Math.floor(latencies.length * 0.95)];
        const p99 = latencies[Math.floor(latencies.length * 0.99)];

        console.log(`| ${size.toString().padEnd(12)} | ${avg.toFixed(3).padEnd(8)} | ${p50.toFixed(3).padEnd(8)} | ${p95.toFixed(3).padEnd(8)} | ${p99.toFixed(3).padEnd(8)} |`);
    }
}

runBenchmark().catch(console.error);
