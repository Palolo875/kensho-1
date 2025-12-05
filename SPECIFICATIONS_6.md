# 🔧 Spécifications Techniques - Ensemble 6

## 🎯 Tâche #25 : Inférence Spéculative sur l'Intention

### Objectif
Transformer notre Router et notre RuntimeManager pour qu'ils n'attendent plus passivement le prompt final. Pendant que l'utilisateur tape, le système doit analyser le texte en temps réel, prédire l'intention la plus probable, et commencer à préchauffer le moteur du plugin expert correspondant en VRAM avant même que l'utilisateur n'ait appuyé sur "Envoyer".

### Philosophie "Usine Vide"
Nous implémentons la vraie logique de surveillance et de préchauffage. Le Router va réellement écouter les événements oninput, et le RuntimeManager va réellement simuler le chargement d'un modèle en mémoire. C'est le premier pas vers un système qui pense un coup d'avance.

### Spécifications Techniques Détaillées

#### 1. Structure de persistance OPFS pour les statistiques utilisateur

```json
// user-prediction-stats.json
{
  "userId": "anon-abc123",
  "lastUpdated": "2025-12-04T23:30:00Z",
  "globalAccuracy": 0.78,
  "totalPredictions": 127,
  "intentPatterns": {
    "solve": { "CODE": 0.65, "MATH": 0.32, "DIALOGUE": 0.03 },
    "function": { "CODE": 0.92, "DIALOGUE": 0.08 },
    "calculate": { "MATH": 0.88, "CODE": 0.10 },
    "write": { "CODE": 0.71, "DIALOGUE": 0.25 }
  },
  "userPrefs": {
    "preferredCodeExpert": "code-expert-v2",
    "disablePrewarmMath": false
  }
}
```

#### 2. Mise à jour du UI Bridge pour relayer l'événement input
Notre ui-controller.ts doit maintenant écouter l'événement input sur le champ de texte et l'envoyer au worker.

```typescript
// ui-controller.ts (Mise à jour)

// ... (code existant)
promptInput.addEventListener('input', () => {
  const currentText = promptInput.value;
  if (currentText.length > 10) { // Ne pas spammer pour quelques lettres
    worker.postMessage({ type: 'user-is-typing', payload: { text: currentText } });
  }
});
```

#### 3. Mise à jour du Kernel pour gérer le nouvel événement

```typescript
// src/core/kernel.ts (Mise à jour)

// ...
export async function initializeKernel(port: MessagePort) {
  // ...
  return {
    handleMessage: async (message: { type: string, payload: any }) => {
      // ...
      if (message.type === 'user-is-typing') {
        // Délègue l'analyse prédictive au Router
        await router.predictAndPrewarm(message.payload.text);
      }
    }
  };
}
```

#### 4. Mise à jour du Router avec la logique de préchauffage adaptatif
C'est le cœur de la nouvelle fonctionnalité avec des améliorations importantes.

