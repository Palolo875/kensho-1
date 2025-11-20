# 🎉 Sprint 1C - OfflineQueue - Complété

## ✅ Résumé des Réalisations

Nous avons implémenté un **système de mise en file d'attente robuste** pour gérer les messages destinés à des workers qui ne sont pas encore en ligne (OfflineQueue).

### 1. Classe OfflineQueue (`src/core/communication/OfflineQueue.ts`)

**Fonctionnalités principales** :
- **Enqueue** : Met messages en file d'attente pour workers hors ligne
- **Flush** : Renvoie tous les messages valides quand un worker revient en ligne
- **Protection mémoire** :
  - Taille max par queue : 100 messages
  - Âge max des messages : 60 secondes
  - Nettoyage périodique des messages expirés
- **Statistiques** : Retourne l'état des queues pour l'Observatory

**Protections implémentées** :
```typescript
MAX_QUEUE_SIZE = 100        // Évite la surcharge mémoire
MAX_MESSAGE_AGE_MS = 60000  // Messages expirés sont supprimés
cleanEvery = 30 seconds     // Nettoyage automatique
```

### 2. Intégration dans MessageBus (`src/core/communication/MessageBus.ts`)

**Nouveautés** :
- **`knownWorkers: Set<WorkerName>`** : Suivi des workers actifs
- **`offlineQueue: OfflineQueue`** : Instance de la queue
- **`cleanupInterval`** : Nettoyage périodique (30s)

**Nouvelles méthodes publiques** :
```typescript
notifyWorkerOnline(workerName)  // Appelé par Guardian quand worker apparaît
notifyWorkerOffline(workerName) // Appelé quand worker disparaît
getQueueStats()                 // Statistiques pour Observatory
```

**Logique modifiée dans `request()`** :
1. Vérifier si le worker cible est connu
2. Si **NON** :
   - Créer le message avec un `messageId`
   - L'ajouter à la queue via `enqueue()`
   - Lancer `waitForWorkerAndRetry()` qui vérifie toutes les 100ms
3. Si **OUI** : Envoyer normalement

**Fonction `waitForWorkerAndRetry()`** :
- Boucle de vérification toutes les 100ms
- Attend que le message soit dans `pendingRequests` (signifie qu'il a été envoyé)
- Timeout si le worker ne revient pas dans le délai

**Fonction `notifyWorkerOnline()`** :
- Appelée par `OrionGuardian` quand un worker envoie un message
- Flush la queue du worker
- Renvoie tous les messages en attente
- Enregistre les requêtes dans `pendingRequests`

### 3. Intégration dans OrionGuardian (`src/core/guardian/OrionGuardian.ts`)

**Modification de `handleSystemMessage()`** :
```typescript
private handleSystemMessage(message: KenshoMessage): void {
    // Le simple fait de recevoir un message est une preuve de vie
    this.messageBus.notifyWorkerOnline(message.sourceWorker);
    this.workerRegistry.update(message.sourceWorker);
    // ... reste du code
}
```

Chaque message système reçu notifie le `MessageBus` que le worker est en ligne, ce qui déclenche automatiquement le flush de sa queue si nécessaire.

## 📊 Flux de Fonctionnement

### Scénario 1 : Worker hors ligne
```
1. AgentA envoie un message à AgentX (hors ligne)
2. MessageBus détecte que AgentX n'est pas dans knownWorkers
3. Message mis en queue offlineQueue.enqueue('AgentX', message)
4. waitForWorkerAndRetry() commence à vérifier toutes les 100ms
```

### Scénario 2 : Worker revient en ligne
```
1. AgentX envoie un message système (heartbeat, election, etc.)
2. Guardian reçoit le message → notifyWorkerOnline('AgentX')
3. MessageBus ajoute 'AgentX' à knownWorkers
4. MessageBus flush la queue : offlineQueue.flush('AgentX')
5. Tous les messages en attente sont renvoyés
6. waitForWorkerAndRetry() détecte que message est dans pendingRequests
7. La promesse sera résolue normalement quand la réponse arrive
```

###Scénario 3 : Timeout
```
1. Worker ne revient JAMAIS en ligne
2. waitForWorkerAndRetry() timeout après X ms
3. La promesse est rejetée avec erreur explicite
4. Messages restent en queue (ou expirent après 60s)
```

## 🎯 Cas d'Usage

### 1. Startup Non Synchronisé
- AgentA démarre et essaie immédiatement de contacter AgentB
- AgentB démarre 5 secondes plus tard
- ✅ Les messages d'AgentA sont mis en queue
- ✅ Dès qu'AgentB est online, il reçoit tous les messages

### 2. Reconnexion après Panne
- AgentC crash et redémarre
- Pendant son absence, AgentA lui envoie 3 messages
- ✅ Les 3 messages sont gardés en queue (max 60s)
- ✅ Quand AgentC revient, il reçoit tous les messages

### 3. Protection Mémoire
- 150 messages envoyés à un worker qui n'existe pas
- ✅ Seulement les 100 derniers sont gardés
- ✅ Les 50 premiers sont automatiquement supprimés

### 4. Messages Expirés
- Un worker est offline pendant 2 minutes
- Des messages de 70 secondes sont en queue
- ✅ Cleanup automatique les supprime
- ✅ Seulement les messages récents (<60s) sont délivrés

## 📝 Fichiers Créés/Modifiés

**Nouveaux fichiers** :
- `src/core/communication/OfflineQueue.ts` (124 lignes)

**Fichiers modifiés** :
- `src/core/communication/MessageBus.ts` : +80 lignes
  - Import OfflineQueue
  - Propriétés knownWorkers, offlineQueue, cleanupInterval
  - Constructeur étendu
  - Logique request() modifiée
  - Nouvelles méthodes : notifyWorkerOnline/Offline, waitForWorkerAndRetry, getQueueStats
  - dispose() met à jour
  
- `src/core/guardian/OrionGuardian.ts` : +2 lignes
  - Appel à `notifyWorkerOnline()` dans handleSystemMessage

## ✨ Avantages du Système

1. **Résilience** : Les messages ne sont JAMAIS perdus (sauf expiration)
2. **Transparence** : L'appelant n'a pas besoin de savoir si le worker est online
3. **Protection mémoire** : Limites strictes pour éviter les fuites
4. **Performance** : Nettoyage périodique automatique
5. **Observabilité** : Statistiques disponibles via `getQueueStats()`

## 🚀 Prochaines Étapes Possibles

1. **Afficher les queues dans l'Observatory** : Onglet dédié aux messages en attente
2. **Priorité des messages** : Messages critiques passent en premier
3. **Persistance** : Sauvegarder la queue dans localStorage
4. **Retry policy** : Politique de réessai configurable
5. **Dead Letter Queue** : Queue spéciale pour messages qui échouent trop souvent

## 🎯 Conclusion

Le Sprint 1C est **complet** ! Le système Kensho peut maintenant gérer de manière robuste les situations où des workers communiquent de manière asynchrone, même s'ils ne sont pas tous démarrés en même temps ou si certains sont temporairement hors ligne.

**Le MessageBus est devenu un véritable système de messaging fiable avec garantie de délivrance différée** ! 🎊

---
*Implémenté le 19/11/2025 par Antigravity*
