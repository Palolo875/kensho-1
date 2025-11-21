# 🚀 Getting Started with Kensho

Bienvenue dans Kensho ! Ce guide vous aidera à créer votre première application multi-agents en moins de 10 minutes.

## 📦 Installation

```bash
# Cloner le repo (si ce n'est pas déjà fait)
git clone https://github.com/Palolo875/kensho-1.git
cd kensho-1

# Installer les dépendances
npm install
```

## 🏃‍♂️ Démarrage Rapide

Lancez le serveur de développement :

```bash
npm run dev
```

Ouvrez votre navigateur sur `http://localhost:5173`.

---

## 🛠️ Créer votre Premier Agent

Dans Kensho, un agent est un morceau de code autonome qui peut communiquer avec d'autres agents.

### 1. Définir l'Agent

Créez un fichier `src/agents/MyFirstAgent.ts` :

```typescript
import { runAgent } from '../core/agent-system/defineAgent';

runAgent({
  name: 'MyFirstAgent',
  
  init: async (runtime) => {
    console.log('🤖 MyFirstAgent is alive!');

    // Enregistrer une méthode que d'autres peuvent appeler
    runtime.registerHandler('hello', async (payload: { name: string }) => {
      return `Hello ${payload.name}, I am MyFirstAgent!`;
    });
  }
});
```

### 2. Utiliser l'Agent

Dans votre application principale (ex: `src/main.tsx` ou un composant) :

```typescript
import { MessageBus } from './core/communication/MessageBus';

// Créer un bus pour communiquer
const bus = new MessageBus('MainApp');

async function sayHello() {
  try {
    // Appeler l'agent
    const response = await bus.request<string>(
      'MyFirstAgent', // Cible
      { name: 'User' }, // Payload
      5000 // Timeout (ms)
    );
    
    console.log('Response:', response);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

---

## 📡 Communication Avancée

### Streaming

Pour envoyer des données en continu (ex: génération de texte IA) :

```typescript
// Côté Agent
runtime.registerHandler('stream-data', async (payload, sender, streamId) => {
  if (!streamId) return; // Doit être une requête de stream

  for (let i = 0; i < 5; i++) {
    await runtime.sendStreamChunk(streamId, { progress: i * 20 });
    await new Promise(r => setTimeout(r, 500)); // Simuler travail
  }
  
  await runtime.sendStreamEnd(streamId, { done: true });
});

// Côté Client
bus.requestStream(
  'MyFirstAgent',
  { type: 'start' },
  {
    onChunk: (chunk) => console.log('Progress:', chunk),
    onEnd: (result) => console.log('Done:', result),
    onError: (err) => console.error('Stream error:', err)
  }
);
```

---

## 🌐 Mode Distribué (WebSocket)

Pour faire communiquer des agents sur différents appareils :

1. **Lancer le Relay Server** :
   ```bash
   npm run relay
   ```

2. **Configurer le Transport** :
   ```typescript
   import { WebSocketTransport } from './core/communication/transport/WebSocketTransport';
   
   const bus = new MessageBus('MyAgent', {
     transport: new WebSocketTransport('ws://localhost:8080')
   });
   ```

---

## 📚 En Savoir Plus

- [Architecture](./ARCHITECTURE.md) - Comprendre le fonctionnement interne
- [Sécurité](./SECURITY.md) - Sécuriser votre déploiement
- [Exemples](./EXAMPLES.ts) - Plus de code snippets

---

**Besoin d'aide ?** Ouvrez une issue sur GitHub !
