# 🔧 Phase 2 - Implementation Plan: MessageBus Refactoring

## Analyse du Problème

### État Actuel
Le `MessageBus.ts` est un **God Object** avec 500 lignes et 38 méthodes gérant :
- ✅ Request/Response (RPC)
- ✅ Streaming (chunks, end, error)
- ✅ OfflineQueue integration
- ✅ Duplicate detection
- ✅ Request caching
- ✅ Timeouts & cleanup
- ✅ System messages (broadcast)
- ✅ Storage integration

### Problèmes Identifiés
1. **Trop de responsabilités** : Violation du Single Responsibility Principle
2. **Difficile à tester** : Beaucoup de dépendances internes
3. **Difficile à maintenir** : Changer une fonctionnalité risque de casser une autre
4. **Couplage fort** : Les fonctionnalités sont imbriquées

---

## 🎯 Objectif du Refactoring

Extraire les responsabilités en **modules indépendants** tout en gardant la même API publique.

### Principe: Facade Pattern
Le `MessageBus` restera le point d'entrée, mais déléguera aux modules spécialisés.

---

## 📦 Modules Proposés

### 1. `RequestManager` 
**Responsabilité** : Gérer les requêtes/réponses RPC
- `pendingRequests` Map
- Timeouts des requêtes
- Promise resolution/rejection

**Méthodes** :
- `sendRequest(target, payload, timeout): Promise<T>`
- `handleResponse(message)`
- `cancelRequest(messageId)`

---

### 2. `StreamManager`
**Responsabilité** : Gérer les streams
- `activeStreams` Map
- Stream timeouts
- Callbacks (onChunk, onEnd, onError)

**Méthodes** :
- `createStream(target, payload, callbacks): streamId`
- `handleChunk(message)`
- `handleEnd(message)`
- `handleError(message)`
- `sendChunk(streamId, data, target)`
- `sendEnd(streamId, payload, target)`
- `sendError(streamId, error, target)`

---

### 3. `DuplicateDetector`
**Responsabilité** : Détecter les doublons
- `recentlyProcessedRequests` Map (cache)
- Cleanup périodique

**Méthodes** :
- `isDuplicate(messageId): boolean`
- `markAsProcessed(messageId, response, error?)`
- `getResponse(messageId): { response, error? }`
- `cleanup()`

---

### 4. `MessageRouter`
**Responsabilité** : Router les messages entrants
- Dispatcher vers Request/Response/Stream/System handlers

**Méthodes** :
- `route(message)` → dispatcher vers le bon handler

---

### 5. `MessageBus` (Facade)
**Responsabilité** : Orchestrer les modules
- Initialisation des modules
- API publique stable
- Coordination

**API Publique (inchangée)** :
```typescript
class MessageBus {
    // RPC
    request<T>(target, payload, timeout?): Promise<T>
    setRequestHandler(handler)
    
    // Streaming
    requestStream<T>(target, payload, callbacks): streamId
    sendStreamChunk(streamId, data, target)
    sendStreamEnd(streamId, payload, target)
    sendStreamError(streamId, error, target)
    
    // System
    broadcastSystemMessage(type, payload)
    subscribeToSystemMessages(callback)
    
    // Workers
    notifyWorkerOnline(workerName)
    notifyWorkerOffline(workerName)
    
    // Lifecycle
    dispose()
}
```

---

## 📁 Structure de Fichiers

```
src/core/communication/
├── MessageBus.ts                 # Facade (orchestrator)
├── managers/
│   ├── RequestManager.ts         # RPC request/response
│   ├── StreamManager.ts          # Streaming
│   ├── DuplicateDetector.ts      # Duplicate detection
│   └── MessageRouter.ts          # Message routing
├── OfflineQueue.ts               # Existing
└── types/
    └── index.ts                  # Existing
```

---

## 🚀 Plan d'Implémentation

### Étape 1: Créer `RequestManager`
- Extraire `pendingRequests`, `request()`, `processResponseMessage()`
- Tests unitaires pour `RequestManager`

### Étape 2: Créer `StreamManager`
- Extraire `activeStreams`, `requestStream()`, stream handlers
- Tests unitaires pour `StreamManager`

### Étape 3: Créer `DuplicateDetector`
- Extraire `recentlyProcessedRequests`, détection, cleanup
- Tests unitaires pour `DuplicateDetector`

### Étape 4: Créer `MessageRouter`
- Extraire `handleIncomingMessage()` routing logic
- Tests unitaires pour `MessageRouter`

### Étape 5: Refactor `MessageBus`
- Instancier les managers
- Déléguer aux managers
- Garder l'API publique identique

### Étape 6: Tests E2E
- Vérifier que tous les tests E2E existants passent toujours
- Pas de régression

---

## ✅ Bénéfices Attendus

### Avant
- ❌ 500 lignes dans un seul fichier
- ❌ 38 méthodes dans une classe
- ❌ Difficile à tester unitairement
- ❌ Couplage fort

### Après
- ✅ ~100 lignes par module (5 fichiers)
- ✅ ~8 méthodes par classe
- ✅ Chaque module testé isolément
- ✅ Faible couplage, haute cohésion
- ✅ **Même API publique** (backward compatible)

---

## 🧪 Validation

1. **Tests Unitaires** : Chaque manager a sa suite de tests
2. **Tests E2E** : Tous les tests existants passent sans modification
3. **Coverage** : Maintenir ~85% de couverture

---

## ⏱️ Estimation

- **Étape 1-4** : ~2-3h (création des managers + tests)
- **Étape 5** : ~1h (refactor MessageBus)
- **Étape 6** : ~30min (validation E2E)
- **Total** : ~4h

---

**Prêt à commencer ?**

Je propose de commencer par **`RequestManager`** (le plus critique).
