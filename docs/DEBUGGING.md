# Kensho Debugging Guide

Guide complet pour diagnostiquer et résoudre les problèmes dans Kensho.

## Table des matières

1. [Outils de Debug](#outils-de-debug)
2. [Patterns d'Erreurs Courants](#patterns-derreurs-courants)
3. [Debugging par Composant](#debugging-par-composant)
4. [Techniques Avancées](#techniques-avancées)
5. [Performance Profiling](#performance-profiling)

---

## Outils de Debug

### 1. Browser DevTools Console

Accédez aux logs structurés Kensho :

```javascript
// Filtrer par composant
// Chrome DevTools > Console > Filter
[MessageBus]
[StreamManager]
[LeaderElection]
[OfflineQueue]
[DuplicateDetector]
```

### 2. Metrics Dashboard

Endpoint: `http://localhost:5000/metrics`

Affiche en temps réel :
- Nombre de workers actifs
- Latence average/p95/p99
- Taux d'erreur
- Nombre de requêtes pending

```javascript
// Accéder programmatiquement
const stats = messageBus.getStatistics();
console.table({
  'Pending Requests': stats.pendingRequests,
  'Offline Queue': stats.offlineQueue.length,
  'Active Streams': stats.activeStreams,
  'Latency Avg': stats.metrics.latencyAvg,
  'Error Rate': stats.errorRate
});
```

### 3. Observatory UI

Endpoint: `http://localhost:5000/observatory`

Affiche :
- **Constellation View** : Graph de tous les workers et leurs connexions
- **Leader Status** : Qui est leader, epoch actuel
- **Log Stream** : Tous les logs colorisés par severity

### 4. Test Suites

```bash
# E2E tests (browser-based)
# 1. Ouvrir: http://localhost:5000/tests/browser/
# 2. Cliquer sur chaque test:
#    - sprint1a-e2e.html (RequestManager + Response)
#    - sprint1b-registry-e2e.html (WorkerRegistry)
#    - sprint1b-election-e2e.html (LeaderElection)
#    - sprint1b-resilience-e2e.html (Heartbeat + Failure)
#    - sprint1c-chaos-monkey-e2e.html (Resilience 95%+)
#    - sprint1c-duplicate-detection-e2e.html (Exactly-once)
#    - sprint1c-offline-queue-e2e.html (OfflineQueue)

# Manual verification
bun run tests/manual-test-calculator.ts
```

---

## Patterns d'Erreurs Courants

### Pattern 1: "No handler registered for worker"

**Symptôme:**
```
[MessageBus] [ERROR] No request handler registered for worker 'MyAgent'
```

**Cause:** Agent non initialisé ou pas d'handler enregistré

**Diagnostic:**
```javascript
// 1. Vérifier que l'agent est loadé
const workerElement = document.querySelector('[data-agent="MyAgent"]');
if (!workerElement) {
  console.error('Agent MyAgent is not loaded');
}

// 2. Vérifier que le handler est enregistré
// Dans l'agent code: runtime.registerMethod('calculate', handler)

// 3. Vérifier que l'agent envoie son READY message
// Observatory devrait lister l'agent actif
```

**Solution:**
```javascript
// S'assurer que l'agent est lancé avant de l'appeler
await sleep(1000); // Attendre que le worker démarre
messageBus.request('MyAgent', { ... });
```

---

### Pattern 2: "Request timeout after 5000ms"

**Symptôme:**
```
[RequestManager] [WARN] Request msg-abc123 timeout after 5000ms
```

**Cause probable:**
- Agent trop lent
- Agent crashé
- Réseau instable

**Diagnostic:**
```javascript
// 1. Vérifier si l'agent est actif
const stats = messageBus.getStatistics();
if (!stats.activeAgents.includes('MyAgent')) {
  console.log('Agent is not active');
  // Check Observatory for visibility
}

// 2. Vérifier la latence
console.log('Latency p99:', stats.metrics.latencyP99);
if (stats.metrics.latencyP99 > 3000) {
  console.warn('System is slow, increase timeout');
}

// 3. Vérifier les erreurs dans l'agent
// Ouvrir DevTools de l'agent (F12 dans certains navigateurs)
```

**Solution:**
```javascript
// Augmenter le timeout
messageBus.request('MyAgent', { ... }, 10000); // 10s

// Ou implémenter retry
async function requestWithRetry(target, payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await messageBus.request(target, payload, 5000);
    } catch (err) {
      if (i < maxRetries - 1) {
        console.log(`Retry ${i+1}/${maxRetries}`);
        await sleep(1000 * (i + 1)); // exponential backoff
      } else {
        throw err;
      }
    }
  }
}
```

---

### Pattern 3: "Duplicate request detected"

**Symptôme:**
```
[MessageBus] [WARN] Duplicate request detected: msg-abc123
```

**Cause:** Même requête envoyée 2x (intentionnel pour testing ou bug client)

**Diagnostic:**
```javascript
// 1. Vérifier si c'est attendu
// Si oui: pas de problème, c'est la détection qui fonctionne

// 2. Si c'est un bug client:
// Vérifier le code qui envoie la requête
// - Pas de retry automatique qui cause des doublons?
// - Pas de double-click qui lance 2 requêtes?

// 3. Regarder les logs
// Dupliquer en moins de 60s = même request ID
// Dupliquer après 60s = nouveau request ID (cache expiré)
```

**Solution:**
```javascript
// Côté client: implémenter debouncing
const sendRequest = debounce(async () => {
  try {
    const result = await messageBus.request('Agent', { ... });
    handleResult(result);
  } catch (err) {
    handleError(err);
  }
}, 500); // max 1 request per 500ms

// Ou: garder l'ID de la dernière requête
let lastRequestId = null;
async function sendUniquRequest() {
  const requestId = crypto.randomUUID();
  if (requestId === lastRequestId) return; // Skip duplicate
  lastRequestId = requestId;
  return messageBus.request('Agent', { requestId, ... });
}
```

---

### Pattern 4: "OfflineQueue full (100 messages)"

**Symptôme:**
```
[OfflineQueue] [WARN] Queue for 'TargetAgent' is full. Dropping oldest message.
```

**Cause:** Agent est hors ligne depuis longtemps, files d'attente accumulent

**Diagnostic:**
```javascript
// 1. Vérifier l'état du destinataire
const stats = messageBus.getStatistics();
console.log('Offline queue stats:', stats.offlineQueue);

// 2. Vérifier quand l'agent est revenu en ligne
// Observatory ou DevTools logs

// 3. Mesurer le backlog
// Les messages les plus anciens ont >5min?
```

**Solution:**
```javascript
// 1. Augmenter la limite OfflineQueue (si approprié)
// Dans OfflineQueue.ts: MAX_QUEUE_SIZE = 500

// 2. Réduire la TTL des messages en queue (âge max)
// Dans OfflineQueue.ts: MAX_MESSAGE_AGE_MS = 30000

// 3. Implémenter un backend queue (Redis, RabbitMQ)
// Pour les cas où > 100 messages sont normaux
```

---

### Pattern 5: "Stream chunk lost or incomplete"

**Symptôme:**
```
[StreamManager] [ERROR] Stream stream-xyz timeout, dropping subscribers
```

**Cause:** Stream pas complété (pas stream_end reçu), subscriber timeout

**Diagnostic:**
```javascript
// 1. Vérifier le producer (agent envoyant les chunks)
// S'assure-t-il d'appeler onEnd()?

// 2. Monitorer la durée du stream
console.time('StreamDuration');
messageBus.requestStream('Agent', { ... }, {
  onChunk: (chunk) => console.log('Chunk', chunk),
  onEnd: () => console.timeEnd('StreamDuration'),
  onError: (err) => console.error('Stream error', err)
});

// 3. Vérifier la taille des chunks
// Trop gros = timeout? Splitter en plus petits chunks
```

**Solution:**
```javascript
// Augmenter le stream timeout dans StreamManager
// Ou implémenter pagination côté producer

// Côté producer (agent):
async function sendLargeStream(streamEmitter) {
  const data = await fetchLargeData();
  
  // Splitter en chunks
  const CHUNK_SIZE = 1024; // 1KB chunks
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    streamEmitter.sendChunk(chunk);
    
    // Donner le temps de traiter
    await sleep(10);
  }
  
  streamEmitter.end(); // IMPORTANT!
}
```

---

## Debugging par Composant

### MessageBus

**Logs clés:**
```
[MessageBus] [INFO] Request created
[MessageBus] [WARN] Invalid message rejected
[MessageBus] [ERROR] No handler for request
```

**Debug technique:**
```javascript
// Intercepter les messages
const originalSend = messageBus.send;
messageBus.send = function(message) {
  console.log('[INTERCEPT] Sending:', {
    type: message.type,
    source: message.sourceWorker,
    target: message.targetWorker,
    payload: message.payload,
    timestamp: new Date().toISOString()
  });
  return originalSend.call(this, message);
};
```

### RequestManager

**Logs clés:**
```
[RequestManager] [INFO] Request pending (id: msg-xyz)
[RequestManager] [ERROR] Request failed
[RequestManager] [WARN] Request timeout
```

**Debug:**
```javascript
// Voir tous les pending requests
const pendingRequests = (messageBus as any).requestManager.pendingRequests;
console.table(
  Array.from(pendingRequests.entries()).map(([id, req]) => ({
    id,
    target: req.targetWorker,
    created: new Date(req.createdAt).toISOString(),
    elapsed: Date.now() - req.createdAt
  }))
);
```

### StreamManager

**Logs clés:**
```
[StreamManager] [INFO] Stream started (id: stream-xyz)
[StreamManager] [WARN] Chunk received out of order
[StreamManager] [ERROR] Stream timeout
```

**Debug:**
```javascript
// Monitorer les streams actifs
const activeStreams = (messageBus as any).streamManager.activeStreams;
console.log('Active streams:', activeStreams.size);
for (const [streamId, callbacks] of activeStreams) {
  console.log(`Stream ${streamId}:`, callbacks);
}
```

### LeaderElection

**Logs clés:**
```
[LeaderElection] [INFO] Starting election
[LeaderElection] [WARN] Leader lost, triggering new election
[LeaderElection] [INFO] New leader elected: AgentA
```

**Debug:**
```javascript
// Voir l'état d'élection
const election = (messageBus as any).guardian?.leaderElection;
console.log({
  currentLeader: election?.currentLeader,
  epoch: election?.epoch,
  isCandidate: election?.isCandidate,
  votesReceived: election?.votesReceived
});

// Simuler une perte de leader
// Dans browser devtools: fermer/recharger un worker
```

### DuplicateDetector

**Logs clés:**
```
[DuplicateDetector] [WARN] Duplicate detected
[DuplicateDetector] [INFO] Cache entry expired
```

**Debug:**
```javascript
// Voir le cache
const cache = (messageBus as any).duplicateDetector.cache;
console.table(
  Array.from(cache.entries()).map(([id, entry]) => ({
    messageId: id,
    cached: entry.response ? 'YES' : 'NO',
    age: Date.now() - entry.timestamp,
    expired: (Date.now() - entry.timestamp) > 60000
  }))
);
```

---

## Techniques Avancées

### Trace ID Logging

Suivre une requête à travers tous les components :

```javascript
// 1. Générer un trace ID unique
const traceId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// 2. Inclure dans chaque requête
messageBus.currentTraceId = traceId;
messageBus.request('Agent', { ... });

// 3. Filtrer les logs par trace ID
// DevTools: filter for `trace-123456-abc`
// Tous les logs avec cet ID font partie de la même requête

// Dans les logs Kensho:
[14:32:15.234] [trace-123456-abc] [MessageBus] Request created
[14:32:15.245] [trace-123456-abc] [DuplicateDetector] Cache miss
[14:32:15.256] [trace-123456-abc] [StreamManager] Chunk 1/5 received
[14:32:15.267] [trace-123456-abc] [StreamManager] Chunk 2/5 received
...
[14:32:15.334] [trace-123456-abc] [RequestManager] Response sent
```

### Memory Profiling

Détecter les memory leaks :

```javascript
// Capturer l'état de mémoire avant/après
function profileMemory(label, fn) {
  if (!performance.memory) {
    console.log('performance.memory not available');
    return;
  }
  
  const before = performance.memory.usedJSHeapSize;
  console.log(`[${label}] Memory before:`, (before / 1024 / 1024).toFixed(2), 'MB');
  
  fn();
  
  // Forcer garbage collection (si disponible - nécessite flag)
  if (window.gc) gc();
  
  setTimeout(() => {
    const after = performance.memory.usedJSHeapSize;
    const delta = after - before;
    console.log(`[${label}] Memory after:`, (after / 1024 / 1024).toFixed(2), 'MB');
    console.log(`[${label}] Delta:`, (delta / 1024 / 1024).toFixed(2), 'MB');
    
    if (delta > 0) {
      console.warn(`[${label}] MEMORY LEAK DETECTED! Growth: ${(delta / 1024 / 1024).toFixed(2)} MB`);
    }
  }, 100);
}

// Utilisation
profileMemory('CreateWorkers', () => {
  for (let i = 0; i < 10; i++) {
    new Worker('agent.js');
  }
});
```

### Network Simulation

Tester avec latence/perte simul :

```javascript
// Wrapper autour du transport
class DebugTransport {
  constructor(realTransport, config = {}) {
    this.transport = realTransport;
    this.latency = config.latency || 0; // ms
    this.dropRate = config.dropRate || 0; // 0-1
  }
  
  send(message) {
    if (Math.random() < this.dropRate) {
      console.warn('[DEBUG] Simulating message drop:', message.messageId);
      return; // Drop the message
    }
    
    setTimeout(() => {
      this.transport.send(message);
    }, this.latency);
  }
  
  onMessage(callback) {
    this.transport.onMessage(callback);
  }
}

// Utilisation
const debugTransport = new DebugTransport(realTransport, {
  latency: 100,      // 100ms latency
  dropRate: 0.1      // 10% drop rate
});

const messageBus = new MessageBus('Agent', {
  transport: debugTransport
});
```

### Chaos Testing

Tuer les workers aléatoirement :

```javascript
function startChaosTesting(duration = 30000, killInterval = 2000) {
  const workers = document.querySelectorAll('iframe[data-worker]');
  let killed = 0;
  
  const chaosInterval = setInterval(() => {
    if (workers.length === 0) return;
    
    const victim = workers[Math.floor(Math.random() * workers.length)];
    console.warn(`🐒 CHAOS: Killing worker ${victim.dataset.worker}`);
    victim.remove();
    killed++;
    
  }, killInterval);
  
  setTimeout(() => {
    clearInterval(chaosInterval);
    console.log(`🐒 CHAOS TESTING COMPLETE: ${killed} workers killed`);
  }, duration);
}

// Lancer: startChaosTesting();
```

---

## Performance Profiling

### Latency Analysis

```javascript
// Tracker tout request et mesurer la latency
const latencies = [];

const originalRequest = messageBus.request;
messageBus.request = async function(...args) {
  const start = performance.now();
  try {
    const result = await originalRequest.apply(this, args);
    const latency = performance.now() - start;
    latencies.push(latency);
    return result;
  } catch (err) {
    const latency = performance.now() - start;
    latencies.push({ latency, error: true });
    throw err;
  }
};

// Après un certain temps
setTimeout(() => {
  const successLatencies = latencies.filter(l => typeof l === 'number');
  const sorted = successLatencies.sort((a, b) => a - b);
  
  console.table({
    'Min': sorted[0],
    'Max': sorted[sorted.length - 1],
    'Avg': successLatencies.reduce((a, b) => a + b) / successLatencies.length,
    'p50': sorted[Math.floor(sorted.length * 0.5)],
    'p95': sorted[Math.floor(sorted.length * 0.95)],
    'p99': sorted[Math.floor(sorted.length * 0.99)],
    'Count': successLatencies.length
  });
}, 60000);
```

### Throughput Analysis

```javascript
// Compter messages/sec
let messageCount = 0;
const originalSend = messageBus.send;

messageBus.send = function(message) {
  messageCount++;
  return originalSend.call(this, message);
};

// Reporter périodiquement
setInterval(() => {
  const throughput = messageCount / 10; // per 10s
  console.log(`Throughput: ${throughput.toFixed(2)} messages/sec`);
  messageCount = 0;
}, 10000);
```

---

## Emergency Procedures

### Si tout est bloqué

```javascript
// 1. Forcer restart du MessageBus
messageBus.dispose();
messageBus = new MessageBus('App');

// 2. Nettoyer les caches
messageBus.resetMetricsWindow();
localStorage.clear(); // Attention: efface tout!

// 3. Recharger la page
window.location.reload();
```

### Si agents ne répondent pas

```javascript
// 1. Killer et redémarrer tous les workers
for (const worker of allWorkers) {
  worker.terminate();
}
allWorkers = [];

// 2. Recharger les agents
initializeAgents();

// 3. Vérifier Observatory
// Attendre que tous les agents réapparaissent
```

