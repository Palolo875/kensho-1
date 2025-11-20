# 🚀 Kensho Improvement Roadmap

## Vision
Transformer Kensho en une plateforme production-ready pour les systèmes multi-agents dans le navigateur.

---

## 📅 Phase 1: Fondations Critiques (2-3 semaines)

### Sprint 3: Persistance ⭐ PRIORITÉ ABSOLUE
**Objectif**: Sauvegarder l'état des agents et du système pour survivre aux rechargements.

#### Tâches
- [ ] Implémenter `IndexedDBAdapter` (interface `StorageAdapter`)
- [ ] Rendre `OfflineQueue` persistante
- [ ] Sauvegarder le `WorkerRegistry` (agents connus)
- [ ] Intégrer dans `AgentRuntime` (méthodes `save()` / `load()`)
- [ ] Test E2E: Vérifier qu'un reload préserve les messages en queue

**Livrables**: 
- `src/core/storage/IndexedDBAdapter.ts`
- `src/core/storage/types.ts`
- Test E2E `sprint3-persistence-e2e.html`

---

### Sprint 4: Tests Unitaires (Vitest)
**Objectif**: Automatiser la validation de la logique métier pour détecter les régressions.

#### Tâches
- [ ] Configurer Vitest (déjà dans `package.json`)
- [ ] Tests `MessageBus`:
  - [ ] Routing de messages (request/response)
  - [ ] Timeout des requêtes
  - [ ] Détection de doublons
  - [ ] Streaming (chunk/end/error)
- [ ] Tests `OfflineQueue`:
  - [ ] Enqueue/Dequeue
  - [ ] Expiration des messages
  - [ ] Persistance (avec mock IndexedDB)
- [ ] Tests `OrionGuardian`:
  - [ ] Heartbeat
  - [ ] Leader Election
  - [ ] Détection de pannes
- [ ] CI/CD: Intégrer les tests dans GitHub Actions

**Livrables**:
- `src/core/communication/__tests__/MessageBus.test.ts`
- `src/core/communication/__tests__/OfflineQueue.test.ts`
- `src/core/guardian/__tests__/OrionGuardian.test.ts`
- `.github/workflows/ci.yml`

---

## 📅 Phase 2: Architecture & Qualité (2-3 semaines)

### Sprint 5: Refactoring du MessageBus
**Objectif**: Découper le "God Object" pour améliorer la maintenabilité.

#### Tâches
- [ ] Extraire `StreamManager` (gestion des streams actifs)
- [ ] Extraire `RequestManager` (gestion des requêtes pending)
- [ ] Extraire `DuplicateDetector` (cache de détection)
- [ ] MessageBus devient un orchestrateur léger
- [ ] Tests unitaires pour chaque nouveau module

**Architecture Cible**:
```
MessageBus
  ├─ StreamManager
  ├─ RequestManager
  ├─ DuplicateDetector
  └─ OfflineQueueManager
```

**Livrables**:
- `src/core/communication/managers/StreamManager.ts`
- `src/core/communication/managers/RequestManager.ts`
- Documentation du refactoring

---

### Sprint 6: Gestion d'Erreurs Avancée
**Objectif**: Implémenter retry automatique et circuit breaker.

#### Tâches
- [ ] **Retry Strategy**: Configurable (nombre de tentatives, backoff exponentiel)
- [ ] **Circuit Breaker**: Si un agent échoue X fois, le mettre en quarantaine
- [ ] Integration dans `MessageBus.request()`
- [ ] Métriques: Tracker les taux d'échec par agent
- [ ] Test E2E: Vérifier le comportement avec un agent défaillant

**Config Example**:
```typescript
messageBus.request('FailingAgent', payload, {
  retryStrategy: { maxRetries: 3, backoff: 'exponential' },
  circuitBreaker: { threshold: 5, timeout: 30000 }
});
```

**Livrables**:
- `src/core/communication/resilience/RetryStrategy.ts`
- `src/core/communication/resilience/CircuitBreaker.ts`

---

## 📅 Phase 3: Observabilité & Documentation (2 semaines)

