# Système de Transport Kensho

Kensho supporte désormais plusieurs modes de transport pour la communication entre agents.

## Architecture

Le `MessageBus` utilise une abstraction `NetworkTransport` qui permet de changer le mécanisme de communication sous-jacent sans modifier la logique des agents.

### Transports Disponibles

1.  **BroadcastTransport** (Défaut)
    *   Utilise l'API `BroadcastChannel` du navigateur.
    *   **Portée** : Même origine (onglets, iframes, workers du même domaine).
    *   **Performance** : Très haute, latence quasi-nulle.
    *   **Usage** : Développement local, applications SPA.

2.  **WebSocketTransport**
    *   Utilise une connexion WebSocket via un serveur de relais.
    *   **Portée** : Réseau (différents navigateurs, différents appareils).
    *   **Performance** : Dépend du réseau.
    *   **Usage** : Systèmes distribués réels, tests cross-browser.

## Utilisation

### Démarrer le Serveur Relais

Pour utiliser le transport WebSocket, vous devez démarrer le serveur de relais :

```bash
node server/relay.js
```

Le serveur écoute sur le port 8080 par défaut.

### Configurer un Agent

Vous pouvez configurer un agent pour utiliser WebSocket lors de sa définition :

```typescript
// src/agents/my-agent/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';

runAgent({
    name: 'MyRemoteAgent',
    config: {
        useWebSocket: true // Active le transport WebSocket
    },
    init: (runtime) => {
        // ...
    }
});
```

### Extension Future (WebRTC)

L'architecture est prête pour WebRTC. Il suffirait d'implémenter `WebRTCTransport` qui utilise le serveur WebSocket pour la signalisation (échange d'offres/réponses SDP) puis établit une connexion P2P directe (DataChannel).
