# Kensho Kernel v2.0 - Le Cœur Asynchrone

## Vue d'ensemble

Le Kernel v2.0 est le noyau asynchrone de Kensho, responsable de la gestion intelligente des modèles IA et des ressources système. Il assure que les modèles sont chargés de manière optimale en fonction des ressources disponibles (mémoire, batterie, réseau).

## Architecture

```
Application
    ↓
KernelCoordinator (Orchestration)
    ↓                    ↓
ModelManager     ResourceManager
(Que charger)    (Quand charger)
    ↓                    ↓
WebLLM Engine    Browser APIs
```

## Composants

### ModelManager v2.0
Gestionnaire asynchrone de modèles WebLLM.

**Fonctionnalités:**
- Initialisation explicite et asynchrone
- Promesse `ready` pour éviter les race conditions
- Changement de modèle à chaud via `switchModel()`
- Tracking de l'état du modèle actuel
- Récupération après échec d'initialisation
- Callbacks de progression pour l'UI

**API:**
```typescript
// Initialisation
await modelManager.init('gemma-3-270m', (progress) => {
  console.log(progress.text);
});

// Attendre que le manager soit prêt
await modelManager.ready;

// Obtenir le moteur
const engine = await modelManager.getEngine();

// Changer de modèle
await modelManager.switchModel('qwen2-e5-embed');

// Vérifier le modèle actuel
const current = modelManager.getCurrentModel();

// Libérer les ressources
await modelManager.dispose();
```

### ResourceManager v1.0
Système nerveux sensoriel surveillant les ressources système.

**Métriques surveillées:**
- **Mémoire**: Utilisation JS heap, tendances (rising/falling/stable)
- **Batterie**: Niveau, état de charge, temps avant décharge
- **Réseau**: État online/offline, type de connexion (4G/3G/2G/slow-2g), RTT
- **CPU**: Nombre de cœurs logiques
- **Mode éco**: Détection du mode économie d'énergie

**Événements réactifs:**
- `memory-critical`: Mémoire > 85%
- `battery-low`: Batterie < 15% et non en charge
- `network-offline`: Perte de connexion
- `cpu-throttle`: Détection de throttling CPU

**API:**
```typescript
// Obtenir le statut système
const status = await resourceManager.getStatus();
console.log(status.memory.usageRatio);
console.log(status.battery?.level);
console.log(status.network.effectiveType);

// Écouter les événements
resourceManager.on('memory-critical', (status) => {
  console.warn('Mémoire critique !', status.memory);
});

resourceManager.on('battery-low', (status) => {
  console.warn('Batterie faible !', status.battery);
});

// Retirer un listener
resourceManager.off('memory-critical', handler);

// Libérer les ressources
resourceManager.destroy();
```

### KernelCoordinator
Orchestrateur intelligent qui coordonne ModelManager et ResourceManager.

**Fonctionnalités:**
- Initialisation coordonnée du kernel
- Décisions de chargement basées sur les ressources
- Gestion des événements critiques
- API unifiée pour l'application

**API:**
```typescript
import { kernelCoordinator } from '@/core/kernel';

// Initialisation
await kernelCoordinator.init('gemma-3-270m', (progress) => {
  console.log(`Chargement: ${progress.text}`);
});

// Vérifier si un modèle peut être chargé
const decision = await kernelCoordinator.canLoadModel('heavy-model');
if (!decision.canLoad) {
  console.warn(`Impossible de charger: ${decision.reason}`);
  // Raisons possibles:
  // - "Mémoire saturée (>80%)"
  // - "Batterie critique (<15%)"
  // - "Réseau trop lent"
  // - "Mode économie d'énergie actif"
}

// Changer de modèle (avec vérification automatique)
try {
  await kernelCoordinator.switchModel('qwen2-e5-embed');
} catch (error) {
  console.error('Switch impossible:', error.message);
}

// Obtenir le statut système complet
const status = await kernelCoordinator.getSystemStatus();

// Obtenir le modèle actuel
const current = kernelCoordinator.getCurrentModel();

// Obtenir les modèles disponibles
const models = kernelCoordinator.getAvailableModels();

// Libérer les ressources
await kernelCoordinator.dispose();
```

### ModelCatalog
Catalogue centralisé des modèles disponibles.