### Sprint 7: Observabilité Avancée
**Objectif**: Métriques temps réel et visualisations dans l'Observatory.

#### Tâches
- [ ] **Métriques Collectées**:
  - Latence (min, max, P50, P95, P99)
  - Débit (messages/sec)
  - Taux d'erreur
  - Messages en queue
- [ ] **Dashboard Recharts**:
  - Graphe de latence (temps réel)
  - Graphe de débit
  - Heatmap des erreurs par agent
- [ ] **Filtres Avancés**:
  - Par agent
  - Par période
  - Par niveau de log

**Livrables**:
- `src/ui/observatory/MetricsDashboard.tsx`
- `src/core/telemetry/MetricsCollector.ts`

---

### Sprint 8: Documentation Technique Complète
**Objectif**: Faciliter l'onboarding et les contributions.

#### Tâches
- [ ] **Diagrammes d'Architecture**:
  - Flux de messages (request/response, stream)
  - Lifecycle d'un agent
  - Election de leader (diagramme de séquence)
- [ ] **API Reference**:
  - Générer avec TypeDoc
  - Commenter toutes les méthodes publiques (JSDoc)
- [ ] **Exemples Réels**:
  - Chat multi-utilisateurs
  - LLM Assistant avec streaming
  - Dashboard collaboratif
- [ ] **Contributing Guide**: Comment ajouter un transport, un agent, etc.

**Livrables**:
- `docs/ARCHITECTURE.md` (avec Mermaid diagrams)
- `docs/API_REFERENCE.md` (généré)
- `docs/examples/` (code fonctionnel)
- `CONTRIBUTING.md`

---

## 📅 Phase 4: Sécurité (1-2 semaines)

### Sprint 9: Authentification & Validation
**Objectif**: Sécuriser les WebSockets et les payloads.

#### Tâches
- [ ] **WebSocket Auth**:
  - Handshake avec JWT
  - Expiration et refresh de tokens
  - Rejection des connexions non-auth
- [ ] **Validation des Payloads**:
  - Intégrer Zod pour valider les schémas
  - Rejeter les messages malformés
- [ ] **Rate Limiting**:
  - Limiter les messages/sec par agent
  - Protection contre le flooding
- [ ] **Test de Sécurité**:
  - Tenter de se connecter sans token
  - Envoyer un payload invalide

**Livrables**:
- `server/auth-middleware.js`
- `src/core/communication/validation/PayloadValidator.ts`
- `docs/SECURITY.md`

---

## 📅 Phase 5: Optimisation & Tooling (1 semaine)

### Sprint 10: Configuration Unifiée
**Objectif**: Simplifier les configs Vite multiples.

#### Tâches
- [ ] Créer `vite.base.config.ts` (config partagée)
- [ ] Les autres configs héritent de la base
- [ ] Unifier les scripts npm
- [ ] Documentation du système de build

---

## 🎯 Métriques de Succès

| Phase | Indicateur | Objectif |
|-------|-----------|----------|
| Phase 1 | F5 ne perd plus l'état | 100% des agents récupèrent leur état |
| Phase 2 | Couverture de tests | >70% du code core |
| Phase 3 | Time to understand | <1h pour un nouveau contributeur |
| Phase 4 | Vulnérabilités | 0 issue de sécurité critique |
| Phase 5 | Build time | <10s en dev, <30s en prod |

---

## 🗺️ Timeline Estimée

```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│   Phase 1   │   Phase 2   │   Phase 3   │   Phase 4   │   Phase 5   │
│  (3 weeks)  │  (3 weeks)  │  (2 weeks)  │  (2 weeks)  │  (1 week)   │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
                            ~11 semaines total
```

---

## 🚦 Prochaine Action Immédiate

**Démarrer Sprint 3 (Persistance)**:
1. Créer `src/core/storage/types.ts` avec les interfaces
2. Implémenter `IndexedDBAdapter`
3. Tester avec une démo simple (sauver/charger un objet)

**Cette roadmap est valide et atteignable. Voulez-vous que je commence par le Sprint 3 ?**
