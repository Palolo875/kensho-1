# Architecture Kensho - "Constellation Résiliente"

> Un système multi-agents résilient basé sur une communication décentralisée via MessageBus

---

## 🎯 Vision d'Ensemble

Kensho est une architecture d'agents distribués qui communiquent via un **MessageBus résilient**. Chaque agent s'exécute dans son propre Worker isolé, permettant un parallélisme véritable et une tolérance aux pannes.

### Principes Fondamentaux

1. **Isolation** : Chaque agent est un Worker indépendant
2. **Communication** : Un seul point de passage - le MessageBus
3. **Résilience** : Gestion des pannes, retry automatique, offline queue
4. **Performance** : Streaming, deduplication, métriques
5. **Sécurité** : Validation de payloads, authentification, rate limiting

---

## 🏗️ Architecture Globale

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Thread (UI)                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   React    │  │ MessageBus │  │  Storage   │            │
│  │    App     │──│   Client   │──│  Adapter   │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
│ LLM Agent    │ │State Agent│ │Custom Agent │
│  (Worker)    │ │  (Worker) │ │  (Worker)   │
│              │ │           │ │             │
│ MessageBus   │ │MessageBus │ │ MessageBus  │
└──────────────┘ └───────────┘ └─────────────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
                ┌───────▼────────┐
                │  BroadcastAPI  │
                │   WebSocket    │
                │  SharedWorker  │
                └────────────────┘
```

---

## 📦 Structure des Dossiers

```
kensho-1/
├── src/
│   ├── core/                    # Système central
│   │   ├── communication/       # MessageBus et composants réseau
│   │   │   ├── MessageBus.ts    # 🧠 Cerveau central
│   │   │   ├── managers/        # Gestionnaires spécialisés
│   │   │   │   ├── RequestManager.ts      # Gestion des requêtes RPC
│   │   │   │   ├── StreamManager.ts       # Gestion des streams
│   │   │   │   ├── DuplicateDetector.ts   # Détection de doublons
│   │   │   │   └── MessageRouter.ts       # Routage de messages
│   │   │   ├── transport/       # Couches de transport
│   │   │   │   ├── BroadcastTransport.ts  # BroadcastChannel
│   │   │   │   ├── WebSocketTransport.ts  # WebSocket
│   │   │   │   └── NetworkTransport.ts    # Interface
│   │   │   ├── validation/      # Validation de payloads
│   │   │   │   ├── PayloadValidator.ts    # Zod schemas
│   │   │   │   └── schemas.ts
│   │   │   └── OfflineQueue.ts  # File d'attente hors ligne
│   │   ├── storage/             # Persistance (IndexedDB, localStorage)
│   │   └── metrics/             # Collecte de métriques
│   │
│   ├── agents/                  # Agents métier
│   │   ├── BaseLLMAgent.ts      # Agent LLM générique
│   │   ├── StateAgent.ts        # Gestion d'état centralisé
│   │   └── test/                # Agents de test
│   │
│   ├── features/                # Fonctionnalités UI React
│   │   ├── chat/
│   │   └── admin/
│   │
│   └── shared/                  # Utilitaires partagés
│       ├── ui/                  # Composants UI réutilisables
│       └── utils/
│
├── server/                       # Serveur Node.js
│   ├── relay.js                  # Relay WebSocket simple
│   ├── relay.secure.js           # Relay avec auth JWT
│   ├── auth/                     # Gestion JWT
│   └── middleware/               # Rate limiting, auth
│
├── tests/                        # Tests
│   ├── browser/                  # Tests E2E navigateur
│   └── poc/                      # Proof of Concepts
│
├── benchmarks/                   # Tests de performance
│   ├── throughput.ts
│   └── latency.ts
│
└── docs/                         # Documentation
    ├── GETTING_STARTED.md
    ├── SECURITY.md
    └── QUICKSTART_WEBSOCKET.md
```

---

## 🧠 Composant Central : MessageBus

Le **MessageBus** est le cerveau de Kensho. Il gère toute la communication inter-workers.

### Responsabilités

1. **Envoi de requêtes RPC** (`request()`)
2. **Gestion de streams** (`requestStream()`)
3. **Broadcast de messages système** (`broadcastSystemMessage()`)
4. **Détection de doublons** (via DuplicateDetector)
5. **Gestion hors ligne** (via OfflineQueue)
6. **Validation de sécurité** (via PayloadValidator)
7. **Métriques** (via MetricsCollector)

### Managers Spécialisés

Le MessageBus délègue à des **managers spécialisés** :

#### 1. RequestManager
- Gère les requêtes/réponses RPC avec Promise-based API
- Timeout automatique
- Correlation de requêtes/réponses

#### 2. StreamManager
- Gère les flux de données en streaming
- Callbacks pour chunks, end, error
- Support de l'annulation

#### 3. DuplicateDetector
- Détecte les messages dupliqués (retry, réseau)
- Cache les réponses pour renvoyer instantanément
- TTL configurable

#### 4. MessageRouter
- Route les messages selon leur type
- Handlers spécialisés pour chaque type
- Extensible pour nouveaux types

---

## 🔄 Flux de Communication

### Requête RPC Simple

```typescript
// Thread principal
const result = await messageBus.request('StateAgent', {
  method: 'getState',
  args: ['user.profile']
});