```typescript
// src/core/kernel/Router.ts (Mise à jour majeure)

import { runtimeManager } from './RuntimeManager';
import { logger } from './monitoring/LoggerService';
import { storageManager } from './storage/StorageManager';
// ...

// Interface pour les statistiques utilisateur
interface UserPredictionStats {
  userId: string;
  lastUpdated: string;
  globalAccuracy: number;
  totalPredictions: number;
  intentPatterns: Record<string, Record<string, number>>;
  userPrefs: {
    preferredCodeExpert: string;
    disablePrewarmMath: boolean;
  };
}

class UserPredictionProfile {
  private userStats: Record<string, { correct: number, total: number }> = {};
  
  // Persistance OPFS
  async loadUserProfile(userId: string): Promise<void> {
    try {
      const profile = await storageManager.getFile(`prediction-profile-${userId}.json`);
      if (profile) {
        this.userStats = JSON.parse(profile);
      }
    } catch (error) {
      logger.warn('UserPredictionProfile', 'Échec du chargement du profil utilisateur', error);
    }
  }
  
  async saveUserProfile(userId: string): Promise<void> {
    try {
      await storageManager.saveFile(
        `prediction-profile-${userId}.json`, 
        JSON.stringify(this.userStats)
      );
    } catch (error) {
      logger.warn('UserPredictionProfile', 'Échec de la sauvegarde du profil utilisateur', error);
    }
  }

  getAdaptiveThreshold(intent: string): number {
    const userStats = this.userStats[intent] || { correct: 0, total: 0 };
    const userAccuracy = userStats.total > 5 ? userStats.correct / userStats.total : 0.5;
    
    // Personnalisation par utilisateur + fallback global
    return Math.max(0.3, userAccuracy * 0.7);
  }

  updateStats(intent: string, wasCorrect: boolean): void {
    const stats = this.userStats[intent] || { correct: 0, total: 0 };
    stats.total++;
    if (wasCorrect) stats.correct++;
    this.userStats[intent] = stats;
  }
  
  getStats(): Record<string, { correct: number, total: number }> {
    return this.userStats;
  }
}

class AdaptiveRouter {
  private prewarmTimeout: any = null;
  private lastPrewarmedExpert: string | null = null;
  private lastPredictedIntent: string | null = null;
  private prewarmTimeout: any = null;
  
  private readonly INTENT_PATTERNS: Record<string, { keywords: string[], weight: number }[]> = {
    'CODE': [
      { keywords: ['write', 'code'], weight: 3 },
      { keywords: ['function', 'return'], weight: 3 },
      { keywords: ['debug', 'error', 'bug'], weight: 2 },
      { keywords: ['javascript', 'python', 'typescript'], weight: 4 },
      { keywords: ['implement', 'algorithm'], weight: 2 },
      { keywords: ['code'], weight: 1 } // Seul = faible poids
    ],
    'MATH': [
      { keywords: ['calculate', 'solve'], weight: 3 },
      { keywords: ['equation', 'formula'], weight: 4 },
      { keywords: ['math', 'problem'], weight: 2 },
      { keywords: ['integral', 'derivative'], weight: 5 },
      { keywords: ['x', '=', 'solve'], weight: 3 } // Patterns mathématiques
    ]
  };

  private intentConfidenceHistory: Array<{ intent: string, confidence: number, timestamp: number }> = [];
  private predictionAccuracy: Map<string, { correct: number, total: number }> = new Map();
  private userStats: UserPredictionStats | null = null;
  private userProfile: UserPredictionProfile = new UserPredictionProfile();

  constructor() {
    // Charge les statistiques utilisateur au démarrage
    this.loadUserStats();
  }

  async loadUserStats(): Promise<void> {
    try {
      const stats = await storageManager.readFile('user-prediction-stats.json');
      this.userStats = JSON.parse(stats);
      logger.info('Router', `Stats utilisateur chargé: ${this.userStats.globalAccuracy.toFixed(1)} accuracy`);
      
      // Charge également le profil utilisateur spécifique
      await this.userProfile.loadUserProfile(this.userStats.userId);
    } catch {
      this.userStats = { 
        userId: "anonymous",
        lastUpdated: new Date().toISOString(),
        globalAccuracy: 0,
        totalPredictions: 0,
        intentPatterns: {},
        userPrefs: {
          preferredCodeExpert: "code-qwen2.5-coder-1.5b-mock",
          disablePrewarmMath: false
        }
      };
    }
  }

  /**
   * Analyse le texte en cours de frappe, prédit l'intention et préchauffe le plugin.
   */
  public async predictAndPrewarm(text: string): Promise<void> {
    // Utilise un debounce pour ne pas surcharger le système
    clearTimeout(this.prewarmTimeout);
    this.prewarmTimeout = setTimeout(async () => {
      
      const { intent, confidence } = this.classifyIntentWithConfidence(text);
      
      // ✅ Ne prewarm que si confiance suffisante
      const threshold = this.getAdaptiveThreshold(intent);
      if (confidence < threshold) {
        logger.debug('Router', `Confiance trop faible pour ${intent} (${confidence} < ${threshold})`);
        return;
      }

      // Track l'historique pour learning
      this.intentConfidenceHistory.push({ 
        intent, 
        confidence, 
        timestamp: Date.now() 
      });

      const probableExpert = this.selectExpertForIntent(intent);
      if (!probableExpert || probableExpert === this.lastPrewarmedExpert) return;

      logger.info('Router', `🎯 Intent: ${intent} (confiance: ${(confidence * 100).toFixed(0)}%) → Prewarm ${probableExpert}`);
      
      runtimeManager.prewarmModel(probableExpert);
      this.lastPrewarmedExpert = probableExpert;
      this.lastPredictedIntent = intent;

    }, 300); // Attend 300ms après la dernière frappe
  }

  classifyIntentWithConfidence(text: string): { intent: string, confidence: number } {
    const baseScores = this.calculateBaseScores(text); // N-grams
    const userBoostedScores = this.applyUserPreferences(baseScores, text);

    // Fusionne base + user data
    const finalScores: Record<string, number> = {};
    for (const [intent, score] of Object.entries(baseScores)) {
      finalScores[intent] = score + (userBoostedScores[intent] || 0);
    }

    const maxScore = Math.max(...Object.values(finalScores));
    // Seuil minimal de score pour éviter les faux positifs
    if (maxScore < 2) {
      return { intent: 'DIALOGUE', confidence: 0 };
    }

    const intent = Object.keys(finalScores).find(k => finalScores[k] === maxScore) || 'DIALOGUE';
    const confidence = maxScore / 15; // Normalisé

    logger.debug('Router', `Intent scores: ${JSON.stringify(finalScores)} → ${intent} (${confidence})`);
    return { intent, confidence };
  }

  private calculateBaseScores(text: string): Record<string, number> {
    const lowerText = text.toLowerCase();
    const scores: Record<string, number> = { 'DIALOGUE': 0, 'CODE': 0, 'MATH': 0 };

    // Calcule un score pour chaque intent
    for (const [intent, patterns] of Object.entries(this.INTENT_PATTERNS)) {
      for (const { keywords, weight } of patterns) {
        // Vérifie si TOUS les mots du pattern sont présents
        if (keywords.every(keyword => lowerText.includes(keyword))) {
          scores[intent] += weight;
        }
      }
    }

    return scores;
  }

  private applyUserPreferences(
    baseScores: Record<string, number>, 
    text: string
  ): Record<string, number> {
    if (!this.userStats) return {};

    const boosts: Record<string, number> = {};
    const words = text.toLowerCase().split(/\s+/);

    for (const word of words) {
      const patterns = this.userStats.intentPatterns[word];
      if (patterns) {
        for (const [intent, prob] of Object.entries(patterns)) {
          boosts[intent] = (boosts[intent] || 0) + (prob as number) * 2; // Boost x2 user data
        }
      }
    }

    return boosts;
  }

  private getAdaptiveThreshold(intent: string): number {
    // Utilise le seuil adaptatif du profil utilisateur
    if (this.userStats && this.userStats.userId !== "anonymous") {
      return this.userProfile.getAdaptiveThreshold(intent);
    }
    
    // Seuil plus bas pour les intents fréquemment corrects
    const recentHistory = this.intentConfidenceHistory
      .filter(h => h.intent === intent)
      .slice(-10); // Dernières 10 prédictions

    if (recentHistory.length < 3) return 0.5; // Seuil conservateur par défaut

    // Si l'historique montre qu'on est souvent bon, on baisse le seuil
    const avgConfidence = recentHistory.reduce((sum, h) => sum + h.confidence, 0) / recentHistory.length;
    return Math.max(0.3, avgConfidence * 0.8); // Entre 30% et 80%
  }

  private selectExpertForIntent(intent: string): string | null {
    // Logique simplifiée pour trouver le meilleur expert pour une intention
    if (intent === 'CODE') return 'code-qwen2.5-coder-1.5b-mock';
    if (intent === 'MATH') return 'math-bitnet-1.58b-mock';
    return null;
  }

  public async createPlan(prompt: string): Promise<ExecutionPlan> {
    // ... (début normal)

    const actualIntent = this.detectIntent(prompt);
    const predictedIntent = this.lastPredictedIntent; // À ajouter

    // ✅ Vérifie si la prédiction était correcte
    if (predictedIntent && this.lastPrewarmedExpert) {
      const wasCorrect = actualIntent === predictedIntent;
      
      const stats = this.predictionAccuracy.get(predictedIntent) || { correct: 0, total: 0 };
      stats.total++;
      if (wasCorrect) stats.correct++;
      this.predictionAccuracy.set(predictedIntent, stats);

      const accuracy = (stats.correct / stats.total * 100).toFixed(1);
      logger.info('Router', `Prédiction ${wasCorrect ? '✅' : '❌'} (précision ${predictedIntent}: ${accuracy}%)`);

      // Si précision < 50%, ajuste les patterns
      if (stats.total > 10 && stats.correct / stats.total < 0.5) {
        logger.warn('Router', `Mauvaise précision pour ${predictedIntent}, désactivation temporaire`);
        this.disablePrewarmFor(predictedIntent, 60000); // 1 minute
      }
      
      // Met à jour les statistiques utilisateur
      await this.updateUserStats(prompt, actualIntent, wasCorrect);
    }

    // ... (continue)
  }

  private async updateUserStats(
    prompt: string, 
    actualIntent: string, 
    wasCorrect: boolean
  ): Promise<void> {
    if (!this.userStats) return;

    // Met à jour global accuracy
    const stats = this.userStats;
    stats.globalAccuracy = (
      stats.globalAccuracy * stats.totalPredictions + (wasCorrect ? 1 : 0)
    ) / (stats.totalPredictions + 1);
    stats.totalPredictions++;

    // Met à jour les patterns par mot
    const words = prompt.toLowerCase().split(/\s+/).slice(0, 10);
    for (const word of words) {
      if (!stats.intentPatterns[word]) {
        stats.intentPatterns[word] = { CODE: 0, MATH: 0, DIALOGUE: 0 };
      }
      
      const patterns = stats.intentPatterns[word];
      patterns[actualIntent]++;
      const total = Object.values(patterns).reduce((a, b) => a + b, 0);
      
      // Normalise en probabilités
      for (const intent of Object.keys(patterns)) {
        patterns[intent] = patterns[intent] / total;
      }
    }
    
    stats.lastUpdated = new Date().toISOString();

    // Sauvegarde async (non-bloquant)
    storageManager.saveFile('user-prediction-stats.json', JSON.stringify(stats))
      .catch(err => logger.warn('Router', 'Échec sauvegarde stats utilisateur', err));
      
    // Met aussi à jour le profil utilisateur spécifique
    if (this.userStats.userId !== "anonymous") {
      this.userProfile.updateStats(actualIntent, wasCorrect);
      await this.userProfile.saveUserProfile(this.userStats.userId);
    }
  }

  public getPredictionStats(): Record<string, { accuracy: number, total: number }> {
    const stats: any = {};
    for (const [intent, data] of this.predictionAccuracy.entries()) {
      stats[intent] = {
        accuracy: (data.correct / data.total * 100).toFixed(1) + '%',
        total: data.total
      };
    }
    return stats;
  }

  private disablePrewarmFor(intent: string, duration: number): void {
    // Implémentation de la désactivation temporaire
    setTimeout(() => {
      logger.info('Router', `Réactivation du préchauffage pour ${intent}`);
    }, duration);
  }
  
  public getUserProfileStats(): Record<string, { correct: number, total: number }> {
    return this.userProfile.getStats();
  }
}

export const router = new AdaptiveRouter();
```

