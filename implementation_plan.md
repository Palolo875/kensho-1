# Plan d'implémentation : Sprint 1B - Élection de Leader

## Objectif
Valider et stabiliser l'algorithme d'élection de leader (Bully Algorithm) implémenté dans `LeaderElection.ts`.

## Analyse de l'existant
- `src/core/guardian/LeaderElection.ts` contient la logique.
- Dépend de `WorkerRegistry` (validé) et `MessageBus`.
- `OrionGuardian` orchestre le tout (Heartbeats, Failure Detection).

## Stratégie de Test (E2E)
Nous allons créer un test navigateur `tests/browser/sprint1b-election-e2e.html` qui :
1. Démarre 3 agents (A, B, C).
2. Vérifie qu'un leader est élu (C devrait gagner car "AgentC" > "AgentB" > "AgentA").
3. Tue le leader actuel (C).
4. Vérifie qu'un nouveau leader est élu parmi les survivants (B devrait gagner).
5. (Optionnel) Redémarre C et vérifie qu'il reprend le leadership.

## Tâches
1. **Analyse** : Vérifier `LeaderElection.ts` pour comprendre les critères d'élection. (Fait)
2. **Test E2E** : Implémenter le script de test.
3. **Debug** : Ajuster les timeouts et la logique si l'élection est instable.

## Fichiers à créer/modifier
- [NEW] `tests/browser/sprint1b-election-e2e.html`
- [NEW] `docs/SPRINT1B_ELECTION_VALIDATION.md`

## Critères de Validation
- Un seul leader à la fois.
- Élection rapide (< 2s).
- Récupération après panne (< 10s).
