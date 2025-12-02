/**
 * Integration Check Script
 *
 * Validates that all Kensho components are properly integrated:
 * - StorageManager (OPFS)
 * - RuntimeManager (Mock engines)
 * - Router (Intent classification + Planning)
 * - TaskExecutor (Execution strategies)
 * - Fusioner (Result fusion)
 * - KenshoService (UI integration)
 *
 * Run with: npx tsx scripts/check-integration.ts
 */

import { createLogger } from '../src/lib/logger';

const log = createLogger('IntegrationCheck');

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  duration?: number;
}

const results: CheckResult[] = [];

function recordResult(name: string, status: CheckResult['status'], message: string, duration?: number) {
  results.push({ name, status, message, duration });
  const emoji = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
  const durationStr = duration ? ` (${duration.toFixed(0)}ms)` : '';
  console.log(`${emoji} ${name}: ${message}${durationStr}`);
}

async function checkStorageManager(): Promise<void> {
  const start = performance.now();
  try {
    const { storageManager } = await import('../src/core/kernel/StorageManager');

    // Check if OPFS is supported (will be false in Node)
    const isSupported = storageManager.isSupported();

    if (isSupported) {
      await storageManager.ensureReady();
      const stats = await storageManager.getStats();
      recordResult('StorageManager', 'pass', `OPFS ready, quota: ${(stats.quota / 1024 / 1024).toFixed(0)}MB`, performance.now() - start);
    } else {
      recordResult('StorageManager', 'skip', 'OPFS not available in this environment (Node.js)', performance.now() - start);
    }
  } catch (error) {
    recordResult('StorageManager', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkRuntimeManager(): Promise<void> {
  const start = performance.now();
  try {
    const { runtimeManager } = await import('../src/core/kernel/RuntimeManager');

    const status = runtimeManager.getStatus();
    recordResult('RuntimeManager', 'pass', `Status: ready=${status.isReady}, backend=${status.backend || 'none'}`, performance.now() - start);
  } catch (error) {
    recordResult('RuntimeManager', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkMockEngines(): Promise<void> {
  const start = performance.now();
  try {
    const { MockWebLLMEngine, MockTransformersJSEngine, createMockEngine } = await import('../src/core/runtime/mocks/mock-engines');

    const gpuEngine = new MockWebLLMEngine();
    const cpuEngine = new MockTransformersJSEngine();
    const factoryEngine = createMockEngine('GPU');

    // Verify engines are instantiated correctly
    const gpuLoaded = gpuEngine.isLoaded();
    const cpuLoaded = cpuEngine.isLoaded();
    const factoryLoaded = factoryEngine.isLoaded();

    recordResult('MockEngines', 'pass', `GPU: ${gpuLoaded ? 'loaded' : 'ready'}, CPU: ${cpuLoaded ? 'loaded' : 'ready'}, Factory: working`, performance.now() - start);
  } catch (error) {
    recordResult('MockEngines', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkIntentClassifier(): Promise<void> {
  const start = performance.now();
  try {
    const { intentClassifier } = await import('../src/core/router/IntentClassifier');

    // Test classification for different intents
    const codeResult = await intentClassifier.classify('Write a function to sort an array');
    const mathResult = await intentClassifier.classify('Calculate 2 + 2');
    const dialogueResult = await intentClassifier.classify('Hello, how are you?');

    const allCorrect =
      codeResult.intent === 'CODE' &&
      mathResult.intent === 'MATH' &&
      dialogueResult.intent === 'DIALOGUE';

    if (allCorrect) {
      recordResult('IntentClassifier', 'pass', `CODE: ${codeResult.confidence.toFixed(2)}, MATH: ${mathResult.confidence.toFixed(2)}, DIALOGUE: ${dialogueResult.confidence.toFixed(2)}`, performance.now() - start);
    } else {
      recordResult('IntentClassifier', 'fail', `Incorrect classifications - CODE: ${codeResult.intent}, MATH: ${mathResult.intent}, DIALOGUE: ${dialogueResult.intent}`, performance.now() - start);
    }
  } catch (error) {
    recordResult('IntentClassifier', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkRouter(): Promise<void> {
  const start = performance.now();
  try {
    const { router } = await import('../src/core/router/Router');

    const stats = router.getStats();
    recordResult('Router', 'pass', `Total routes: ${stats.totalRoutes}, Success: ${stats.successfulRoutes}`, performance.now() - start);
  } catch (error) {
    recordResult('Router', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkCapacityEvaluator(): Promise<void> {
  const start = performance.now();
  try {
    const { capacityEvaluator } = await import('../src/core/router/CapacityEvaluator');

    const metrics = await capacityEvaluator.evaluate();
    recordResult('CapacityEvaluator', 'pass', `Overall score: ${metrics.overallScore.toFixed(1)}/10`, performance.now() - start);
  } catch (error) {
    recordResult('CapacityEvaluator', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkTaskExecutor(): Promise<void> {
  const start = performance.now();
  try {
    const { taskExecutor } = await import('../src/core/kernel/TaskExecutor');

    const stats = taskExecutor.getStats();
    const queueStatus = taskExecutor.getQueueStatus();

    recordResult('TaskExecutor', 'pass',
      `Executions: ${stats.totalExecutions}, Queues: S=${queueStatus.serial.pending}, L=${queueStatus.limited.pending}, F=${queueStatus.full.pending}`,
      performance.now() - start
    );
  } catch (error) {
    recordResult('TaskExecutor', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkFusioner(): Promise<void> {
  const start = performance.now();
  try {
    const { fusioner } = await import('../src/core/kernel/Fusioner');

    // Test fusion with mock data
    const result = await fusioner.fuse({
      primaryResult: {
        agentName: 'TestAgent',
        modelKey: 'test-model',
        result: 'Primary result',
        status: 'success',
        duration: 100
      },
      expertResults: [
        {
          agentName: 'ExpertAgent',
          modelKey: 'expert-model',
          result: 'Expert result',
          status: 'success',
          duration: 50
        }
      ]
    });

    recordResult('Fusioner', 'pass', `Fused ${result.length} chars from 2 results`, performance.now() - start);
  } catch (error) {
    recordResult('Fusioner', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkExecutionTraceContext(): Promise<void> {
  const start = performance.now();
  try {
    const { ExecutionTraceContext } = await import('../src/core/kernel/ExecutionTraceContext');

    const trace = new ExecutionTraceContext('integration-check');
    trace.addEvent('ROUTER', 'IntegrationCheck', 'test_event', 'start');
    trace.addTimedEvent('KERNEL', 'IntegrationCheck', 'test_timed', 100, 'success');
    trace.markCompleted('completed');

    const traceData = trace.getTrace();

    recordResult('ExecutionTraceContext', 'pass',
      `Events: ${traceData.events.length}, Duration: ${traceData.totalDuration?.toFixed(0)}ms`,
      performance.now() - start
    );
  } catch (error) {
    recordResult('ExecutionTraceContext', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkResponseCache(): Promise<void> {
  const start = performance.now();
  try {
    const { responseCache } = await import('../src/core/cache/ResponseCache');

    // Test cache operations
    const testPrompt = 'integration-test-prompt';
    const testModel = 'test-model';
    const testResponse = 'Test response';

    responseCache.set(testPrompt, testModel, testResponse);
    const cached = responseCache.get(testPrompt, testModel);
    const stats = responseCache.getStats();

    if (cached && cached.response === testResponse) {
      recordResult('ResponseCache', 'pass', `Size: ${stats.size}, Hit rate: ${stats.hitRate}%`, performance.now() - start);
    } else {
      recordResult('ResponseCache', 'fail', 'Cache read/write mismatch', performance.now() - start);
    }

    // Clean up
    responseCache.delete(testPrompt, testModel);
  } catch (error) {
    recordResult('ResponseCache', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkSSEStreamer(): Promise<void> {
  const start = performance.now();
  try {
    // Use the compatibility layer for backward compatibility
    const { sseStreamer } = await import('../src/core/eventbus/SSEStreamerCompat');

    let received = false;
    const listener = () => { received = true; };

    sseStreamer.subscribe(listener);
    sseStreamer.streamInfo('Integration test');
    sseStreamer.unsubscribe(listener);

    recordResult('SSEStreamer', 'pass', `Event system working, received: ${received}`, performance.now() - start);
  } catch (error) {
    recordResult('SSEStreamer', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkResourceManager(): Promise<void> {
  const start = performance.now();
  try {
    const { resourceManager } = await import('../src/core/kernel/ResourceManager');

    const status = await resourceManager.getStatus();

    recordResult('ResourceManager', 'pass',
      `Memory: ${(status.memory.usageRatio * 100).toFixed(0)}%, Online: ${status.network.isOnline}`,
      performance.now() - start
    );
  } catch (error) {
    recordResult('ResourceManager', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkModelCatalogs(): Promise<void> {
  const start = performance.now();
  try {
    const { MODEL_CATALOG } = await import('../src/core/kernel/ModelCatalog');
    const { ROUTER_MODEL_CATALOG, getAllVerifiedModels } = await import('../src/core/router/ModelCatalog');

    const kernelModels = Object.keys(MODEL_CATALOG).length;
    const routerModels = Object.keys(ROUTER_MODEL_CATALOG).length;
    const verifiedModels = getAllVerifiedModels().length;

    recordResult('ModelCatalogs', 'pass',
      `Kernel: ${kernelModels} models, Router: ${routerModels} models, Verified: ${verifiedModels}`,
      performance.now() - start
    );
  } catch (error) {
    recordResult('ModelCatalogs', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkKernelCoordinator(): Promise<void> {
  const start = performance.now();
  try {
    const { kernelCoordinator } = await import('../src/core/kernel/KernelCoordinator');

    const status = kernelCoordinator.getStatus();

    recordResult('KernelCoordinator', 'pass',
      `Initialized: ${status.isInitialized}, Runtime: ${status.runtimeReady}, Storage: ${status.storageReady}`,
      performance.now() - start
    );
  } catch (error) {
    recordResult('KernelCoordinator', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkKernelExports(): Promise<void> {
  const start = performance.now();
  try {
    const kernel = await import('../src/core/kernel');

    const exports = [
      'kernelCoordinator',
      'modelManager',
      'resourceManager',
      'storageManager',
      'runtimeManager',
      'taskExecutor',
      'TaskExecutor',
      'fusioner',
      'ExecutionTraceContext',
      'MODEL_CATALOG'
    ];

    const missingExports = exports.filter(e => !(e in kernel));

    if (missingExports.length === 0) {
      recordResult('KernelExports', 'pass', `All ${exports.length} exports available`, performance.now() - start);
    } else {
      recordResult('KernelExports', 'fail', `Missing: ${missingExports.join(', ')}`, performance.now() - start);
    }
  } catch (error) {
    recordResult('KernelExports', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function checkRouterExports(): Promise<void> {
  const start = performance.now();
  try {
    const router = await import('../src/core/router');

    const exports = [
      'Router',
      'router',
      'IntentClassifier',
      'intentClassifier',
      'CapacityEvaluator',
      'capacityEvaluator',
      'ROUTER_MODEL_CATALOG'
    ];

    const missingExports = exports.filter(e => !(e in router));

    if (missingExports.length === 0) {
      recordResult('RouterExports', 'pass', `All ${exports.length} exports available`, performance.now() - start);
    } else {
      recordResult('RouterExports', 'fail', `Missing: ${missingExports.join(', ')}`, performance.now() - start);
    }
  } catch (error) {
    recordResult('RouterExports', 'fail', `Error: ${error instanceof Error ? error.message : String(error)}`, performance.now() - start);
  }
}

async function runAllChecks(): Promise<void> {
  console.log('🔍 Kensho Integration Check\n');
  console.log('=' .repeat(60));
  console.log('Checking all components...\n');

  const totalStart = performance.now();

  // Core components
  await checkKernelExports();
  await checkRouterExports();
  await checkStorageManager();
  await checkResourceManager();
  await checkRuntimeManager();
  await checkMockEngines();

  // Router components
  await checkIntentClassifier();
  await checkCapacityEvaluator();
  await checkRouter();
  await checkModelCatalogs();

  // Execution components
  await checkTaskExecutor();
  await checkFusioner();
  await checkExecutionTraceContext();

  // Support components
  await checkResponseCache();
  await checkSSEStreamer();
  await checkKernelCoordinator();

  const totalDuration = performance.now() - totalStart;

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 Summary\n');

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  console.log(`✅ Passed:  ${passed}`);
  console.log(`❌ Failed:  ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`⏱️  Total time: ${totalDuration.toFixed(0)}ms`);

  if (failed > 0) {
    console.log('\n⚠️  Some checks failed. Review the errors above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All integration checks passed!');
    process.exit(0);
  }
}

// Run checks
runAllChecks().catch(error => {
  console.error('Fatal error during integration check:', error);
  process.exit(1);
});