#### 5. Mise à jour du RuntimeManager avec la méthode prewarmModel améliorée

```typescript
// src/core/kernel/RuntimeManager.ts (Mise à jour)

// ...
class RuntimeManager {
  // ... (propriétés existantes)
  private prewarmingModels: Map<string, AbortController> = new Map();
  
  private prewarmMetrics = {
    totalPrewarms: 0,
    successfulPrewarms: 0,
    cancelledPrewarms: 0,
    hitRate: 0, // % des prewarms qui ont été utilisés
    avgTimeSaved: 0
  };

  /**
   * Précharge un modèle en mémoire (VRAM simulée) sans l'exécuter.
   * C'est une opération non bloquante.
   */
  public prewarmModel(modelKey: string): void {
    this.prewarmMetrics.totalPrewarms++;
    
    // Annule les autres préchauffages en cours
    for (const [key, controller] of this.prewarmingModels.entries()) {
      if (key !== modelKey) {
        logger.info('RuntimeManager', `Annulation du préchauffage de ${key}`);
        controller.abort();
        this.prewarmingModels.delete(key);
        this.prewarmMetrics.cancelledPrewarms++;
      }
    }

    // Si déjà en cours pour ce modèle, ne rien faire
    if (this.prewarmingModels.has(modelKey)) {
      logger.debug('RuntimeManager', `${modelKey} déjà en préchauffage`);
      return;
    }

    // Si déjà chargé, ne rien faire
    if (this.loadedCompiledGraphs.has(modelKey)) {
      logger.debug('RuntimeManager', `${modelKey} déjà chargé`);
      this.prewarmMetrics.successfulPrewarms++;
      return;
    }

    // Lance le préchauffage avec AbortController
    const controller = new AbortController();
    this.prewarmingModels.set(modelKey, controller);

    logger.info('RuntimeManager', `🔥 Préchauffage de ${modelKey}...`);

    this.loadModel(modelKey, controller.signal)
      .then(() => {
        logger.info('RuntimeManager', `✅ ${modelKey} préchauffé et prêt`);
        this.prewarmingModels.delete(modelKey);
        this.prewarmMetrics.successfulPrewarms++;
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          logger.debug('RuntimeManager', `Préchauffage de ${modelKey} annulé`);
          this.prewarmMetrics.cancelledPrewarms++;
        } else {
          logger.error('RuntimeManager', `Échec du préchauffage`, err);
        }
        this.prewarmingModels.delete(modelKey);
      });
  }

  public async loadModel(modelKey: string, signal?: AbortSignal): Promise<void> {
    // ... (début inchangé)

    // Simule une compilation longue (interruptible)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, 4000);
      
      // ✅ Écoute l'abort
      signal?.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });

    // ... (reste)
  }

  public getMetrics() {
    return {
      ...this.prewarmMetrics,
      hitRate: (this.prewarmMetrics.successfulPrewarms / this.prewarmMetrics.totalPrewarms * 100).toFixed(1) + '%'
    };
  }

  // ... (le reste de la classe)
}

export const runtimeManager = new RuntimeManager();
```

