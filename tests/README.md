# 🧪 Tests Kensho

Ce dossier contient tous les tests et démonstrations pour le système Kensho.

## 📁 Structure

```
tests/
├── browser/                    # Tests dans le navigateur
│   ├── build/                 # Tests de build
│   ├── compatibility/         # Tests de compatibilité
│   ├── sprint1a-e2e.html     # Tests E2E Sprint 1A (BroadcastChannel)
│   ├── sprint1b-*.html       # Tests Sprint 1B (Guardian/Election)
│   ├── websocket-transport-demo.html   # 🆕 Démo WebSocket
│   └── network-visualizer.html         # 🆕 Visualiseur réseau
├── integration/               # Tests d'intégration
└── unit/                      # Tests unitaires
```

## 🚀 Tests Disponibles

### 1. Tests Sprint 1A (Communication de Base)

**Fichier :** `sprint1a-e2e.html`

**Lance :**
```bash
npm run test:e2e
```

**Teste :**
- ✅ Communication Ping ↔ Pong
- ✅ Gestion d'erreurs
- ✅ Stress test (500 requêtes)
- ✅ Mesure de latence

---

### 2. Tests Sprint 1B (Résilience)

**Fichiers :**
- `sprint1b-election-e2e.html` - Élection de leader
- `sprint1b-registry-e2e.html` - Registre d'agents
- `sprint1b-resilience-e2e.html` - Détection de pannes

**Teste :**
- ✅ Algorithme d'élection (Bully)
- ✅ Heartbeats
- ✅ Détection de défaillance
- ✅ Réparation automatique

---

### 3. 🆕 Démo WebSocket Transport

**Fichier :** `websocket-transport-demo.html`

**Lance :**
```bash
npm run test:websocket
```

**Teste :**
- ✅ Connexion WebSocket
- ✅ Communication inter-navigateurs
- ✅ Reconnexion automatique
- ✅ Transport hybride

**Instructions :**
1. Démarrer le serveur relais : `npm run relay`
2. Ouvrir dans 2 navigateurs différents
3. Cliquer "Lancer le Test" dans chaque
4. Observer la communication !

---

### 4. 🆕 Visualiseur Réseau Interactif

**Fichier :** `network-visualizer.html`

**Lance :**
```bash
npm run dev
# Puis ouvrir : http://localhost:5173/tests/browser/network-visualizer.html
```

**Fonctionnalités :**
- 🎨 Visualisation graphique des agents
- 📊 Statistiques temps-réel
- 🌊 Animation des messages (particules)
- 🔄 Support des 3 modes de transport
- 📝 Journal des communications

**Interface :**
- **Sidebar gauche** : Liste des agents + configuration
- **Centre** : Canvas avec visualisation réseau
- **Sidebar droite** : Statistiques + logs
- **Contrôles** : Boutons d'action

---

## 🔧 Prérequis

### Pour tous les tests
```bash
npm install
npm run build:test-agents
```

### Pour les tests WebSocket
```bash
npm run build:remote-agents
npm run relay  # Dans un terminal séparé
```

---

## 📊 Matrice de Tests

| Test | Type | Transport | Multi-Device | Complexité |
|------|------|-----------|--------------|------------|
| Sprint 1A | E2E | BroadcastChannel | ❌ | ⭐⭐ |
| Sprint 1B Election | E2E | BroadcastChannel | ❌ | ⭐⭐⭐ |
| Sprint 1B Registry | E2E | BroadcastChannel | ❌ | ⭐⭐⭐ |
| Sprint 1B Resilience | E2E | BroadcastChannel | ❌ | ⭐⭐⭐ |
| WebSocket Demo | Manuel | WebSocket/Hybrid | ✅ | ⭐⭐ |
| Network Visualizer | Interactif | Tous | ✅ | ⭐ |

---

## 🎯 Scénarios de Test Recommandés

### Scénario 1 : Validation basique locale
```bash
npm run test:e2e
```
✅ Vérifie que le système fonctionne localement

### Scénario 2 : Test multi-navigateurs
```bash
# Terminal 1
npm run relay

# Terminal 2
npm run test:websocket
```
✅ Ouvrir dans Chrome et Firefox

### Scénario 3 : Démo complète
```bash
# Terminal 1
npm run relay

# Terminal 2
npm run dev
```
✅ Ouvrir `network-visualizer.html` dans plusieurs onglets/navigateurs

### Scénario 4 : Stress test réseau
1. Ouvrir `network-visualizer.html`
2. Créer 10+ agents
3. Cliquer "Broadcast Message" en boucle
4. Observer les particules et les stats

---

## 🐛 Debugging

### Problèmes Courants

#### 1. "Worker failed to load"
```bash
# Solution
npm run build:test-agents
npm run build:remote-agents
```

#### 2. "WebSocket connection failed"
```bash
# Vérifier que le serveur relais est actif
npm run relay

# Si le port 8080 est occupé
lsof -ti:8080 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :8080  # Windows
```

#### 3. "BroadcastChannel is not defined"
→ Utiliser un navigateur moderne (Chrome, Firefox, Edge)

#### 4. Les agents ne se voient pas
→ Vérifier qu'ils utilisent le même serveur relais (même URL)

---

## 📈 Métriques de Performance

### Latence Attendue

| Transport | Latence Typique | Latence Max |
|-----------|----------------|-------------|
| BroadcastChannel | <1ms | 5ms |
| WebSocket (local) | 5-10ms | 50ms |
| WebSocket (réseau) | 20-100ms | 500ms |
| Hybrid | Variable | Variable |

### Throughput

| Transport | Messages/sec |
|-----------|--------------|
| BroadcastChannel | ~10,000 |
| WebSocket | ~1,000 |
| Hybrid | ~5,000 |

---

## 🎓 Pour Aller Plus Loin

### Créer Vos Propres Tests

1. Copier `websocket-transport-demo.html`
2. Modifier le contenu de la section `<script>`
3. Ajouter vos propres agents et méthodes
4. Tester !

### Exemple de Test Personnalisé

```html
<script type="module">
    const worker = new Worker('/dist/remote-agents/remote-ping.agent.js', {
        type: 'module',
        name: 'MonAgentPerso'
    });

    worker.onmessage = (e) => {
        if (e.data.type === 'READY') {
            console.log('Mon agent est prêt !');
            // Faire vos tests ici
        }
    };
</script>
```

---

## 📚 Documentation Associée

- [Guide WebSocket](../docs/QUICKSTART_WEBSOCKET.md)
- [Architecture Transport](../docs/TRANSPORT.md)
- [Exemples de Code](../docs/EXAMPLES.ts)

---

**Bon testing ! 🧪**