// Flow:
// 1. MessageBus.request() crée une Promise
// 2. RequestManager enregistre la promesse avec messageId
// 3. Message envoyé via Transport (BroadcastChannel ou WebSocket)
// 4. StateAgent reçoit, traite, répond
// 5. RequestManager résout la Promise avec la réponse
```

### Stream (flux continu)

```typescript
// Thread principal
const streamId = messageBus.requestStream('LLMAgent', 
  { method: 'generateResponse', args: ['Question?'] },
  {
    onChunk: (chunk) => console.log(chunk.text),
    onEnd: () => console.log('Terminé'),
    onError: (err) => console.error(err)
  }
);

// Flow:
// 1. StreamManager crée un stream avec callbacks
// 2. Message stream_request envoyé
// 3. LLMAgent génère des chunks progressivement
// 4. Chaque chunk déclenche onChunk()
// 5. stream_end déclenche onEnd()
```

---

## 🌐 Transports Supportés

### 1. BroadcastChannel (par défaut)
- **Usage** : Workers dans le même onglet
- **Performance** : Très rapide (in-process)
- **Limite** : Même origine, même onglet

### 2. WebSocket
- **Usage** : Workers sur différents onglets, ou serveurs distants
- **Performance** : Bon (réseau local)
- **Limite** : Nécessite un serveur relay

### 3. SharedWorker (futur)
- **Usage** : Partage entre onglets
- **Performance** : Très rapide
- **Limite** : Support navigateur limité

---

## 🔒 Sécurité

### Validation de Payloads (Zod)

Tous les messages entrants sont validés :

```typescript
const messageSchema = z.object({
  messageId: z.string().min(1),
  traceId: z.string().optional(),
  sourceWorker: z.string().min(1),
  targetWorker: z.string().min(1),
  type: z.enum([...]),
  payload: z.unknown()
});
```

### Sanitization

- Détection de scripts malveillants
- Limite de taille de payload (1MB)
- Validation de structure

### Relay Server Sécurisé

- Authentification JWT
- Rate limiting (100 req/min par IP)
- CORS configuré
- Logs d'audit

---

## 📊 Métriques & Observabilité

### Métriques Collectées

1. **Latence** : Temps de traitement des requêtes
2. **Throughput** : Messages/seconde
3. **Taux d'erreur** : Erreurs/total
4. **Queue depth** : Taille de la file d'attente

### Accès

```typescript
const stats = messageBus.getStats();
// {
//   requests: { pending: 2, completed: 150, timeout: 1 },
//   streams: { active: 1, total: 20 },
//   duplicates: { detected: 5, cached: 100 },
//   metrics: { latency_p95: 45ms, throughput: 120 }
// }

const report = messageBus.getMetricsReport();
console.log(report); // Rapport formaté
```

---

## 🚀 Résilience & Tolérance aux Pannes

### 1. Offline Queue

Messages mis en queue si le destinataire est offline :

```typescript
messageBus.notifyWorkerOffline('LLMAgent');
// Messages pour LLMAgent sont mis en queue

messageBus.notifyWorkerOnline('LLMAgent');
// Queue flushée automatiquement
```

### 2. Retry Automatique

Les requêtes timeout peuvent être re-tentées automatiquement.

### 3. Détection de Doublons

Évite le retraitement de messages dupliqués (réseau instable).

### 4. Graceful Degradation

Si un agent crashe, les autres continuent de fonctionner.

---

## 🧪 Tests

### Tests Unitaires (Vitest)

- Tous les managers ont des tests unitaires
- Couverture > 80% visée
- Mocking des transports

### Tests E2E (Browser)

- Tests end-to-end dans un navigateur réel
- Validation de l'intégration complète
- Scénarios de pannes

### Benchmarks

- Tests de performance (throughput, latency)
- Détection de régressions

---

## 🎯 Patterns & Best Practices

### 1. Agent Pattern

Chaque agent hérite de la même structure :

```typescript
class MyAgent {
  private messageBus: MessageBus;

  constructor() {
    this.messageBus = new MessageBus('MyAgent');
    this.messageBus.setRequestHandler(this.handleRequest.bind(this));
  }

  private async handleRequest(payload: unknown) {
    const { method, args } = payload as { method: string; args: any[] };
    
    switch (method) {
      case 'myMethod':
        return this.myMethod(...args);
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
}
```

### 2. Structured Logging

```typescript
console.log('[MyAgent] Processing request', { requestId, method });
console.error('[MyAgent] Error during processing', { error, context });
```

### 3. Error Handling

```typescript
try {
  const result = await messageBus.request(...);
} catch (error) {
  if (error.code === 'TIMEOUT') {
    // Gérer timeout
  } else if (error.code === 'NO_HANDLER') {
    // Agent non disponible
  }
}
```

---

## 🔮 Évolutions Futures

1. **Distributed Tracing** : OpenTelemetry pour tracer les requêtes
2. **Circuit Breaker** : Protection contre les agents défaillants
3. **Load Balancing** : Plusieurs instances d'un même agent
4. **Persistence Layer** : MessageBus persistant (survit au reload)
5. **GraphQL-like Query** : Requêtes structurées plus riches

---

## 📚 Ressources

- [GETTING_STARTED.md](./docs/GETTING_STARTED.md) : Guide de démarrage
- [SECURITY.md](./docs/SECURITY.md) : Guide de sécurité
- [CONTRIBUTING.md](./CONTRIBUTING.md) : Comment contribuer
- [RISKS.md](./RISKS.md) : Tableau de bord des risques

---

**Philosophie** : Simplicité, Résilience, Performance - dans cet ordre. 🚀
