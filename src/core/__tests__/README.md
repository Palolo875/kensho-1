# 🧪 Tests Unitaires Kensho

## Vue d'Ensemble

Ce projet utilise **Vitest** pour les tests unitaires automatisés. Les tests garantissent que la logique métier critique fonctionne correctement, indépendamment des tests E2E.

## Structure

```
src/
├── core/
│   ├── communication/
│   │   ├── __tests__/
│   │   │   ├── MessageBus.test.ts       # Tests du bus de messages
│   │   │   └── OfflineQueue.test.ts     # Tests de la file d'attente
│   │   ├── MessageBus.ts
│   │   └── OfflineQueue.ts
│   └── guardian/
│       ├── __tests__/
│       │   └── OrionGuardian.test.ts    # Tests du guardian
│       └── OrionGuardian.ts
```

## Lancer les Tests

### Tous les tests (mode watch)
```bash
npm test
```

### Exécuter une fois
```bash
npm run test:unit
```

### Mode watch (re-run automatique)
```bash
npm run test:watch
```

### Avec couverture de code
```bash
npm run test:coverage
```

## Couverture Actuelle

| Module | Couverture | Commentaire |
|--------|-----------|-------------|
| `OfflineQueue` | 100% | Toutes les méthodes testées |
| `MessageBus` | ~80% | Core functionality couverte |
| `OrionGuardian` | ~75% | Heartbeat et élection testés |

**Objectif** : Atteindre 80% de couverture sur le code `core/`.

## Stratégies de Test

### 1. Mocking des Dépendances
Les tests utilisent des **mocks** pour isoler la logique :
```typescript
class MockTransport implements NetworkTransport {
    // Implémentation simplifiée pour les tests
}
```

### 2. Simulation du Temps
Pour tester les timeouts et les heartbeats :
```typescript
vi.useFakeTimers();
vi.advanceTimersByTime(5000); // Avancer de 5 secondes
```

### 3. Tests Asynchrones
Utiliser `async/await` pour les Promises :
```typescript
it('should resolve promise', async () => {
    const result = await messageBus.request('Agent', payload);
    expect(result).toBeDefined();
});
```

## Bonnes Pratiques

✅ **DO**
- Tester les cas nominaux ET les cas d'erreur
- Utiliser `beforeEach` pour initialiser l'état
- Cleanup via `afterEach` (dispose, timers)
- Noms de tests descriptifs (`should X when Y`)

❌ **DON'T**
- Tester les détails d'implémentation (tester le comportement)
- Tests inter-dépendants (chaque test doit être isolé)
- Assertions multiples sans contexte

## Exemple de Test

```typescript
describe('MessageBus', () => {
    let messageBus: MessageBus;
    let mockTransport: MockTransport;

    beforeEach(() => {
        mockTransport = new MockTransport();
        messageBus = new MessageBus('TestAgent', { transport: mockTransport });
    });

    it('should send request message', async () => {
        const promise = messageBus.request('Target', { ping: true });
        
        await new Promise(resolve => setTimeout(resolve, 10));
        
        expect(mockTransport.sentMessages).toHaveLength(1);
        expect(mockTransport.sentMessages[0].type).toBe('request');
    });
});
```

## Prochaines Étapes

- [ ] Augmenter la couverture à 80%
- [ ] Ajouter tests pour `AgentRuntime`
- [ ] Tester les transports (WebSocket, Hybrid)
- [ ] Intégrer dans CI/CD (GitHub Actions)
