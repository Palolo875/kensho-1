# ✅ Sprint 1B - LeaderElection - Validation Complète

## 📋 Objectif du Sprint

Valider l'algorithme d'élection de leader (**Lazy Bully**) implémenté dans `LeaderElection.ts`.
Le système doit garantir :
1. **Unicité** : Un seul leader à la fois.
2. **Stabilité** : Le nœud avec l'ID le plus élevé gagne toujours.
3. **Résilience** : En cas de panne du leader, une réélection est déclenchée automatiquement.

---

## 🏗️ Architecture de l'Élection

### Composants Clés

```typescript
// LeaderElection.ts
class LeaderElection {
    startElection()           // Déclenche le vote
    handleElectionMessage()   // Répond aux défis (ALIVE)
    becomeLeader()            // S'autoproclame leader
}

// OrionGuardian.ts
class OrionGuardian {
    handleSystemMessage()     // Route les messages ELECTION/ALIVE/NEW_LEADER
    start()                   // Lance l'élection au démarrage
}
```

### Algorithme (Lazy Bully)

1. **Démarrage** : Un agent envoie `ELECTION` aux agents d'ID supérieur.
2. **Réponse** : Si un agent supérieur reçoit `ELECTION`, il répond `ALIVE` et prend le relais.
3. **Victoire** : Si personne ne répond `ALIVE` après un timeout (1s), l'agent devient LEADER.
4. **Annonce** : Le nouveau leader diffuse `NEW_LEADER`.

---

## 🧪 Test d'Intégration

### Fichier: `tests/browser/sprint1b-election-e2e.html`

### Scénario de Test

#### **Phase 1 : Élection Initiale**

**Actions :**
1. Démarrer 3 agents : `AgentA`, `AgentB`, `AgentC`.
2. Attendre 4 secondes (propagation + timeouts).

**Résultat Attendu :**
- `AgentC` (ID le plus élevé) doit être élu LEADER.
- `AgentA` et `AgentB` doivent reconnaître `AgentC` comme leader.

**Vérification Log :**
```
AgentA voit le leader: AgentC
AgentB voit le leader: AgentC
AgentC voit le leader: AgentC
```

---

#### **Phase 2 : Panne et Réélection**

**Actions :**
1. Tuer `AgentC` (`worker.terminate()`).
2. Attendre 10 secondes (Détection panne + Nouvelle élection).

**Résultat Attendu :**
- `AgentB` (nouveau plus haut ID) doit devenir LEADER.
- `AgentA` doit reconnaître `AgentB`.

**Vérification Log :**
```
AgentA voit le leader: AgentB
AgentB voit le leader: AgentB
```

---

## 🚀 Procédure de Validation

### 1. Prérequis

```bash
# Assurez-vous que les agents de test sont buildés
npm run build:test-agents
```

### 2. Lancer le Serveur

```bash
npm run dev
```

### 3. Exécuter le Test

1. Ouvrir : `http://localhost:5173/tests/browser/sprint1b-election-e2e.html`
2. Cliquer sur **"Lancer les Tests"**

---

## 📊 Résultats Attendus

```
[INFO] --- Démarrage du test Élection de Leader ---
[INFO] [Étape 1] Démarrage de 3 agents...
[PASS] ✓ Tous les agents ont démarré.
[INFO] Attente de 4 secondes pour l'élection...
[INFO] AgentA voit le leader: AgentC
[INFO] AgentB voit le leader: AgentC
[INFO] AgentC voit le leader: AgentC
[PASS] ✓ Élection initiale réussie : AgentC est le leader unique.

[INFO] [Étape 2] Arrêt du leader (AgentC)...
[PASS] ✓ AgentC terminé.
[INFO] Attente de 10 secondes...
[INFO] AgentA voit le leader: AgentB
[INFO] AgentB voit le leader: AgentB
[PASS] ✓ Réélection réussie : AgentB est le nouveau leader.

[SUMMARY] --- Test Terminé ---
[PASS] 🎉 Tâche "LeaderElection" validée avec succès !
```

---

## 🐛 Troubleshooting

### Problème : "Leaders incohérents"
Si `AgentA` voit `AgentB` mais `AgentB` se voit lui-même comme suiveur (ou inversement).
- **Cause** : Timeout trop court ou messages perdus.
- **Solution** : Augmenter `ELECTION_TIMEOUT` dans `LeaderElection.ts`.

### Problème : "Aucun leader élu"
- **Cause** : Tous les agents attendent indéfiniment.
- **Solution** : Vérifier que `OrionGuardian.start()` appelle bien `startElection()`.

---

## 🏆 Conclusion

Si le test passe, cela confirme que :
1. Le mécanisme de messagerie système fonctionne.
2. L'algorithme Bully est correctement implémenté.
3. Le système est résilient à la perte du nœud maître.

**Statut : PRÊT À ÊTRE VALIDÉ**
