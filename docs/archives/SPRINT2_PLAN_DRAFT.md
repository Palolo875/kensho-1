# 🚀 Proposition de Plan : Sprint 2 - Persistence & State Management

## 🎯 Objectif Principal
Donner une **mémoire persistante** aux agents Kensho.
Actuellement, si un agent redémarre (comme vu dans le Chaos Test), il perd tout son état interne (sauf ce qui est reconstruit par le réseau).
Pour des applications complexes, les agents doivent pouvoir **sauvegarder leur état** et le **restaurer** après une panne.

---

## 📦 Fonctionnalités Clés

### 1. StateManager (Core)
- Interface unifiée pour la persistance (`saveState`, `loadState`, `clearState`)
- Support multi-backend :
  - `LocalStorage` (Simple, synchrone, limité)
  - `IndexedDB` (Robuste, asynchrone, grande capacité)
  - `InMemory` (Pour les tests)

### 2. Integration dans AgentRuntime
- Sauvegarde automatique périodique (Auto-save)
- Sauvegarde sur événements critiques (ex: avant shutdown propre)
- Restauration automatique au démarrage

### 3. Cas d'Usage Concrets
- **WorkerRegistry** : Se souvenir des pairs connus même après un reload de page.
- **OfflineQueue** : Persister les messages en attente (pour ne pas les perdre si l'expéditeur crash).
- **Application State** : Sauvegarder les données utilisateur.

---

## 📅 Planning Suggéré (Durée : 1 semaine)

### Jours 1-2 : StateManager Core
- Implémentation de l'interface et des adapters (LocalStorage/IndexedDB).
- Tests unitaires de stockage.

### Jours 3-4 : Intégration Système
- Intégrer `StateManager` dans `AgentRuntime`.
- Modifier `WorkerRegistry` pour utiliser la persistance.
- Modifier `OfflineQueue` pour persister les messages sur disque.

### Jours 5-6 : Tests de Résilience (Data Integrity)
- Test E2E : Tuer un agent, le redémarrer, vérifier qu'il a retrouvé sa mémoire.
- Validation de la reprise après crash.

---

## 🛡️ Pourquoi ce Sprint ?

Le **Sprint 1C** a prouvé que le système **survit** aux pannes (le réseau tient bon).
Le **Sprint 2** garantira que les **données survivent** aussi.

C'est l'étape indispensable pour passer d'un "système de communication" à une "plateforme d'application distribuée".

---

## 🔗 Liens
- Basé sur l'architecture validée en Sprint 1.
- Prépare le terrain pour des fonctionnalités avancées (ex: synchronisation de données).
