# Lazy Loading & Mode Lite

## Vue d'ensemble

Kensho supporte deux optimisations pour améliorer l'onboarding et l'expérience développeur :

1. **Lazy Loading** : Charge le modèle LLM à la demande au lieu du démarrage
2. **Mode Lite** : Désactive complètement l'IA pour tester le système rapidement

## Configuration

Créez un fichier `.env.local` à la racine du projet :

```bash
# Mode d'exécution
# - "full" : Mode complet avec IA (défaut)
# - "lite" : Mode léger sans IA
VITE_MODE=full

# Chargement automatique du modèle LLM
# - "true" : Charge le modèle au démarrage (défaut)
# - "false" : Lazy loading - charge à la demande
VITE_LLM_AUTOLOAD=true
```

## Mode Lazy Loading

### Activer le lazy loading

```bash
VITE_MODE=full
VITE_LLM_AUTOLOAD=false
```

### Comportement

- ✅ L'application démarre **immédiatement** sans télécharger le modèle
- ✅ Un bouton "Charger le modèle IA" apparaît dans l'interface
- ✅ Le modèle (~2 GB) se télécharge **uniquement quand l'utilisateur clique**
- ✅ Le modèle est **mis en cache** pour les prochaines utilisations

### Avantages

- **Onboarding ultra-rapide** : L'app démarre en <1 seconde
- **Économie de bande passante** : Télécharge uniquement si nécessaire
- **Meilleure UX** : L'utilisateur choisit quand télécharger

## Mode Lite

### Activer le mode lite

```bash
VITE_MODE=lite
```

### Comportement

- ✅ **Aucun téléchargement** de modèle LLM
- ✅ Le système démarre en **mode "ready"** immédiatement
- ✅ Les agents OIE et Telemetry fonctionnent normalement
- ✅ Idéal pour tester la communication inter-agents, les tests, et le débogage

### Cas d'usage

- 🧪 **Tests automatisés** : Pas besoin d'attendre le modèle
- 🐛 **Débogage système** : Tester MessageBus, Workers, Metrics sans IA
- ⚡ **Développement rapide** : Itération rapide sur l'UI et la logique
- 📊 **CI/CD** : Tests plus rapides en environnement d'intégration

## Détection du mode

Dans votre code, vous pouvez détecter le mode actif :

```typescript
import { appConfig } from '@/config/app.config';

if (appConfig.mode === 'lite') {
    console.log('Mode Lite activé - IA désactivée');
}

if (!appConfig.llm.autoload) {
    console.log('Lazy loading activé');
}
```

## Comparaison

| Fonctionnalité | Mode Full (Autoload) | Mode Full (Lazy) | Mode Lite |
|----------------|---------------------|------------------|-----------|
| Temps de démarrage | 5-30 min (1ère fois) | <1 sec | <1 sec |
| Téléchargement | Automatique | À la demande | Aucun |
| Taille téléchargée | ~2 GB | ~2 GB (si utilisé) | 0 GB |
| IA disponible | ✅ | ✅ (après chargement) | ❌ |
| Tests système | ✅ | ✅ | ✅ |
| Cas d'usage | Production | Dev/Test avec IA | Dev/Test sans IA |

## Recommandations

- **Production** : `VITE_MODE=full` + `VITE_LLM_AUTOLOAD=true`
- **Développement avec IA** : `VITE_MODE=full` + `VITE_LLM_AUTOLOAD=false`
- **Tests/CI** : `VITE_MODE=lite`
- **Démo rapide** : `VITE_MODE=full` + `VITE_LLM_AUTOLOAD=false`

## Cache du modèle

Le modèle LLM est stocké dans **IndexedDB** et persiste entre les sessions :

- ✅ Développement : Cache conservé
- ✅ Tests : Cache conservé
- ✅ Production : Cache conservé

Pour **vider le cache** :
1. Ouvrir DevTools (F12)
2. Application > Storage > IndexedDB
3. Supprimer la base de données du modèle
