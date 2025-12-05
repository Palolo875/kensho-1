# 🔧 Spécifications Techniques - Ensemble 8

## 🎯 Tâche #29 : Dynamic Resource Allocation

### Objectif
Rendre notre Router et notre RuntimeManager capables d'allouer dynamiquement les ressources. Le Router doit non seulement choisir le bon expert, mais aussi évaluer la complexité de la tâche et demander une "configuration de performance" (ex: "LOW_POWER" ou "HIGH_PERFORMANCE"). Le RuntimeManager doit interpréter cette demande et simuler une allocation de ressources différente (plus ou moins de VRAM, une vitesse de calcul différente).

### Philosophie "Usine Vide"
Nous implémentons la vraie logique de décision et d'allocation. Le Router va réellement analyser le prompt pour en déduire une complexité. Le RuntimeManager va réellement modifier le comportement de son MockEngine en fonction de la configuration demandée.

### Spécifications Techniques Détaillées

#### 1. Mise à jour du MockEngine pour accepter des configurations de performance granulaires

```typescript
// src/core/kernel/engine/MockEngine.ts (Mise à jour)

import { memoryManager } from '../MemoryManager';
import { performanceTracker, PerformanceMode } from '../PerformanceTracker';

export type { PerformanceMode };

interface PerformanceProfile {
  speedMultiplier: number;  // 1.0 = baseline
  vramPerToken: number;     // MB
  maxConcurrency: number;   // Nombre de workers parallèles
  speculationLength: number; // Pour speculative decoding
  enableCache: boolean;
}

const PERFORMANCE_PROFILES: Record<PerformanceMode, PerformanceProfile> = {
  'ECO': {
    speedMultiplier: 0.5,  // 2x plus lent
    vramPerToken: 0.5,     // 2x moins de mémoire
    maxConcurrency: 1,
    speculationLength: 2,
    enableCache: true      // Cache agressif pour économiser
  },
  'BALANCED': {
    speedMultiplier: 1.0,
    vramPerToken: 1.0,
    maxConcurrency: 2,
    speculationLength: 4,
    enableCache: true
  },
  'PERFORMANCE': {
    speedMultiplier: 1.5,  // 33% plus rapide
    vramPerToken: 2.0,     // Plus de contexte
    maxConcurrency: 4,
    speculationLength: 6,
    enableCache: false     // Pas de cache, génération fraîche
  },
  'MAXIMUM': {
    speedMultiplier: 2.0,  // 2x plus rapide
    vramPerToken: 4.0,     // Charge tout en VRAM
    maxConcurrency: 8,
    speculationLength: 8,
    enableCache: false
  }
};

class MockEngine {
  private currentMode: PerformanceMode = 'BALANCED';
  private modeChangeCallbacks: Array<(newMode: PerformanceMode) => void> = [];

  public async *generate(
    prompt: string, 
    expert: string,
    mode: PerformanceMode = 'BALANCED'
  ): AsyncGenerator<string> {
    // Track mode change if needed
    if (mode !== this.currentMode) {
      performanceTracker.trackModeChange(this.currentMode, mode, 'User request');
      this.currentMode = mode;
    }
    
    const profile = PERFORMANCE_PROFILES[mode];
    
    console.log(`[MockEngine] Début de la génération pour ${expert} avec pipelining (mode: ${mode})...`);
    
    // Découpe le prompt en tokens (simulation simplifiée)
    const tokens = `Réponse simulée (pipelined, via ${this.getHardware()}, mode: ${mode}) de l'expert ${expert} pour le prompt : "${prompt}"`.split(' ');
    let nextTokenData: any = null; // Buffer du prochain token
    let tokenCount = 0;

    for (let i = 0; i < tokens.length; i++) {
      // ✅ Vérifie les conditions toutes les 10 tokens
      if (tokenCount % 10 === 0) {
        const newMode = this.checkAndAdjustMode();
        if (newMode !== this.currentMode) {
          console.log(`[MockEngine] Mode ajusté: ${this.currentMode} → ${newMode}`);
          performanceTracker.trackModeChange(this.currentMode, newMode, 'Dynamic adjustment');
          this.currentMode = newMode;
          const newProfile = PERFORMANCE_PROFILES[newMode];
          
          // Notifie les listeners
          this.modeChangeCallbacks.forEach(cb => cb(newMode));
        }
      }

      const tokenId = `${expert}-${Date.now()}-${i}`;
      const currentProfile = PERFORMANCE_PROFILES[this.currentMode];
      const vramPerToken = currentProfile.vramPerToken;
      
      // Alloue de la mémoire pour les activations du prochain token
      const allocated = memoryManager.allocateFromPool('activations', vramPerToken, tokenId);
      if (!allocated) {
        console.error("[MockEngine] PIPELINE STALL: Plus de mémoire d'activation !");
        // Implémente du backpressure avec timeout
        const startTime = Date.now();
        while (!memoryManager.allocateFromPool('activations', vramPerToken, tokenId)) {
          console.warn("[MockEngine] Backpressure: attente de libération mémoire...");
          await new Promise(r => setTimeout(r, 10)); // Attente active courte
          // Timeout après 500ms
          if (Date.now() - startTime > 500) throw new Error("Memory deadlock");
        }
      }

      try {
        // Prépare le prochain token (CPU)
        const prepareNext = i < tokens.length - 1 
          ? this.prepareTokenData(tokens[i + 1], `${tokenId}-next`, currentProfile) 
          : Promise.resolve();

        // Calcule le token actuel (GPU) en parallèle
        const currentToken = nextTokenData || await this.prepareTokenData(tokens[i], tokenId, currentProfile);
        const result = await this.computeToken(currentToken, currentProfile);

        // Les deux s'exécutent en parallèle !
        nextTokenData = await prepareNext;

        // Applique la vitesse selon le profil
        const baseSpeed = 20; // ms par token en mode BALANCED
        const speed = baseSpeed / currentProfile.speedMultiplier;
        await new Promise(r => setTimeout(r, speed));

        yield result + ' ';
        tokenCount++;
      } finally {
        // Garantit la libération même en cas d'erreur
        memoryManager.freeToPool('activations', vramPerToken, tokenId);
      }
    }
    console.log(`[MockEngine] Fin de la génération pour ${expert}.`);
  }

  private async prepareTokenData(token: string, tokenId: string, profile: PerformanceProfile): Promise<any> {
    // Simule allocation pour la préparation
    memoryManager.allocateFromPool('uniforms', profile.vramPerToken * 0.5, tokenId);
    try {
      // Temps de préparation selon le profil
      const prepTime = 5 / profile.speedMultiplier;
      await new Promise(r => setTimeout(r, prepTime)); // Simule CPU
      return { token, prepared: true, tokenId };
    } finally {
      memoryManager.freeToPool('uniforms', profile.vramPerToken * 0.5, tokenId);
    }
  }

  private async computeToken(data: any, profile: PerformanceProfile): Promise<string> {
    // Simule allocation pour le calcul
    memoryManager.allocateFromPool('kv-cache', profile.vramPerToken * 0.75, data.tokenId);
    try {
      // Temps de calcul selon le profil
      const computeTime = 15 / profile.speedMultiplier;
      await new Promise(r => setTimeout(r, computeTime)); // Simule GPU
      return data.token;
    } finally {
      memoryManager.freeToPool('kv-cache', profile.vramPerToken * 0.75, data.tokenId);
    }
  }

  private checkAndAdjustMode(): PerformanceMode {
    // Simulation d'ajustement dynamique basé sur l'état du device
    // Dans une implémentation réelle, cela utiliserait resourceManager.getStatus()
    return this.currentMode; // Pour la simulation, on garde le mode initial
  }

  public onModeChange(callback: (newMode: PerformanceMode) => void): void {
    this.modeChangeCallbacks.push(callback);
  }
  
  private getHardware(): string {
    // Simule un environnement mixte CPU/GPU
    return Math.random() > 0.5 ? 'CPU' : 'GPU';
  }
}

