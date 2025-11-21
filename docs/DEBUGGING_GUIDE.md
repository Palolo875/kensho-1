# Guide de Débogage Kensho

## Problèmes de Communication et Stockage Persistant

### Symptômes Courants

1. **La barre de saisie bloque sur "Kensho écrit..."**
   - Le message est envoyé mais aucune réponse n'arrive
   - L'interface ne répond plus

2. **Le modèle se télécharge à chaque fois**
   - Le cache n'est pas persistant
   - Le navigateur vide le stockage IndexedDB

3. **Messages d'erreur "Worker not ready"**
   - Les workers ne sont pas initialisés correctement
   - Le MessageBus n'est pas connecté

### Solution Implémentée

#### 1. Vérification de l'État des Workers

Un indicateur de statut est maintenant affiché en bas à gauche de l'écran (en mode développement) :

```typescript
// Visible uniquement en dev
{import.meta.env.DEV && <WorkerStatusIndicator />}
```

Cet indicateur montre :
- ✅ LLM Worker : État du worker de génération de texte
- ✅ OIE Worker : État du worker d'orchestration
- ✅ Telemetry : État du worker de logging

#### 2. Logs Détaillés

Tous les composants logguent maintenant leurs actions avec des emojis pour faciliter le débogage :

**Dans la console :**
```
[KenshoStore] 📤 Envoi du message vers OIEAgent: hey
[OIEAgent] 📨 Requête reçue: { query: "hey" }
[OIEAgent] 🎯 Query valide: hey
[OIEAgent] 📋 Plan généré: { agent: "MainLLMAgent", ... }
[OIEAgent] 🔄 Appel de MainLLMAgent...
[MainLLMAgent] 📨 Requête de génération reçue
[MainLLMAgent] ✅ Moteur disponible
[MainLLMAgent] 🔄 Début de la génération...
[MainLLMAgent] 📦 Premier chunk reçu
[OIEAgent] 📦 Chunk reçu de MainLLMAgent → relay
[KenshoStore] 📥 Chunk reçu: Bonjour ! Je suis Kensho...
```

#### 3. Attente de l'Initialisation des Workers

Le store attend maintenant que les workers envoient un message `{ type: 'READY' }` avant d'autoriser l'envoi de messages :

```typescript
// Dans useKenshoStore.ts
if (!workersReady.oie) {
    console.warn('[KenshoStore] ⚠️ OIE Worker n\'est pas encore prêt');
    return;
}

if (!workersReady.llm) {
    console.warn('[KenshoStore] ⚠️ LLM Worker n\'est pas encore prêt');
    return;
}
```

#### 4. Amélioration du Stockage Persistant

Le `ModelLoader` vérifie maintenant :
1. **Le cache dans plusieurs bases de données IndexedDB** :
   - `webllm`, `webllm/model`, `webllm/cache`
   - `tvmjs`, `tvmjs/model`

2. **La demande de stockage persistant** avec logs détaillés :
```
[ModelLoader] 🔄 Demande de stockage persistant...
[ModelLoader] ✅ Stockage persistant accordé
```

3. **Le quota de stockage disponible** :
```
[ModelLoader] 💾 Stockage: 150MB / 50000MB utilisés
```

### Comment Déboguer

#### 1. Vérifier l'État du Système

Regardez l'indicateur en bas à gauche :
- Tous les badges devraient être verts (✅)
- Si un badge est rouge (❌), vérifiez les logs de la console

#### 2. Vérifier les Logs de la Console

Ouvrez la console du navigateur (`F12` ou `Cmd+Option+I`) et cherchez :
- `[KenshoStore]` : Logs du store principal
- `[OIEAgent]` : Logs de l'orchestrateur
- `[MainLLMAgent]` : Logs du générateur de texte
- `[ModelLoader]` : Logs du chargement du modèle

#### 3. Vérifier le Stockage Persistant

Dans la console du navigateur :
```javascript
// Vérifier si le stockage persistant est activé
navigator.storage.persisted().then(console.log);

// Vérifier le quota
navigator.storage.estimate().then(console.log);
```

#### 4. Vérifier le Cache IndexedDB

Dans les DevTools :
1. Allez dans l'onglet "Application" (Chrome) ou "Storage" (Firefox)
2. Regardez "IndexedDB"
3. Cherchez les bases de données `webllm` ou `tvmjs`
4. Vérifiez si des fichiers sont stockés

### Erreurs Connues et Solutions

#### "Le moteur LLM n'est pas encore prêt"

**Cause** : Le modèle n'a pas fini de se charger
**Solution** : Attendez que la barre de progression atteigne 100% et que le message "Modèle prêt" s'affiche

#### "OIE Worker n'est pas encore prêt"

**Cause** : Le worker d'orchestration n'a pas fini de s'initialiser
**Solution** : Rechargez la page. Si le problème persiste, vérifiez les logs de la console pour des erreurs de worker

#### "Stockage persistant refusé"

**Cause** : Le navigateur refuse d'accorder le stockage persistant (souvent en navigation privée)
**Solution** : 
- Utilisez un onglet normal (pas de navigation privée)
- Sur Safari, autorisez le stockage dans les préférences
- Le modèle devra être re-téléchargé à chaque session

#### Le cache ne fonctionne pas malgré le stockage persistant

**Cause** : web-llm peut changer son système de cache entre les versions
**Solution** :
- Vérifiez que vous utilisez la dernière version de `@mlc-ai/web-llm`
- Essayez de vider le cache IndexedDB et de retélécharger

### Mode Debug Avancé

Pour activer encore plus de logs, ajoutez dans la console :
```javascript
// Activer les logs verbeux du MessageBus
localStorage.setItem('DEBUG_MESSAGEBUS', 'true');

// Activer les logs du ModelLoader
localStorage.setItem('DEBUG_MODELLOADER', 'true');
```

### Performances

Pour éviter de retélécharger le modèle à chaque fois en développement :

1. **Utilisez toujours le même profil de navigateur**
2. **Ne videz pas le cache du navigateur** (ou excluez IndexedDB)
3. **Vérifiez que le stockage persistant est accordé** (voir ci-dessus)
4. **Utilisez Chrome ou Edge** (meilleur support de WebGPU et IndexedDB)

### Checklist de Validation

Avant de signaler un bug :

- [ ] L'indicateur de statut montre tous les workers en vert
- [ ] Le modèle indique "Phase: ready"
- [ ] Les logs de la console ne montrent pas d'erreurs
- [ ] Le stockage persistant est activé
- [ ] Le navigateur n'est pas en mode navigation privée
- [ ] WebGPU est disponible (vérifier dans chrome://gpu)
- [ ] Vous utilisez Chrome/Edge 113+ ou Firefox 121+