**Modèles actuels:**
```typescript
{
  "gemma-3-270m": {
    model_id: "gemma-3-270m-it-MLC",
    size: "270M",
    description: "Noyau de dialogue ultra-compact et efficace.",
    quantization: "q4f16_1"
  },
  "qwen2-e5-embed": {
    model_id: "Qwen2-E5-Embedding-Model-ID-MLC",
    size: "150M",
    description: "Expert en encodage sémantique pour le RAG.",
    quantization: "f32"
  }
}
```

## Utilisation recommandée

### 1. Initialisation de l'application

```typescript
import { kernelCoordinator } from '@/core/kernel';

async function initApp() {
  try {
    await kernelCoordinator.init('gemma-3-270m', (progress) => {
      // Afficher la progression à l'utilisateur
      updateProgressBar(progress.progress);
      showStatus(progress.text);
    });
    
    console.log('✅ Kernel initialisé');
  } catch (error) {
    console.error('❌ Échec initialisation:', error);
    // Gérer l'erreur (afficher un message à l'utilisateur, etc.)
  }
}
```

### 2. Surveillance proactive des ressources

```typescript
import { resourceManager } from '@/core/kernel';

// Réagir aux événements critiques
resourceManager.on('memory-critical', async (status) => {
  console.warn('⚠️ Mémoire critique détectée');
  // Libérer des ressources, afficher un avertissement, etc.
});

resourceManager.on('battery-low', async (status) => {
  console.warn('🔋 Batterie faible');
  // Proposer de suspendre les tâches gourmandes
});
```

### 3. Changement de modèle intelligent

```typescript
async function loadSpecializedModel(modelKey: string) {
  // Vérifier d'abord si le changement est possible
  const decision = await kernelCoordinator.canLoadModel(modelKey);
  
  if (!decision.canLoad) {
    showWarning(`Impossible de charger ${modelKey}: ${decision.reason}`);
    return;
  }
  
  // Procéder au changement
  await kernelCoordinator.switchModel(modelKey, (progress) => {
    updateProgressBar(progress.progress);
  });
}
```

## Bonnes pratiques

### ✅ DO
- Toujours utiliser `kernelCoordinator` comme point d'entrée
- Attendre `kernelCoordinator.init()` avant toute opération
- Écouter les événements critiques de `resourceManager`
- Vérifier `canLoadModel()` avant un switch
- Gérer les erreurs d'initialisation

### ❌ DON'T
- Ne pas appeler directement `modelManager.init()` (utiliser `kernelCoordinator`)
- Ne pas ignorer les raisons de `canLoadModel()`
- Ne pas forcer un switch sans vérifier les ressources
- Ne pas oublier de `dispose()` lors du cleanup

## Gestion d'erreurs

Le kernel gère plusieurs types d'erreurs:

```typescript
try {
  await kernelCoordinator.init();
} catch (error) {
  if (error.message.includes('Mémoire insuffisante')) {
    // Pas assez de RAM pour démarrer
    showError('Votre appareil n\'a pas assez de mémoire disponible');
  } else if (error.message.includes('WebGPU')) {
    // WebGPU non disponible
    showError('Votre navigateur ne supporte pas WebGPU');
  } else {
    // Autre erreur
    showError('Erreur lors du chargement du modèle');
  }
}
```

## Performance

### Consommation Gemma-3-270M
- **Batterie**: 0.75% pour 25 conversations (Pixel 9 Pro)
- **Mémoire**: ~125 MB en INT4
- **Contexte**: 32K tokens

### Cache et optimisations
- Cache temporel de 500ms pour éviter les lectures excessives
- Détection automatique des modèles en cache
- Switch offline permis pour modèles déjà en cache

## Tests et validation

Le kernel a été validé pour:
- ✅ Initialisation concurrente sécurisée
- ✅ Récupération après échec
- ✅ Cleanup complet des ressources
- ✅ Switch offline pour modèles cachés
- ✅ Gestion des événements critiques

## Support navigateur

Requis:
- WebGPU (Chrome/Edge 113+)
- Performance API avec memory
- Battery API (optionnel)
- Network Information API (optionnel)

Fallbacks:
- Valeurs par défaut si les APIs ne sont pas disponibles
- Mode CPU si WebGPU indisponible (performance réduite)
