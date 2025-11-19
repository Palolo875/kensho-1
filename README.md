# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/74a7a0c8-6d5c-4c99-ac3b-3ba7a53cdd75

## What is Kensho?

Kensho est bien plus qu'une simple application React : c'est un **système distribué complet** qui s'exécute directement dans le navigateur. Il implémente :

- 🧠 **Agents autonomes** (via Web Workers) avec communication RPC
- 📡 **MessageBus** multi-transport (BroadcastChannel, WebSocket, Hybride)
- 👑 **Élection de leader** avec détection de pannes
- 🔄 **Auto-réparation** et résilience du système
- 🌐 **Communication inter-appareils** via WebSocket

## 🚀 Nouveau : Support Multi-Transport

Kensho supporte désormais **3 modes de transport** :

### 1️⃣ BroadcastChannel (Local - Par défaut)
Communication ultra-rapide entre onglets/workers du même domaine
```typescript
runAgent({ name: 'MyAgent', init: (runtime) => { /* ... */ } });
```

### 2️⃣ WebSocket (Distant)
Communication entre différents navigateurs/appareils
```typescript
runAgent({ 
    name: 'MyAgent', 
    config: { useWebSocket: true },
    init: (runtime) => { /* ... */ }
});
```

### 3️⃣ Hybride (Recommandé)
Combine local + distant avec déduplication automatique
```typescript
runAgent({ 
    name: 'MyAgent', 
    config: { useHybrid: true },
    init: (runtime) => { /* ... */ }
});
```

### 🔥 Démo Rapide

**Terminal 1 :**
```bash
npm run relay
```

**Terminal 2 :**
```bash
npm run test:websocket
```

Ouvrez ensuite l'URL dans **deux navigateurs différents** et regardez-les communiquer !

📖 **Guide complet** : [docs/QUICKSTART_WEBSOCKET.md](./docs/QUICKSTART_WEBSOCKET.md)

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/74a7a0c8-6d5c-4c99-ac3b-3ba7a53cdd75) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Sprint 1A – Tests E2E

Ce dépôt inclut une suite complète pour valider la pile agents/MessageBus directement dans le navigateur.

### 1. Builder les agents de test

```sh
npm run build:test-agents
```

Cela génère `dist/test-agents/ping.agent.js` et `pong.agent.js`, consommés par les tests HTML.

### 2. Lancer les vérifications rapides

- Compatibilité BroadcastChannel : ouvrir `tests/browser/compatibility/broadcast-channel.html` dans un navigateur supportant les Web Workers. La page doit afficher ✅.
- Sanity build Ping : lancer `npm run dev` puis visiter `tests/browser/build/test-ping-only.html`. L'absence d'erreurs 404/CORS confirme le chargement du worker.

### 3. Exécuter le test de bout en bout

Un script facilite l'orchestration complète :

```sh
npm run test:e2e
```

Ce script build les agents puis démarre Vite en ouvrant `tests/browser/sprint1a-e2e.html`. Cliquez sur « Lancer les Tests » pour exécuter :

1. Ping ↔ Pong (scénario fonctionnel de base)
2. Stress test avec 500 requêtes concurrentes et mesure de latence

Le test réussit lorsque les deux scénarios passent et que le résumé affiche 🎉.

## 📚 Documentation

- [🌐 Architecture du Transport](./docs/TRANSPORT.md)
- [⚡ Guide de démarrage WebSocket](./docs/QUICKSTART_WEBSOCKET.md)
- [💡 Exemples de code](./docs/EXAMPLES.ts)

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/74a7a0c8-6d5c-4c99-ac3b-3ba7a53cdd75) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