### Résultats Attendus
1. Mise à jour du UI Bridge pour capturer les événements de frappe utilisateur
2. Mise à jour du Kernel pour traiter les événements de frappe
3. Implémentation de la logique de prédiction d'intention adaptative dans le Router
4. Ajout de la méthode prewarmModel améliorée dans le RuntimeManager
5. Système proactif qui anticipe les besoins de l'utilisateur
6. Réduction de la latence perçue grâce au préchauffage des modèles
7. Amélioration de l'expérience utilisateur avec des temps de réponse quasi instantanés
8. Système intelligent avec annulation des préchauffages inutiles
9. Boucle de feedback pour améliorer la précision des prédictions
10. Persistance des statistiques utilisateur pour un apprentissage adaptatif
11. Métriques de performance pour suivre l'efficacité du système
12. Profils utilisateur spécifiques pour un apprentissage personnalisé

## 🎯 Tâche #26 : Génération Spéculative de Tokens avec Batching

### Objectif
Implémenter une stratégie de "speculative decoding" simulée combinée avec du batch processing pour maximiser le throughput GPU et améliorer l'expérience utilisateur. Le principe est simple :

1. Un petit modèle ultra-rapide (le "draft model") génère une ébauche de plusieurs tokens d'avance.
2. Le grand modèle expert (le "verification model") valide ce bloc de tokens en une seule passe.
3. Si la validation réussit, on affiche le bloc entier d'un coup, donnant un gain de vitesse spectaculaire. Si elle échoue, on ne garde que le premier token correct et on recommence.
4. Plusieurs requêtes sont traitées en batch pour maximiser l'utilisation du GPU.

