# 📊 Sprint 2 - État d'Avancement

## 🔄 Changement de Cap
Initialement prévu pour la **Persistance**, le Sprint 2 s'est orienté vers le support du **Streaming** suite à une demande prioritaire.

## ✅ Réalisations (Streaming)

### Core
- [x] **Types** : Ajout de `stream_request`, `stream_chunk`, `stream_end`, `stream_error`.
- [x] **MessageBus** : Implémentation de la logique de routing de flux.
    - [x] Support explicite de `stream_request`.
    - [x] Injection de `streamId` et `sourceWorker` dans le payload pour les handlers.
- [x] **AgentRuntime** : API développeur (`registerStreamMethod`, `callAgentStream`).
- [x] **Robustesse** : Timeout automatique des streams inactifs (5min).
- [x] **Qualité** : Typage strict (`unknown` vs `any`) et correction des lints.

### Validation
- [x] **Test E2E** : `tests/browser/sprint2-streaming-e2e.html` réécrit pour utiliser `MessageBus` directement (isolation).
- [x] **Build** : `npm run build:test-agents` passe avec succès.

## 📝 Documentation
- `SPRINT2_STREAMING_COMPLETE.md` : Détails techniques.
- `SPRINT2_STREAMING_VALIDATION.md` : Guide de test manuel.

---

## 🎯 Prochaines Étapes (Sprint 3)

1.  **Persistance (IndexedDB)** :
    - Implémenter `IndexedDBAdapter`.
    - Sauvegarder l'état des agents.
    - Intégrer avec `AgentRuntime`.