export const mockEngine = new MockEngine();
```

#### 2. Mise à jour du Router pour une évaluation de complexité multi-factorielle

```typescript
// src/core/kernel/Router.ts (Mise à jour)

import { PerformanceMode } from './engine/MockEngine';
// ...

// Mettre à jour l'ExecutionPlan pour inclure le mode de performance
export type ExpertTask = {
  // ...
  performanceMode: PerformanceMode;
};

interface DeviceStatus {
  battery?: {
    level: number;
    isCharging: boolean;
  };
  memory?: {
    usageRatio: number;
  };
}

class Router {
  public async createPlan(prompt: string): Promise<ExecutionPlan> {
    // ...
    const complexityAnalysis = this.assessComplexity(prompt);
    const deviceStatus: DeviceStatus = this.getDeviceStatus(); // Simulation
    const performanceMode = this.selectPerformanceMode(complexityAnalysis.level, deviceStatus);

    logger.info('Router', `Complexité: ${complexityAnalysis.level} (score: ${complexityAnalysis.score.toFixed(2)})`, complexityAnalysis.factors);
    logger.info('Router', `Mode de performance: ${performanceMode}`);

    // ... (logique de sélection des experts)
    // Chaque tâche doit maintenant avoir un performanceMode
    const primaryTask: ExpertTask = {
      expert: 'dialogue-gemma3-270m-mock',
      prompt: prompt,
      priority: 'HIGH',
      performanceMode: performanceMode // Ajout du mode
    };
    // ...
  }

