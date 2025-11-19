# 💾 Système de Persistance Kensho

## Implémentation

Le système de persistance utilise **IndexedDB** pour stocker les données localement dans le navigateur.

### Architecture

```
src/core/storage/
├── types.ts              # Interface StorageAdapter + constantes STORES
└── IndexedDBAdapter.ts   # Implémentation IndexedDB
```

### Utilisation

```typescript
import { IndexedDBAdapter } from './src/core/storage/IndexedDBAdapter';
import { STORES } from './src/core/storage/types';

const storage = new IndexedDBAdapter();

// Sauvegarder
await storage.set(STORES.AGENT_STATE, 'myAgentId', {
    name: 'Agent1',
    memory: { lastAction: 'ping' }
});

// Charger
const state = await storage.get(STORES.AGENT_STATE, 'myAgentId');

// Tout récupérer
const allStates = await storage.getAll(STORES.AGENT_STATE);

// Supprimer
await storage.delete(STORES.AGENT_STATE, 'myAgentId');

// Vider un store
await storage.clear(STORES.AGENT_STATE);
```

### Stores Disponibles

- `AGENT_STATE` : État des agents
- `OFFLINE_QUEUE` : Messages en attente
- `WORKER_REGISTRY` : Workers connus
- `TELEMETRY` : Logs et métriques

### Test

Ouvrir `tests/browser/storage-test.html` dans un navigateur pour tester manuellement.

### Prochaines étapes

1. **Intégrer dans OfflineQueue** : Sauvegarder les messages
2. **Intégrer dans AgentRuntime** : Méthodes `save()` et `load()` 
3. **Intégrer dans OrionGuardian** : Persister le WorkerRegistry

## Exemple Complet : Persistance d'Agent

```typescript
class PersistentAgent {
    constructor(private storage: StorageAdapter, private agentId: string) {}

    async saveState(state: unknown) {
        await this.storage.set(STORES.AGENT_STATE, this.agentId, state);
    }

    async loadState<T>(): Promise<T | undefined> {
        return this.storage.get<T>(STORES.AGENT_STATE, this.agentId);
    }
}
```
