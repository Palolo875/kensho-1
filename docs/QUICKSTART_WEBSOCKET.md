# 🚀 Guide de Démarrage Rapide - WebSocket Transport

## Installation des dépendances

Si ce n'est pas déjà fait, installez les dépendances WebSocket :

```bash
npm install
```

## Test en 3 étapes

### 1️⃣ Démarrer le serveur relais

Dans un premier terminal :

```bash
npm run relay
```

Vous devriez voir :
```
Kensho Relay Server started on port 8080
```

### 2️⃣ Builder les agents distants

Dans un second terminal :

```bash
npm run build:remote-agents
```

### 3️⃣ Lancer la démo

Dans le même terminal (ou un nouveau) :

```bash
npm run test:websocket
```

Cela va :
- Builder l'agent `RemotePingAgent`
- Ouvrir votre navigateur sur la page de test

### 4️⃣ Tester la communication multi-appareils

1. Ouvrez la même URL dans **deux navigateurs différents** (Chrome et Firefox par exemple)
2. Cliquez sur "🚀 Lancer le Test" dans chaque navigateur
3. Les deux agents se connectent au serveur relais et peuvent communiquer !

## Architecture

```
┌─────────────┐         ┌─────────────┐
│  Browser 1  │         │  Browser 2  │
│             │         │             │
│ RemotePing  │         │ RemotePing  │
│   Agent     │         │   Agent     │
└──────┬──────┘         └──────┬──────┘
       │                       │
       │   WebSocket           │
       │                       │
       └───────┬───────────────┘
               │
        ┌──────▼──────┐
        │   Relais    │
        │   Server    │
        │  (port 8080)│
        └─────────────┘
```

## Modes de Transport Disponibles

### Mode 1 : BroadcastChannel (Par défaut)
```typescript
runAgent({
    name: 'MyAgent',
    // Pas de config : utilise BroadcastChannel
    init: (runtime) => { /* ... */ }
});
```
✅ Ultra rapide  
❌ Limité au même domaine

### Mode 2 : WebSocket uniquement
```typescript
runAgent({
    name: 'MyAgent',
    config: { useWebSocket: true },
    init: (runtime) => { /* ... */ }
});
```
✅ Fonctionne entre appareils  
❌ Nécessite un serveur relais

### Mode 3 : Hybride (RECOMMANDÉ)
```typescript
runAgent({
    name: 'MyAgent',
    config: { useHybrid: true },
    init: (runtime) => { /* ... */ }
});
```
✅ Meilleur des deux mondes  
✅ Local rapide, distant fonctionnel  
✅ Déduplication automatique

## Configuration Avancée

### Changer le port du serveur

Éditez `server/relay.js` :
```javascript
const port = 3000; // Au lieu de 8080
```

### Pointer vers un serveur distant

Éditez `src/core/communication/transport/WebSocketTransport.ts` :
```typescript
constructor(url: string = 'ws://192.168.1.100:8080') {
    // ...
}
```

## Dépannage

### ❌ "WebSocket connection failed"
→ Vérifiez que le serveur relais est bien démarré (`npm run relay`)

### ❌ "404 Not Found" pour l'agent
→ Vérifiez que vous avez bien exécuté `npm run build:remote-agents`

### ❌ Les deux navigateurs ne se voient pas
→ Vérifiez qu'ils sont bien connectés au même serveur relais (regardez les logs du serveur)

## Prochaines Étapes

- Lisez `docs/TRANSPORT.md` pour plus de détails sur l'architecture
- Explorez le code de `src/core/communication/transport/`
- Implémentez vos propres transports !
