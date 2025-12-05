# Performance Panel UI - Dashboard de Surveillance du Runtime

## Objectif
Créer un HUD (Heads-Up Display) de performance dans l'interface utilisateur pour exposer les métriques du système d'allocation dynamique des ressources, donnant aux utilisateurs un contrôle explicite et une visibilité sur le fonctionnement du runtime.

## Architecture de Référence

```
┌─────────────────────────────────────────────────────────────┐
│                    PERFORMANCE PANEL                        │
├─────────────────────────────────────────────────────────────┤
│  Mode: PERFORMANCE     🔧 Complexité: HIGH (0.78)          │
│  ⚡ Vitesse: 42 tokens/s                                   │
│  🔋 Batterie: -1.9%/min (estimé)                          │
│                                                             │
│  [ ECO ][ BALANCED ][ PERFORMANCE ][ MAXIMUM ][ TURBO ]    │
│                                                             │
│  📈 Historique:                                             │
│  • Mode ajusté: PERF → BALANCED (RAM saturée)               │
│  • Dernière exécution: 2.3s, 87 tokens                     │
└─────────────────────────────────────────────────────────────┘
```

## Données à Exposer

### 1. État Courant du Runtime
| Métrique | Description | Source |
|----------|-------------|--------|
| Mode de Performance | ECO / BALANCED / PERFORMANCE / MAXIMUM | PerformanceTracker |
| Complexité Estimée | LOW / MEDIUM / HIGH + score (0-1) | Router.assessComplexity() |
| Vitesse Effective | tokens/s moyenne sur N derniers tokens | RuntimeManager |
| Impact Batterie | %/min estimé ou "faible/moyen/élevé" | Device API |

### 2. Calcul des Métriques
```typescript
// Calcul de la vitesse en tokens par seconde
const tokensPerSecond = tokensGenerated / (durationMs / 1000);

// Estimation de l'impact sur la batterie
const batteryDelta = batteryBefore - batteryAfter;
const batteryPerMinute = batteryDelta * (60000 / executionDurationMs);
```

## API du PerformancePanel

### Interface de Données
```typescript
interface PerformanceMetrics {
  // Mode courant
  currentMode: PerformanceMode;
  
  // Complexité
  complexity: {
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    score: number; // 0.0 - 1.0
    factors: Record<string, number>; // Détail des facteurs
  };
  
  // Performance
  tokensPerSecond: number;
  executionDurationMs: number;
  tokensGenerated: number;
  
  // Ressources
  batteryImpact: {
    percentagePerMinute: number;
    level: 'low' | 'medium' | 'high';
  };
  
  // Historique
  recentChanges: Array<{
    timestamp: number;
    fromMode: PerformanceMode;
    toMode: PerformanceMode;
    reason: string;
  }>;
  
  // Device status
  deviceStatus: {
    batteryLevel: number; // 0.0 - 1.0
    isCharging: boolean;
    memoryUsage: number; // 0.0 - 1.0
  };
}

interface PerformancePanelAPI {
  // Récupère les métriques actuelles
  getCurrentMetrics(): Promise<PerformanceMetrics>;
  
  // Force un mode spécifique
  setPerformanceMode(mode: PerformanceMode): Promise<void>;
  
  // Active le mode turbo temporairement
  enableTurboMode(durationMs: number): Promise<void>;
  
  // Écoute les changements de métriques
  onMetricsUpdate(callback: (metrics: PerformanceMetrics) => void): void;
  
  // Écoute les changements de mode
  onModeChange(callback: (change: {
    from: PerformanceMode;
    to: PerformanceMode;
    reason: string;
  }) => void): void;
}
```

## Fréquence de Rafraîchissement

| Métrique | Fréquence | Justification |
|----------|-----------|---------------|
| Mode courant | Immédiate | Changement critique |
| Complexité | Par requête | Calcul onéreux |
| Vitesse | 500ms | Balance précision/performance |
| Batterie | 1000ms | API système limitée |
| Historique | 5000ms | Données agrégées |

