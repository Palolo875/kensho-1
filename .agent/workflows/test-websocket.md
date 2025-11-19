---
description: Test complet du système WebSocket multi-transport
---

# Workflow de Test WebSocket

Ce workflow permet de tester rapidement le système de transport WebSocket de Kensho.

## Étapes

### 1. Vérifier que les dépendances sont installées

```bash
npm install
```

// turbo
### 2. Builder les agents distants

```bash
npm run build:remote-agents
```

// turbo
### 3. Démarrer le serveur relais WebSocket (dans un terminal séparé)

```bash
npm run relay
```

**Note:** Gardez ce terminal ouvert. Le serveur doit rester actif.

### 4. Lancer la démo de test

```bash
npm run test:websocket
```

### 5. Tester la communication

Une fois la page ouverte :

1. Cliquez sur "🚀 Lancer le Test"
2. Ouvrez la même URL dans un **autre navigateur** (Chrome, Firefox, Edge, etc.)
3. Cliquez également sur "🚀 Lancer le Test" dans le second navigateur
4. Utilisez "📨 Envoyer un Message" pour tester la communication

### 6. Visualisation avancée (Optionnel)

Pour une visualisation graphique :

```bash
# Ouvrir dans le navigateur
http://localhost:5173/tests/browser/network-visualizer.html
```

## Vérifications

✅ Le serveur relais affiche "New client connected" pour chaque navigateur  
✅ Les agents se voient mutuellement  
✅ Les messages sont transmis entre navigateurs  
✅ La reconnexion fonctionne si on ferme/rouvre un navigateur  

## Troubleshooting

### Erreur "WebSocket connection failed"
→ Vérifiez que `npm run relay` est bien en cours d'exécution

### Erreur "404 Not Found" pour l'agent
→ Exécutez `npm run build:remote-agents`

### Les agents ne se voient pas
→ Vérifiez que tous les navigateurs sont connectés au même serveur (localhost:8080)

## Commandes Utiles

```bash
# Arrêter un serveur relais bloqué
lsof -ti:8080 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :8080   # Windows

# Rebuild rapide
npm run build:remote-agents

# Logs du serveur
npm run relay
```