### Philosophie "Usine Vide"
Nous allons simuler ce comportement dans notre MockEngine. Nous n'utilisons pas de vrais modèles, mais nous implémentons la vraie logique d'orchestration entre un "draft" et une "validation", et nous simulons le gain de vitesse avec batching.

### Spécifications Techniques Détaillées

#### 1. Mise à jour du MockEngine pour la Génération Spéculative avec Batching

```typescript
// src/core/kernel/engine/MockEngine.ts (Mise à jour majeure)

import { memoryManager } from '../MemoryManager';

const DRAFT_MODEL_SPEED = 5; // ms par token (ultra rapide)
const EXPERT_MODEL_SPEED = 20; // ms par token (plus lent)
const SPECULATION_LENGTH = 4; // Nombre de tokens à spéculer
const BATCH_THRESHOLD = 4; // Nombre minimum de tâches pour activer le batching
const MAX_BATCH_SIZE = 8; // Taille maximale du batch

// Interfaces pour le batching
interface ExpertTask {
  id: string;
  prompt: string;
  modelKey: string;
  context: string[];
}

interface TaskResult {
  taskId: string;
  tokens: string[];
  metadata: {
    acceptRate: number;
    speedup: number;
  };
}

// Classes de modèles simulés
class MockDraftModel {
  async generateSpeculative(context: string[], count: number): Promise<string[]> {
    const tokens: string[] = [];
    
    for (let i = 0; i < count; i++) {
      await new Promise(r => setTimeout(r, DRAFT_MODEL_SPEED));
      
      // Simule une prédiction basée sur le contexte
      const prediction = this.predictNextToken(context.concat(tokens));
      tokens.push(prediction);
    }
    
    return tokens;
  }

  // Version batchée du draft model
  async generateSpeculativeBatch(contexts: string[][], count: number): Promise<string[][]> {
    const batchResults: string[][] = [];
    
    // Simule le traitement parallèle du batch
    await new Promise(r => setTimeout(r, DRAFT_MODEL_SPEED * count));
    
    // Génère des tokens pour chaque contexte du batch
    for (const context of contexts) {
      const tokens: string[] = [];
      for (let i = 0; i < count; i++) {
        const prediction = this.predictNextToken(context.concat(tokens));
        tokens.push(prediction);
      }
      batchResults.push(tokens);
    }
    
    return batchResults;
  }

  private predictNextToken(context: string[]): string {
    // Simule une prédiction (en vrai : model inference)
    const vocabulary = ['the', 'is', 'a', 'to', 'in', 'and', 'of', 'for', 'that', 'with'];
    return vocabulary[Math.floor(Math.random() * vocabulary.length)];
  }
}

class MockExpertModel {
  private kvCache: Map<string, any> = new Map(); // Simule le KV-cache

  async verify(context: string[], draftTokens: string[]): Promise<string[]> {
    const cacheKey = context.join('|');
    
    // ✅ Si le contexte est en cache, la vérification est plus rapide
    if (this.kvCache.has(cacheKey)) {
      await new Promise(r => setTimeout(r, EXPERT_MODEL_SPEED * 0.5)); // 50% plus rapide
      console.log('[MockExpertModel] KV-cache hit ! Vérification accélérée.');
    } else {
      await new Promise(r => setTimeout(r, EXPERT_MODEL_SPEED));
      this.kvCache.set(cacheKey, true); // Mise en cache
    }

    const acceptCount = this.getAcceptedCount(draftTokens, context);
    return acceptCount === 0 
      ? [this.generateCorrectToken(context)]
      : draftTokens.slice(0, acceptCount);
  }

  // Version batchée du modèle expert
  async verifyBatch(contexts: string[][], draftTokensBatch: string[][]): Promise<string[][]> {
    const batchResults: string[][] = [];
    
    // Simule le traitement matriciel du batch
    await new Promise(r => setTimeout(r, EXPERT_MODEL_SPEED));
    
    // Vérifie chaque paire context/draftTokens du batch
    for (let i = 0; i < contexts.length; i++) {
      const context = contexts[i];
      const draftTokens = draftTokensBatch[i];
      
      const cacheKey = context.join('|');
      
      // ✅ Si le contexte est en cache, la vérification est plus rapide
      if (this.kvCache.has(cacheKey)) {
        console.log('[MockExpertModel] KV-cache hit ! Vérification accélérée.');
      } else {
        this.kvCache.set(cacheKey, true); // Mise en cache
      }

      const acceptCount = this.getAcceptedCount(draftTokens, context);
      const result = acceptCount === 0 
        ? [this.generateCorrectToken(context)]
        : draftTokens.slice(0, acceptCount);
        
      batchResults.push(result);
    }
    
    return batchResults;
  }

  private getAcceptedCount(draftTokens: string[], context: string[]): number {
    // Estime la "difficulté" du contexte
    const difficulty = this.estimateDifficulty(context);
    
    // Taux de succès : 0.9 (facile) à 0.6 (difficile)
    const successRate = 0.9 - (difficulty * 0.3);
    
    if (Math.random() < successRate) {
      return draftTokens.length; // Tous acceptés
    }
    
    // Accepte partiellement (en moyenne 50% des tokens)
    return Math.floor(draftTokens.length * (0.5 + Math.random() * 0.5));
  }

  private estimateDifficulty(context: string[]): number {
    const lastTokens = context.slice(-10).join(' ').toLowerCase();
    
    // Mots complexes = difficulté élevée
    const complexWords = ['algorithm', 'quantum', 'derivative', 'optimization', 'function', 'calculate'];
    const complexityScore = complexWords.filter(w => lastTokens.includes(w)).length;
    
    return Math.min(1, complexityScore / 3); // 0 à 1
  }

  private generateCorrectToken(context: string[]): string {
    // En cas de rejet total, génère un token correct
    const vocabulary = ['token', 'word', 'result', 'answer', 'solution'];
    return vocabulary[Math.floor(Math.random() * vocabulary.length)];
  }
}

class BatchedSpeculativeEngine {
  private draftModel = new MockDraftModel();
  private expertModel = new MockExpertModel();
  
  private getOptimalSpecLength(batchSize: number): number {
    // Gros batch → spéculation courte (plus de parallélisme compute)
    // Petit batch → spéculation longue (plus de parallelism draft)
    return Math.max(2, 8 - batchSize / 2);
  }

  async *generateBatch(tasks: ExpertTask[]): AsyncGenerator<TaskResult> {
    // Regroupe par longueur de contexte (groupes de séquences similaires)
    const sequenceGroups = this.groupBySequenceLength(tasks);
    
    for (const group of sequenceGroups) {
      const batchSize = Math.min(group.tasks.length, MAX_BATCH_SIZE);
      const specLength = this.getOptimalSpecLength(batchSize);
      
      // Speculative decoding PARALLÈLE sur tout le batch
      const draftTokensBatch = await this.draftModel.generateSpeculativeBatch(
        group.contexts, specLength
      ); // Shape: [batch_size, spec_length]
      
      const verifiedBatch = await this.expertModel.verifyBatch(
        group.contexts, draftTokensBatch
      ); // Une seule passe matricielle
      
      // Yield résultats par tâche
      for (let i = 0; i < group.tasks.length; i++) {
        const validatedTokens = verifiedBatch[i];
        const acceptRate = validatedTokens.length / specLength;
        
        yield {
          taskId: group.tasks[i].id,
          tokens: validatedTokens,
          metadata: { 
            acceptRate,
            speedup: this.calculateSpeedup(acceptRate, specLength)
          }
        };
      }
    }
  }

  private groupBySequenceLength(tasks: ExpertTask[]): any[] {
    // Regroupe les tâches par longueur de contexte similaire
    const groups: any[] = [];
    const sortedTasks = [...tasks].sort((a, b) => a.context.length - b.context.length);
    
    for (let i = 0; i < sortedTasks.length; i += MAX_BATCH_SIZE) {
      const batch = sortedTasks.slice(i, i + MAX_BATCH_SIZE);
      groups.push({
        tasks: batch,
        contexts: batch.map(t => t.context)
      });
    }
    
    return groups;
  }

  private calculateSpeedup(acceptRate: number, specLength: number): number {
    // Calcule le speedup théorique basé sur le taux d'acceptation
    if (acceptRate < 0.3) return 1.0; // Fallback classique
    return 1 + (acceptRate * specLength * 0.5); // Approximation du gain
  }
}

export class MockEngine {
  private draftModel = new MockDraftModel();
  private expertModel = new MockExpertModel();
  private batchedEngine = new BatchedSpeculativeEngine();
  private speculationLength = 4;
  private readonly MIN_LENGTH = 2;
  private readonly MAX_LENGTH = 8;
  private useSpeculativeDecoding = true;
  private pendingTasks: ExpertTask[] = [];

  private speculativeMetrics = {
    totalTokens: 0,
    speculatedTokens: 0,
    acceptedTokens: 0,
    rejectedSpeculations: 0,
    avgAcceptRate: 0,
    speedup: 0
  };

  /**
   * Simule la génération de tokens avec "speculative decoding".
   */
  public async *generate(prompt: string, modelKey: string): AsyncGenerator<string> {
    const startTime = performance.now();
    let tokensGenerated = 0;
    
    console.log(`[MockEngine] Début de la génération pour ${modelKey} avec Speculative Decoding...`);
    
    const context = [prompt]; // Historique des tokens
    
    // Vérifie si le speculative decoding est efficace
    const recentAcceptRate = this.calculateRecentAcceptRate();
    if (recentAcceptRate < 0.3) {
      console.warn('[MockEngine] Speculative inefficace, passage en mode classique');
      this.useSpeculativeDecoding = false;
    }

    if (!this.useSpeculativeDecoding) {
      yield* this.generateClassical(prompt, modelKey);
      return;
    }

    while (!this.shouldStop(context)) {
      // --- Phase 1: DRAFT génère des tokens ---
      const draftTokens = await this.draftModel.generateSpeculative(
        context, 
        this.speculationLength // ✅ Longueur adaptative
      );
      this.speculativeMetrics.speculatedTokens += draftTokens.length;

      // --- Phase 2: EXPERT valide en une seule passe ---
      const validatedTokens = await this.expertModel.verify(context, draftTokens);
      this.speculativeMetrics.acceptedTokens += validatedTokens.length;
      
      if (validatedTokens.length < draftTokens.length) {
        this.speculativeMetrics.rejectedSpeculations++;
      }

      // ✅ Adapte la longueur selon le succès
      this.adjustSpeculationLength(validatedTokens.length, draftTokens.length);

      // Yield les tokens validés
      for (const token of validatedTokens) {
        yield token + ' ';
        context.push(token); // ✅ Met à jour le contexte
        tokensGenerated++;
      }
    }
    
    const duration = performance.now() - startTime;
    this.speculativeMetrics.totalTokens += tokensGenerated;
    this.speculativeMetrics.avgAcceptRate = 
      this.speculativeMetrics.acceptedTokens / this.speculativeMetrics.speculatedTokens;

    // Calcule le speedup par rapport au mode classique
    const classicalTime = tokensGenerated * EXPERT_MODEL_SPEED;
    this.speculativeMetrics.speedup = classicalTime / duration;

    console.log(`[MockEngine] Speedup: ${this.speculativeMetrics.speedup.toFixed(2)}x`);
    console.log(`[MockEngine] Fin de la génération pour ${modelKey}.`);
  }

  // Nouvelle méthode pour le traitement batché
  public async *generateBatched(prompt: string, modelKey: string): AsyncGenerator<string> {
    const taskId = `task_${Date.now()}`;
    const task: ExpertTask = {
      id: taskId,
      prompt,
      modelKey,
      context: [prompt]
    };
    
    // Ajoute la tâche à la file d'attente
    this.pendingTasks.push(task);
    
    // Si assez de tâches, active le batching
    if (this.pendingTasks.length >= BATCH_THRESHOLD) {
      console.log(`[MockEngine] Activation du batching avec ${this.pendingTasks.length} tâches`);
      
      // Traite le batch
      const results = this.batchedEngine.generateBatch(this.pendingTasks);
      
      // Traite les résultats
      for await (const result of results) {
        const task = this.pendingTasks.find(t => t.id === result.taskId);
        if (task) {
          console.log(`[MockEngine] Résultat batch pour tâche ${result.taskId}: ${result.tokens.length} tokens`);
          
          // Yield les tokens
          for (const token of result.tokens) {
            yield token + ' ';
          }
        }
      }
      
      // Vide la file d'attente
      this.pendingTasks = [];
    } else {
      // Sinon, utilise la génération normale
      yield* this.generate(prompt, modelKey);
    }
  }

  private shouldStop(context: string[]): boolean {
    return context.length > 100 || context[context.length - 1] === '<EOS>';
  }

  private adjustSpeculationLength(accepted: number, attempted: number): void {
    const acceptRate = accepted / attempted;

    if (acceptRate > 0.9 && this.speculationLength < this.MAX_LENGTH) {
      this.speculationLength++;
      console.log(`[MockEngine] Taux d'acceptation élevé → augmente à ${this.speculationLength}`);
    } else if (acceptRate < 0.5 && this.speculationLength > this.MIN_LENGTH) {
      this.speculationLength--;
      console.log(`[MockEngine] Taux d'acceptation faible → réduit à ${this.speculationLength}`);
    }
  }

  private calculateRecentAcceptRate(): number {
    if (this.speculativeMetrics.speculatedTokens === 0) return 1;
    return this.speculativeMetrics.acceptedTokens / this.speculativeMetrics.speculatedTokens;
  }

  private async *generateClassical(prompt: string, modelKey: string): AsyncGenerator<string> {
    // Mode classique : 1 token à la fois
    console.log(`[MockEngine] Génération classique pour ${modelKey}...`);
    const tokens = prompt.split(' ');
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, EXPERT_MODEL_SPEED));
      yield token + ' ';
    }
  }

  public getMetrics() {
    return {
      ...this.speculativeMetrics,
      avgAcceptRate: (this.speculativeMetrics.avgAcceptRate * 100).toFixed(1) + '%'
    };
  }
}
```

#### 2. Mise à jour du TaskExecutor pour supporter le batching

```typescript
// src/core/kernel/TaskExecutor.ts (Mise à jour)

