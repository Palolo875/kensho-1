# Mode Simulation - "L'Usine Vide" ✅

## 🎯 Philosophie

L'approche **"L'Usine Vide"** consiste à construire l'orchestration d'abord, les vrais modèles ensuite. Au lieu de télécharger des modèles LLM volumineux (Gemma, Phi, etc.), nous utilisons des **mocks** (simulations) pour tester et développer l'architecture.

## ✅ Ce qui a été implémenté

### 1. **Mocks de Modèles** (`src/plugins/mocks/`)

Trois mocks ont été créés pour simuler les modèles :

- **`GemmaMock.ts`** : Simule le modèle Gemma 3 270M
  - Délai : 150ms
  - Retourne des réponses de dialogue simulées
  
- **`QwenCoderMock.ts`** : Simule le modèle Qwen Coder
  - Délai : 250ms  
  - Retourne du code JavaScript/TypeScript simulé
  
- **`IntentClassifierMock.ts`** : Simule la classification d'intention
  - Délai : 20ms
  - Détecte si l'utilisateur demande du code, des maths ou du dialogue

### 2. **DialoguePluginMock** (`src/plugins/dialogue/DialoguePluginMock.ts`)

Plugin simplifié qui :
- N'utilise pas de ModelManager
- N'utilise pas de TaskExecutor complexe
- Appelle directement les mocks
- Fait un streaming token par token pour simuler le comportement réel
- Retourne des métriques (TTFT, tokens/sec, temps total)

### 3. **initializeKensho Modifié** (`src/kensho.ts`)

La fonction d'initialisation a été simplifiée :
- ❌ **Pas de téléchargement de modèles**
- ❌ **Pas d'initialisation du ModelManager**
- ✅ **Initialisation instantanée**
- ✅ **Retourne l'API avec le DialoguePluginMock**

### 4. **Interface Mise à Jour**

- **`KenshoChat.tsx`** : Adapté pour mode simulation
- **`GemmaChat.tsx`** : Titre changé en "Kensho Chat (Mode Simulation)"

## 🚀 Comment Utiliser

### Via l'Interface Web

1. Clique sur **"💬 Gemma Chat"** dans la barre latérale
2. L'initialisation est **instantanée** (pas de téléchargement)
3. Tu verras : "✅ Kensho est prêt en mode simulation !"
4. Envoie un message et reçois une réponse simulée

### Via Code

```typescript
import { initializeKensho } from '@/kensho';

// Initialisation instantanée (pas de téléchargement)
const kensho = await initializeKensho();

// Discuter avec le modèle simulé
for await (const event of kensho.dialogue.startConversation("Bonjour!")) {
  if (event.type === 'token') {
    console.log(event.data); // Streaming token par token
  }
  if (event.type === 'complete') {
    console.log('Réponse:', event.data.response);
    console.log('Métriques:', event.data.metrics);
  }
}
```

## 📊 Fonctionnalités

### ✅ Ce qui Fonctionne en Mode Simulation

- ✅ **Streaming** : Réponses token par token
- ✅ **Classification d'intention** : Détecte CODE, MATH, DIALOGUE
- ✅ **Métriques** : TTFT, tokens/sec, temps total
- ✅ **Interface complète** : Même UX qu'avec de vrais modèles
- ✅ **Tests rapides** : Pas d'attente de téléchargement

### ⏳ Ce qui Viendra Plus Tard

- ⏳ Vrais modèles LLM (Gemma, Phi, Qwen)
- ⏳ Cache de réponses
- ⏳ Gestion mémoire VRAM
- ⏳ Router v3.0 complet
- ⏳ TaskExecutor v3.0 complet
- ⏳ Fusion de résultats multi-modèles

## 🎨 Exemple de Réponses Simulées

### Question de Dialogue
**Input** : "Bonjour, comment ça va ?"  
**Output** : "Je comprends votre question. Laissez-moi vous aider avec ça. [Réponse simulée de Gemma 3 270M pour: 'Bonjour, comment ça va ?']"

### Question de Code
**Input** : "Écris une fonction TypeScript"  
**Output** : 
```typescript
// Code généré par Qwen-Coder (mock)
function solution() {
  console.log("Solution pour: Écris une fonction TypeScript...");
  // Implémentation simulée
  return true;
}
```

## 🔧 Architecture Technique

```
User Input
    ↓
initializeKensho() [Mode Simulation]
    ↓
DialoguePluginMock.startConversation()
    ↓
intentClassifierMock() → Détecte l'intention
    ↓
    ├─ DIALOGUE → gemmaMock()
    ├─ CODE     → qwenCoderMock()
    └─ MATH     → gemmaMock() (pour l'instant)
    ↓
Streaming token par token
    ↓
User reçoit la réponse
```

## 💡 Avantages de cette Approche

1. **Développement rapide** : Pas d'attente de téléchargement (Go)
2. **Tests instantanés** : Millisecondes au lieu de minutes
3. **Pas de dépendance GPU** : Fonctionne partout
4. **Orchestration d'abord** : Focus sur l'architecture, pas sur les modèles
5. **Transition facile** : Remplacer les mocks par de vrais modèles plus tard

## 🔄 Passage au Mode Production

Quand tu seras prêt à utiliser de vrais modèles :

1. Restaurer l'ancien `src/kensho.ts` avec ModelManager
2. Remplacer `DialoguePluginMock` par `DialoguePlugin`
3. Activer le téléchargement dans `initializeKensho()`
4. Les mocks restent disponibles pour les tests

## 📝 Fichiers Modifiés

- `src/plugins/mocks/GemmaMock.ts` ✨ Nouveau
- `src/plugins/mocks/QwenCoderMock.ts` ✨ Nouveau
- `src/plugins/mocks/IntentClassifierMock.ts` ✨ Nouveau
- `src/plugins/dialogue/DialoguePluginMock.ts` ✨ Nouveau
- `src/kensho.ts` 🔄 Simplifié (mode simulation)
- `src/components/KenshoChat.tsx` 🔄 Adapté (mode simulation)
- `src/pages/GemmaChat.tsx` 🔄 Titre mis à jour

## ✅ Status

**Mode Simulation : ACTIF**  
**Téléchargement de Modèles : DÉSACTIVÉ**  
**Orchestration : PRÊTE POUR LES TESTS**

L'usine est vide, mais l'orchestration fonctionne ! 🏭✨
