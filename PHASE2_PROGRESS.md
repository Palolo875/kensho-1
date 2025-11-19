# 🔧 Phase 2: MessageBus Refactoring - Progress

**Date**: 2025-11-19  
**Status**: IN PROGRESS

---

##  Objectif

Découper le `MessageBus` (500 lignes, "God Object") en modules spécialisés pour améliorer la maintenabilité.

---

## ✅ Étape 1: RequestManager (COMPLETE)

### Fichiers Créés
1. `src/core/communication/managers/RequestManager.ts`
   - Gère le cycle de vie des requêtes RPC
   - 130 lignes (vs 500 dans MessageBus)
   - Responsabilités claires : timeout, Promise management

2. `src/core/communication/managers/__tests__/RequestManager.test.ts`
   - 12 tests unitaires
   - Couvre :
     - `createRequest()` avec timeout
     - `handleResponse()` (success & error)
     - `cancelRequest()`
     - `getStats()`
     - `dispose()`

### API RequestManager
```typescript
class RequestManager {
    createRequest<T>(messageId, timeout?): Promise<T>
    handleResponse(message): boolean
    cancelRequest(messageId): boolean
    hasPendingRequest(messageId): boolean
    getPendingCount(): number
    getStats()
    dispose()
}
```

### Tests
- ✅ Timeout automatique
- ✅ Résolution sur réponse
- ✅ Rejection sur erreur
- ✅ Cleanup des timeouts
- ✅ Dispose rejette toutes les requêtes

---

## 🎯 Prochaines Étapes

### Étape 2: StreamManager
- Créer `src/core/communication/managers/StreamManager.ts`
- Extraire la gestion des streams du MessageBus
- Tests unitaires

### Étape 3: DuplicateDetector
- Créer `src/core/communication/managers/DuplicateDetector.ts`
- Extraire la détection de doublons
- Tests unitaires

### Étape 4: MessageRouter
- Créer `src/core/communication/managers/MessageRouter.ts`
- Routing des messages entrants
- Tests unitaires

### Étape 5: Intégration
- Modifier `MessageBus` pour utiliser les managers
- Garder la même API publique
- Vérifier que les tests E2E passent

---

## 📊 Impact Prévu

### Avant
- 1 fichier : 500 lignes
- 38 méthodes
- Couplage fort

### Après (estimé)
- 5 fichiers : ~100 lignes chacun
- 8 méthodes par fichier
- Faible couplage
- Chaque module testé isolément

---

**Status** : Étape 1/5 complète
