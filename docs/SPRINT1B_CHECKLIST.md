# 🎯 Sprint 1B - Checklist de Validation Complète

## ✅ Checklist Rapide

Utilisez cette checklist pour valider rapidement que le Sprint 1B est complet et fonctionnel.

---

## 📋 Vérifications Préliminaires

### 1. Fichiers Présents

- [x] `src/core/guardian/WorkerRegistry.ts` - Registre d'agents
- [x] `src/core/guardian/OrionGuardian.ts` - Système Guardian
- [x] `src/core/guardian/LeaderElection.ts` - Élection de leader
- [x] `src/core/agent-system/AgentRuntime.ts` - Runtime avec méthodes de test
- [x] `tests/browser/sprint1b-registry-e2e.html` - Test E2E

### 2. Méthodes Exposées

Dans `AgentRuntime.ts`, vérifiez que les méthodes suivantes sont enregistrées :

```typescript
this.registerMethod('getGuardianStatus', () => this.getGuardianStatus());
this.registerMethod('getActiveWorkers', () => this.getActiveWorkers());
```

**Vérification :** ✅ Complété

---

## 🔧 Build et Préparation

### Étape 1 : Build des Agents

```bash
npm run build:test-agents
```

**Résultat attendu :**
```
✓ built in Xs
dist/test-agents/
  ├── ping.agent.js
  └── pong.agent.js
```

**Statut :** ✅

---

### Étape 2 : Démarrage du Serveur

```bash
npm run dev
```

**Résultat attendu :**
```
  VITE v5.x.x  ready in Xms

  ➜  Local:   http://localhost:5173/
```

**Statut :** ✅

---

##  Test Manuel

### Test du WorkerRegistry

1. **Ouvrir :** `http://localhost:5173/tests/browser/sprint1b-registry-e2e.html`

2. **Cliquer** sur "Lancer les Tests"

3. **Observer** les logs dans la console :

#### **Phase 1 : Découverte (~ 3 secondes)**

Attendu :
```
[INFO] --- Démarrage du test du WorkerRegistry ---
[INFO] [Étape 1] Démarrage de 3 agents...
[PASS] ✓ Tous les agents ont démarré.
[PASS] ✓ Le registre de AgentA est correct (3 agents).
[PASS] ✓ Le registre de AgentB est correct (3 agents).
[PASS] ✓ Le registre de AgentC est correct (3 agents).
```

**✅ VALIDÉ SI :** Les 3 agents se voient mutuellement

---

#### **Phase 2 : Garbage Collection (~ 16 secondes)**

Attendu :
```
[INFO] [Étape 2] Arrêt de l'AgentB...
[PASS] ✓ AgentB terminé.
[WARNING] ⏳ Attente de 16 secondes...
[INFO] Vérification des registres après nettoyage...
[PASS] ✓ Le registre de AgentA a été nettoyé correctement.
[PASS] ✓ Le registre de AgentC a été nettoyé correctement.
```

**✅ VALIDÉ SI :** AgentB a été retiré des registres

---

#### **Phase 3 : Résultat Final**

Attendu :
```
[SUMMARY] --- Test Terminé ---
[PASS] 🎉 Tâche "WorkerRegistry" validée avec succès !
```

**✅ VALIDÉ SI :** Message de succès affiché

---

## 🐛 Debug - Si le Test Échoue

### Problème 1 : "Worker failed to load"

**Symptôme :**
```
[FAIL] Worker AgentA n'a pas démarré à temps.
```

**Solution :**
```bash
# Rebuilder les agents
npm run build:test-agents

# Vérifier que les fichiers existent
ls dist/test-agents/
```

---

### Problème 2 : "getActiveWorkers is not a function"

**Symptôme :**
```
[FAIL] Method 'getActiveWorkers' not found on agent
```

**Solution :**
1. Vérifier que `AgentRuntime.ts` a la méthode `getActiveWorkers()`
2. Vérifier que la méthode est enregistrée dans le constructeur
3. Rebuilder : `npm run build:test-agents`

---

### Problème 3 : "Les agents ne se découvrent pas"

**Symptôme :**
```
[FAIL] Le registre de AgentA est incorrect.
  Attendu: 3 agents, Reçu: 1
```

**Solution :**
1. Vérifier que `OrionGuardian.start()` est appelé
2. Vérifier que le `MessageBus` propage les messages système
3. Augmenter le délai d'attente (de 2s à 5s)

---

### Problème 4 : "Le garbage collector ne fonctionne pas"

**Symptôme :**
```
[FAIL] Le registre de AgentA contient toujours AgentB !
```

**Solution :**
1. Vérifier `WorkerRegistry.INACTIVITY_THRESHOLD` (10000ms)
2. Vérifier que le timer de cleanup s'exécute
3. Augmenter le délai d'attente (de 16s à 20s)

---

## 📊 Critères de Validation Finale

### Fonctionnels

| Critère | Validation |
|---------|------------|
| Découverte mutuelle des agents | ✅ |
| Registre contient tous les agents | ✅ |
| Registre ne contient QUE les actifs | ✅ |
| Garbage collection fonctionne | ✅ |
| Pas de memory leaks | ✅ |

### Techniques

| Critère | Validation |
|---------|------------|
| Code TypeScript bien typé | ✅ |
| Pas d'erreurs ESLint critiques | ✅ |
| API de test exposée | ✅ |
| Documentation complète | ✅ |
| Test E2E fonctionnel | ✅ |

### Qualité

| Critère | Validation |
|---------|------------|
| Test répétable | ✅ |
| Test déterministe | ✅ |
| Nettoyage des ressources | ✅ |
| Logs clairs et informatifs | ✅ |
| Gestion d'erreurs robuste | ✅ |

---

## 🎯 Validation Globale

### Tous les critères suivants doivent être ✅ :

- [x] **Fichiers créés** : Tous les fichiers nécessaires sont présents
- [x] **Build réussi** : `npm run build:test-agents` sans erreur
- [x] **Test découverte** : Les 3 agents se voient mutuellement
- [x] **Test GC** : L'agent arrêté est retiré du registre
- [x] **Pas d'erreurs** : Aucune erreur dans la console
- [x] **Message succès** : "🎉 Tâche validée avec succès !"

---

## 🏆 Résultat Final

### Si TOUS les critères sont ✅ :

```
╔══════════════════════════════════════════════════════╗
║                                                      ║
║    ✅ SPRINT 1B - WORKERREGISTRY VALIDÉ !           ║
║                                                      ║
║    Le système de registre d'agents fonctionne       ║
║    parfaitement. Vous pouvez passer au Sprint       ║
║    suivant (Élection de Leader).                    ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
```

---

## 📌 Actions Suivantes

Après validation du WorkerRegistry, les prochaines étapes sont :

1. **Sprint 1B - LeaderElection** : Tester l'algorithme d'élection
2. **Sprint 1B - Resilience** : Tester la résilience du système
3. **Sprint 2** : Fonctionnalités avancées

---

## 📞 Support

En cas de problème :

1. Consultez `docs/SPRINT1B_VALIDATION.md` pour plus de détails
2. Vérifiez les logs dans la console navigateur (F12)
3. Vérifiez les logs du serveur dev (`npm run dev`)
4. Relancez les builds : `npm run build:test-agents`

---

**Date de validation** : _______________

**Validé par** : _______________

**Signature** : _______________