## Événements à Logger

### Changements de Mode
```typescript
// Exemple de log lors d'un changement de mode
{
  timestamp: 1700000000000,
  event: 'mode_change',
  from: 'PERFORMANCE',
  to: 'BALANCED',
  reason: 'Mémoire saturée (85%)',
  metrics: {
    memoryUsage: 0.85,
    batteryLevel: 0.42
  }
}
```

### Activation Turbo
```typescript
// Exemple de log lors de l'activation du mode turbo
{
  timestamp: 1700000000000,
  event: 'turbo_activated',
  durationMs: 30000,
  reason: 'User request',
  warning: 'Consommation énergétique élevée'
}
```

## Intégration avec les Composants Existants

### 1. PerformanceTracker
```typescript
// Exposition des données historiques
class PerformanceTracker {
  public getRecentMetrics(): PerformanceMetrics {
    // Retourne les métriques formatées pour l'UI
  }
  
  public getModeChangeHistory(limit: number = 10): Array<{
    timestamp: number;
    from: PerformanceMode;
    to: PerformanceMode;
    reason: string;
  }> {
    // Historique des changements de mode
  }
}
```

### 2. Router
```typescript
// Exposition de l'évaluation de complexité
class Router {
  public getLastComplexityAssessment(): {
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    score: number;
    factors: Record<string, number>;
  } {
    // Dernière évaluation de complexité
  }
}
```

### 3. RuntimeManager
```typescript
// Exposition des métriques de performance
class RuntimeManager {
  public getPerformanceMetrics(): {
    tokensPerSecond: number;
    currentSpeedMultiplier: number;
    vramUsage: number;
  } {
    // Métriques de performance en temps réel
  }
}
```

## Design UI/UX

### Palette de Couleurs
- **ECO**: 🟢 Vert clair
- **BALANCED**: 🔵 Bleu
- **PERFORMANCE**: 🟡 Jaune
- **MAXIMUM**: 🔴 Rouge
- **TURBO**: 🟣 Violet (clignotant)

### Animations
- Clignotement doux lors des changements de mode
- Barres de progression pour l'utilisation des ressources
- Indicateurs visuels pour l'impact batterie

### Responsive Design
- Version compacte pour mobile
- Version détaillée pour desktop
- Accessibilité (contraste, taille de texte)

## Cas d'Utilisation

### 1. Power Users
- Contrôle explicite des modes de performance
- Monitoring détaillé des ressources
- Activation manuelle du mode turbo

### 2. Développement
- Debugging des performances
- Tuning des algorithmes
- Validation des changements de mode

### 3. Utilisateurs Normaux
- Indication visuelle de l'état du système
- Compréhension des variations de performance
- Confiance dans le système adaptatif

## Sécurité et Privacy

### Données Collectées
- Aucune donnée personnelle
- Métriques système uniquement
- Historique local seulement

### Permissions
- Accès à l'état de la batterie (optionnel)
- Accès aux métriques de performance
- Aucun réseau requis

## Roadmap

### Phase 1: MVP (Version Minimum)
- Affichage des métriques de base
- Contrôle des modes de performance
- Historique des changements

### Phase 2: Enrichissement
- Graphiques d'historique
- Comparaison des performances
- Export des données

### Phase 3: Intelligence
- Recommandations automatiques
- Profils utilisateur
- Apprentissage des habitudes

## Conclusion

Le Performance Panel UI transforme notre moteur en véritable "LLM performance dashboard" utilisable pour debug, tuning, et pour donner du contrôle explicite aux power users. Cette interface :

✅ **Renforce la transparence** du système adaptatif
✅ **Donne du contrôle** aux utilisateurs avancés
✅ **Facilite le debugging** et l'optimisation
✅ **S'aligne avec les standards** des systèmes DVFS modernes
✅ **Améliore l'expérience utilisateur** avec des feedbacks visuels pertinents