import { MockEngine } from './engine/MockEngine';
// ... autres imports

class TaskExecutor {
  private mockEngine = new MockEngine();
  // ... autres propriétés

  async executeTask(task: Task): Promise<any> {
    // ... code existant

    // Utilise la génération batchée si disponible
    if (this.shouldUseBatching()) {
      console.log('[TaskExecutor] Utilisation de la génération batchée');
      const generator = this.mockEngine.generateBatched(task.prompt, task.modelKey);
      
      let result = '';
      for await (const token of generator) {
        result += token;
        // Envoie les tokens au fur et à mesure
        this.sendPartialResult(task.id, token);
      }
      
      return result;
    } else {
      // Utilise la génération normale
      const generator = this.mockEngine.generate(task.prompt, task.modelKey);
      
      let result = '';
      for await (const token of generator) {
        result += token;
        // Envoie les tokens au fur et à mesure
        this.sendPartialResult(task.id, token);
      }
      
      return result;
    }
  }

  private shouldUseBatching(): boolean {
    // Active le batching selon certaines conditions
    // Par exemple, si plusieurs tâches sont en attente
    return true; // Pour l'instant, toujours actif
  }

  private sendPartialResult(taskId: string, token: string): void {
    // Envoie le token partiel au client
    // ... implémentation
  }

  // ... reste du code
}

export const taskExecutor = new TaskExecutor();
```

### Résultats Attendus
1. Implémentation de la logique de génération spéculative dans le MockEngine
2. Simulation réaliste du comportement draft/validation avec vraie génération
3. Gain de vitesse spectaculaire dans les cas de succès (jusqu'à 2x)
4. Affichage de blocs de tokens entiers pour une expérience utilisateur fluide
5. Compatibilité totale avec l'architecture existante
6. Réduction de la latence perçue grâce à la génération anticipée
7. Amélioration de l'expérience utilisateur avec des débits multipliés
8. Efficacité énergétique grâce à la réduction des appels au modèle expert
9. Architecture robuste qui absorbe les améliorations complexes sans modification
10. Système intelligent qui simule un "cerveau reptilien" pour prédire sa propre pensée
11. Gestion du KV-cache pour simulation réaliste
12. Métriques de performance pour suivre l'efficacité du système
13. Adaptation dynamique de la longueur de spéculation
14. Mode fallback vers la génération classique si speculative decoding inefficace
15. Support du batching pour maximiser le throughput GPU
16. Traitement parallèle de plusieurs requêtes
17. Optimisation de l'utilisation du GPU/WebGPU
18. Réduction significative de la latence par requête