  /**
   * Évaluation de complexité multi-factorielle.
   */
  private assessComplexity(prompt: string): { 
    level: 'LOW' | 'MEDIUM' | 'HIGH',
    score: number,
    factors: Record<string, number>
  } {
    const factors = {
      length: this.scoreLength(prompt),
      taskType: this.scoreTaskType(prompt),
      specificity: this.scoreSpecificity(prompt),
      reasoning: this.scoreReasoningRequired(prompt),
      constraints: this.scoreConstraints(prompt)
    };

    // Pondération
    const weights = {
      length: 0.1,
      taskType: 0.3,
      specificity: 0.2,
      reasoning: 0.3,
      constraints: 0.1
    };

    const score = Object.entries(factors).reduce(
      (sum, [key, value]) => sum + value * weights[key as keyof typeof weights],
      0
    );

    let level: 'LOW' | 'MEDIUM' | 'HIGH';
    if (score > 0.7) level = 'HIGH';
    else if (score > 0.4) level = 'MEDIUM';
    else level = 'LOW';

    return { level, score, factors };
  }

  private scoreLength(prompt: string): number {
    // 0-1 basé sur la longueur
    const words = prompt.split(/\s+/).length;
    if (words < 20) return 0.2;
    if (words < 50) return 0.5;
    if (words < 100) return 0.7;
    return 1.0;
  }

  private scoreTaskType(prompt: string): number {
    const taskPatterns = {
      // Tâches complexes (1.0)
      'debug': 0.9,
      'optimize': 0.9,
      'refactor': 0.8,
      'solve': 0.8,
      'prove': 0.9,
      'analyze': 0.7,
      'compare': 0.6,
      
      // Tâches moyennes (0.5)
      'explain': 0.4,
      'summarize': 0.3,
      'translate': 0.3,
      
      // Tâches simples (0.2)
      'list': 0.2,
      'what is': 0.1,
      'define': 0.1
    };

    const lower = prompt.toLowerCase();
    for (const [pattern, score] of Object.entries(taskPatterns)) {
      if (lower.includes(pattern)) {
        return score;
      }
    }

    return 0.5; // Défaut
  }

  private scoreReasoningRequired(prompt: string): number {
    const reasoningIndicators = [
      'pourquoi', 'why', 'how does', 'comment fonctionne',
      'étape par étape', 'step by step', 'raisonne', 'think through',
      'algorithme', 'logique', 'preuve', 'démonstration'
    ];

    const lower = prompt.toLowerCase();
    const matches = reasoningIndicators.filter(indicator => 
      lower.includes(indicator)
    ).length;

    return Math.min(matches * 0.3, 1.0);
  }

