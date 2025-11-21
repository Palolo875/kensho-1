# Kensho Operations Guide

Guide opérationnel pour déployer, monitorer et maintenir Kensho en production.

## Table des matières

1. [Déploiement](#déploiement)
2. [Monitoring](#monitoring)
3. [Troubleshooting](#troubleshooting)
4. [Performance & Scaling](#performance--scaling)
5. [Checklist Production](#checklist-production)

---

## Déploiement

### Prérequis

- Node.js 18+ ou Bun 1.0+
- Navigateur supportant Web Workers et WebGPU (pour LLM)
- 4GB+ RAM recommandé pour les modèles LLM

### Installation

```bash
# 1. Cloner et installer
bun install

# 2. Construire les agents de test
bun run build:test-agents

# 3. Démarrer en développement
bun run dev

# 4. Build pour production
bun run build
```

### Configuration Environment

Variables essentielles pour production :

```env
# Relay Server (optionnel, pour communication cross-device)
VITE_RELAY_SERVER_URL=wss://your-relay.example.com:8080

# LLM Model Configuration
VITE_LLM_MODEL_ID=Phi-3-mini-4k-instruct
VITE_LLM_CACHE_ENABLED=true

# Métriques
VITE_METRICS_ENABLED=true
VITE_METRICS_WINDOW_SIZE=5m

# Debug Mode (désactiver en production)
VITE_DEBUG=false
```

### Déploiement sur Replit

```bash
# 1. Publier via le bouton "Publish" dans l'interface Replit
# 2. URL public généré automatiquement
# 3. Vérifier les logs en production avec: bun run prod:logs
```

---

## Monitoring

### Métriques Clés à Surveiller

#### 1. Health Check de la Constellation

```javascript
import { useKenshoStore } from '@/store/useKenshoStore';

const store = useKenshoStore();
const health = {
  agentCount: store.agentCount,
  leaderStatus: store.leaderName,
  messageLatency: store.metrics.latencyAvg,
  errorRate: store.workerErrors.length / 1000
};

// Log périodiquement (chaque 30s)
setInterval(() => console.log('Health:', health), 30000);
```

#### 2. MetricsDashboard

L'interface affiche en temps réel :

- **Connection Status** : Nombre de workers actifs
- **Latency Percentiles** : p50, p95, p99
- **Reliability** : Taux de succès des requêtes
- **Throughput** : Messages/seconde

Accéder via : `http://localhost:5000/metrics`

#### 3. Observatory UI

Surveillance de la constellation :

- **Constellation View** : Graphe visuel des workers
- **Leader Election** : État du leader avec epoch
- **Log Stream** : Flux de logs en temps réel avec severity-based coloring

Accéder via : `http://localhost:5000/observatory`

### Alertes Production

Configurer des alertes pour :

```javascript
// 1. Error Rate > 5%
if (errorRate > 0.05) {
  sendAlert('HIGH_ERROR_RATE', { errorRate });
}

// 2. Latency p99 > 1000ms
if (latencyP99 > 1000) {
  sendAlert('HIGH_LATENCY', { latencyP99 });
}

// 3. Leader missing > 10s
if (!leaderName && Date.now() - lastLeaderSeen > 10000) {
  sendAlert('LEADER_MISSING', { uptime: Date.now() - start });
}

// 4. OfflineQueue backlog > 100 messages
if (offlineQueueSize > 100) {
  sendAlert('OFFLINE_QUEUE_BACKLOG', { backlog: offlineQueueSize });
}
```

### Logs Structurés

Tous les logs incluent context :

```
[14:32:15.234] [MessageBus] [INFO] Request processed
  source: AgentA
  target: CalculatorAgent
  duration: 145ms
  messageId: msg-abc123

[14:32:16.512] [StreamManager] [WARN] Chunk dropped
  streamId: stream-def456
  reason: timeout
  lostChunks: 3
```

Rechercher par :

```bash
# Erreurs
grep '\[ERROR\]' app.log

# Latence haute
grep 'duration: [5-9][0-9][0-9]ms' app.log

# Timeouts
grep 'timeout' app.log

# Leader election
grep 'LeaderElection' app.log
```

---

## Troubleshooting

### Symptôme : Requêtes bloquées indéfiniment

**Cause probable** : Agent hors ligne, OfflineQueue n'a pas envoyé

**Solution** :

```javascript
// 1. Vérifier l'état du worker
const busStats = messageBus.getStatistics();
console.log('Pending requests:', busStats.pendingRequests);
console.log('Offline queue:', busStats.offlineQueue);

// 2. Si queue backlog existe:
// - Redémarrer le worker destinataire
// - Vérifier la connexion réseau (si relay utilisé)

// 3. Force flush timeout request (max 10s)
const timeout = setTimeout(() => {
  console.warn('Request timeout, clearing pending state');
  messageBus.resetMetricsWindow();
}, 10000);
```

### Symptôme : Latence anormalement haute

**Cause probable** : GC de JavaScript, LLM model en train de charger, beaucoup de streams

**Solution** :

```javascript
// 1. Monitorer la mémoire
if (performance.memory) {
  const heapUsed = performance.memory.usedJSHeapSize;
  const heapLimit = performance.memory.jsHeapSizeLimit;
  if (heapUsed / heapLimit > 0.9) {
    console.warn('Heap pressure high, forcing GC...');
    // Forcer garbage collection (si disponible)
  }
}

// 2. Réduire le nombre de streams parallèles
// Maximum recommandé: 5 streams concurrents

// 3. Monitorer l'index du modèle LLM
messageBus.request('MainLLMAgent', { method: 'getModelStats' })
  .then(stats => console.log('LLM stats:', stats));
```

### Symptôme : DuplicateDetector logs "many duplicates"

**Cause probable** : Retry aggressif du client, problème de réseau (messages retransmis)

**Solution** :

```javascript
// 1. Vérifier la stabilité du réseau
// - Si WebSocket relay: vérifier logs du serveur relay
// - Si BroadcastChannel: compatible navigateur?

// 2. Augmenter le timeout de requête
messageBus.request(target, payload, 8000); // au lieu de 5000ms

// 3. Implémenter exponential backoff côté client
let retries = 0;
async function requestWithBackoff(target, payload) {
  try {
    return await messageBus.request(target, payload);
  } catch (err) {
    if (retries < 3) {
      retries++;
      await sleep(Math.pow(2, retries) * 1000);
      return requestWithBackoff(target, payload);
    }
    throw err;
  }
}
```

### Symptôme : "No workers detected" au démarrage

**Cause probable** : Agent runtime non initialisé, ou BroadcastChannel unsupported

**Solution** :

```javascript
// 1. Vérifier que les agents Web Workers sont loadés
const workers = navigator.hardwareConcurrency; // CPU cores
console.log(`System cores: ${workers}`);

// 2. Vérifier BroadcastChannel support
if (!window.BroadcastChannel) {
  console.error('BroadcastChannel not supported!');
  // Fallback: utiliser WebSocket relay
  const transport = new WebSocketTransport(config);
}

// 3. Vérifier que les agents envoient leur heartbeat
// (Observatory devrait les afficher après 1-2s)
```

---

## Performance & Scaling

### Limites Actuelles

| Métrique | Limite | Notes |
|----------|--------|-------|
| Agents (Workers) | ~50 | Dépend de la RAM disponible |
| Messages/sec | ~1000 | Dépend du transport (BroadcastChannel vs WebSocket) |
| Taille message | ~50MB | Limitation BroadcastChannel/WebSocket |
| Stream concurrent | 10 | Recommandé pour performance |
| Offline queue | 100 messages | Par worker destinataire |
| Duplicate cache TTL | 60s | Configurable dans DuplicateDetector |

### Optimization Tips

#### 1. Réduire la taille des payloads

```javascript
// MAUVAIS: envoyer tout l'objet
messageBus.request('Agent', { user: largeUserObject });

// BON: envoyer l'ID uniquement, agent récupère les données
messageBus.request('Agent', { userId: user.id });
```

#### 2. Utiliser le streaming pour les données volumineuses

```javascript
// MAUVAIS: request unique avec 10MB
messageBus.request('LLMAgent', { prompt, maxTokens: 100000 });

// BON: streaming avec chunks
messageBus.requestStream('LLMAgent', { prompt }, {
  onChunk: (chunk) => console.log(chunk),
  onEnd: () => console.log('Done'),
  onError: (err) => console.error(err)
});
```

#### 3. Pooling & Reuse des connections

```javascript
// Réutiliser le même MessageBus, ne pas en créer de nouveaux
class AgentConnection {
  private static instance: MessageBus;
  
  static getInstance() {
    if (!this.instance) {
      this.instance = new MessageBus('MainApp');
    }
    return this.instance;
  }
}
```

#### 4. Worker pooling

```javascript
// Créer un nombre fixe de workers, les réutiliser
const WORKER_POOL_SIZE = navigator.hardwareConcurrency || 4;
const workers: Worker[] = [];

function getAvailableWorker() {
  // Find least-loaded worker
  return workers.reduce((min, w) => 
    (w.loadFactor < min.loadFactor ? w : min)
  );
}
```

### Scaling Strategy

**Phase 1 - Development** (1-10 agents)
- Use BroadcastChannel transport
- Single process, all in-browser

**Phase 2 - Staging** (10-50 agents)
- Add relay server for cross-device communication
- Implement metrics collection
- Test with chaos monkey regularly

**Phase 3 - Production** (50+ agents)
- Use WebSocket relay with load balancing
- Implement proper metrics exporters (Prometheus)
- Add circuit breakers for external API calls
- Consider service mesh (if using backend microservices)

---

## Checklist Production

### Pre-Launch

- [ ] Tous les agents passent les tests E2E (100% success rate)
- [ ] Chaos monkey test > 95% success rate pendant 30s
- [ ] Pas de logs d'erreur persistants
- [ ] Metrics dashboard affiche les bonnes valeurs
- [ ] Observatory détecte tous les agents
- [ ] LLM model se charge correctement
- [ ] CalculatorAgent répond aux requêtes

### Post-Launch

- [ ] Monitorer error rate dans les 24h
- [ ] Vérifier que les alertes fonctionnent
- [ ] Tester une requête E2E complète (user → UI → OIE → LLM/Calculator → response)
- [ ] Vérifier les logs pour anomalies
- [ ] Documenter toute divergence par rapport aux baselines

### Maintenance Hebdomadaire

- [ ] Vérifier les logs d'erreur (grep for ERROR)
- [ ] Vérifier latency p99 (devrait rester < 500ms)
- [ ] Vérifier que le leader election fonctionne (check logs)
- [ ] Backup des metriques/logs
- [ ] Test de chaos monkey (au moins 1x par semaine)

### Maintenance Mensuelle

- [ ] Audit de la performance: latency trends, throughput trends
- [ ] Vérifier que tous les agents versionnés et à jour
- [ ] Revoir les alertes: ajuster seuils si nécessaire
- [ ] Planifier les upgrades de modèles LLM

---

## Support & Contact

Pour des issues :

1. Vérifier le DEBUGGING.md
2. Lire les logs avec filtering (grep, ripgrep)
3. Exécuter les tests E2E
4. Vérifier la documentation KENSHO_EXPLAINED.md