  private scoreSpecificity(prompt: string): number {
    // Plus c'est spécifique, plus c'est complexe
    const hasNumbers = /\d+/.test(prompt);
    const hasCodeSnippet = /```/.test(prompt) || /function|class|const/.test(prompt);
    const hasTechnicalTerms = /[A-Z]{2,}/.test(prompt); // Acronymes (API, CPU, etc.)
    const hasConstraints = /doit|must|should|ne.*pas/.test(prompt.toLowerCase());

    let score = 0;
    if (hasNumbers) score += 0.2;
    if (hasCodeSnippet) score += 0.4;
    if (hasTechnicalTerms) score += 0.2;
    if (hasConstraints) score += 0.2;

    return Math.min(score, 1.0);
  }

  private scoreConstraints(prompt: string): number {
    const constraintKeywords = [
      'sans utiliser', 'without using', 'en moins de', 'in under',
      'optimisé', 'optimized', 'performant', 'efficient',
      'sécurisé', 'secure', 'robuste', 'production-ready'
    ];

    const lower = prompt.toLowerCase();
    const matches = constraintKeywords.filter(kw => lower.includes(kw)).length;

    return Math.min(matches * 0.3, 1.0);
  }

  private getDeviceStatus(): DeviceStatus {
    // Simulation de l'état du device
    return {
      battery: {
        level: 0.8, // 80%
        isCharging: true
      },
      memory: {
        usageRatio: 0.3 // 30%
      }
    };
  }

  private selectPerformanceMode(
    complexityLevel: 'LOW' | 'MEDIUM' | 'HIGH',
    deviceStatus: DeviceStatus
  ): PerformanceMode {
    // Facteurs de décision
    const isBatteryLow = deviceStatus.battery?.level !== undefined && deviceStatus.battery?.level < 0.2;
    const isCharging = deviceStatus.battery?.isCharging === true;
    const hasHighMemory = deviceStatus.memory?.usageRatio !== undefined && deviceStatus.memory?.usageRatio < 0.5;

    // Matrice de décision
    if (complexityLevel === 'LOW') {
      if (isBatteryLow && !isCharging) return 'ECO';
      return 'BALANCED';
    }

    if (complexityLevel === 'MEDIUM') {
      if (isBatteryLow) return 'BALANCED';
      if (isCharging && hasHighMemory) return 'PERFORMANCE';
      return 'BALANCED';
    }

    // HIGH complexity
    if (isBatteryLow && !isCharging) {
      logger.warn('Router', 'Tâche complexe avec batterie faible, mode BALANCED forcé');
      return 'BALANCED';
    }

    if (isCharging && hasHighMemory) return 'MAXIMUM';
    return 'PERFORMANCE';
  }
}

export const router = new Router();
```

#### 3. Mise à jour du TaskExecutor pour transmettre la configuration au moteur

```typescript
// src/core/kernel/TaskExecutor.ts (Mise à jour)

// ...
class TaskExecutor {
  private async executeSingleTask(task: ExpertTask): Promise<TaskResult> {
    // ...
    try {
      const engine = await runtimeManager.getEngineFor(task);
      
      // Passe le mode de performance au moteur
      for await (const token of engine.generate(task.prompt, task.expert, task.performanceMode)) {
        generationResult += token;
      }
      // ...
    } catch (error) {
      // ...
    }
  }
}

export const taskExecutor = new TaskExecutor();
```

### Résultats Attendus
1. Création d'un type PerformanceMode avec les valeurs 'ECO', 'BALANCED', 'PERFORMANCE', 'MAXIMUM'
2. Mise à jour du MockEngine pour accepter et utiliser le mode de performance granulaire
3. Modification de la vitesse de génération selon le mode (0.5x à 2x la vitesse de base)
4. Modification de l'allocation mémoire selon le mode (0.5MB à 4MB par token)
5. Mise à jour du Router pour évaluer la complexité des prompts avec une approche multi-factorielle
6. Ajout de la propriété performanceMode dans l'interface ExpertTask
7. Implémentation de la méthode assessComplexity pour évaluer la complexité avec scoring
8. Mise à jour du TaskExecutor pour transmettre le mode au moteur
9. Simulation réaliste des limitations mémoire avec gestion des erreurs
10. Architecture prête pour l'intégration de modèles de différentes tailles
11. Ajustement dynamique du mode de performance pendant l'exécution
12. Matrice de décision basée sur l'état du device et la complexité