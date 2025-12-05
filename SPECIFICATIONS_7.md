# 🔧 Spécifications Techniques - Ensemble 7

## 🎯 Tâche #27 : Self-Correction Loop

### Objectif
Implémenter une boucle d'auto-correction où, après la génération d'une réponse, un "critique" interne l'évalue et, si nécessaire, demande une réécriture avant que la réponse finale ne soit envoyée à l'utilisateur.

### Philosophie "Usine Vide"
Nous allons modifier notre TaskExecutor pour orchestrer ce processus. Nous utiliserons notre MockEngine pour simuler à la fois la génération initiale et la réécriture. Le "critique" sera une simple fonction pour le moment, mais l'architecture sera en place pour le remplacer par un vrai modèle plus tard.

### Spécifications Techniques Détaillées

#### 1. Création du "Critique" Structuré avec Scoring Détaillé
Ce service simulera l'évaluation d'une réponse avec un scoring multi-dimensionnel.

```typescript
// src/core/kernel/critics/ResponseCritic.ts (Mise à jour)

console.log("🧐 ResponseCritic (Production) initialisé.");

export interface Critique {
  is_acceptable: boolean;
  reason?: string;
  correction_suggestions?: string;
  scores?: {
    accuracy: number;
    clarity: number;
    completeness: number;
    safety: number;
  };
}

class ResponseCritic {
  /**
   * Simule l'évaluation d'une réponse avec scoring détaillé.
   * Attribue un score structuré (précision, clarté, complétude, sécurité) sur 0-1.
   * Une réponse est inacceptable si le score global est < 0.7.
   */
  public async review(prompt: string, response: string): Promise<Critique> {
    console.log("[Critic] Évaluation de la réponse...");
    await new Promise(r => setTimeout(r, 50)); // Simule le temps d'analyse

    // Calcule les scores détaillés
    const scores = {
      accuracy: await this.scoreAccuracy(prompt, response),
      clarity: await this.scoreClarity(response),
      completeness: await this.scoreCompleteness(prompt, response),
      safety: await this.scoreSafety(response)
    };

    // Calcule un score global (0-1)
    const globalScore = Object.values(scores).reduce((a, b) => a + b) / 4;

    // Critique basée sur un score structuré
    if (globalScore < 0.7) {
      const lowestCriterion = Object.entries(scores)
        .sort((a, b) => a[1] - b[1])[0];
      
      console.log(`[Critic] ⚠️ Réponse jugée inacceptable (score: ${(globalScore * 100).toFixed(0)}%).`);
      return {
        is_acceptable: false,
        reason: `Score insuffisant (${(globalScore * 100).toFixed(0)}%)`,
        correction_suggestions: this.getSuggestion(lowestCriterion[0]),
        scores
      };
    }

    console.log(`[Critic] ✅ Réponse jugée acceptable (score: ${(globalScore * 100).toFixed(0)}%).`);
    return { is_acceptable: true, scores };
  }

  private async scoreAccuracy(prompt: string, response: string): Promise<number> {
    // Vérifie si la réponse répond vraiment au prompt
    const keywords = this.extractKeywords(prompt);
    const mentionedKeywords = keywords.filter(k => 
      response.toLowerCase().includes(k.toLowerCase())
    );
    return keywords.length > 0 ? mentionedKeywords.length / keywords.length : 1;
  }

  private async scoreClarity(response: string): Promise<number> {
    // Analyse la lisibilité
    const avgSentenceLength = this.getAvgSentenceLength(response);
    const complexWords = this.countComplexWords(response);
    
    // Pénalise les phrases trop longues (>25 mots) ou trop courtes (<5 mots)
    const clarityPenalty = avgSentenceLength > 25 || avgSentenceLength < 5 ? 0.5 : 1;
    return clarityPenalty * (1 - complexWords / Math.max(1, response.split(' ').length));
  }

  private async scoreCompleteness(prompt: string, response: string): Promise<number> {
    // Vérifie si tous les aspects du prompt sont couverts
    const questions = this.extractQuestions(prompt);
    const answeredQuestions = questions.filter(q => 
      this.isQuestionAnswered(q, response)
    );
    return questions.length > 0 ? answeredQuestions.length / questions.length : 1;
  }

  private async scoreSafety(response: string): Promise<number> {
    // Détecte les contenus problématiques
    const redFlags = ['hack', 'exploit', 'illegal', 'dangerous'];
    const flagsFound = redFlags.filter(flag => 
      response.toLowerCase().includes(flag)
    );
    return 1 - (flagsFound.length * 0.3); // Pénalité de 30% par flag
  }

  private extractKeywords(prompt: string): string[] {
    // Extraction simplifiée de mots-clés
    return prompt.toLowerCase().match(/\b(\w{4,})\b/g) || [];
  }

  private getAvgSentenceLength(response: string): number {
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const totalWords = sentences.reduce((acc, s) => acc + s.trim().split(/\s+/).length, 0);
    return sentences.length > 0 ? totalWords / sentences.length : 0;
  }

  private countComplexWords(response: string): number {
    // Compte les mots avec plus de 3 syllabes comme mots complexes
    const words = response.toLowerCase().match(/\b\w+\b/g) || [];
    return words.filter(word => this.countSyllables(word) > 3).length;
  }

  private countSyllables(word: string): number {
    // Comptage simplifié de syllabes
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  private extractQuestions(prompt: string): string[] {
    // Extraction simplifiée de questions
    const questionRegex = /[?]/g;
    const matches = prompt.match(questionRegex);
    return matches ? Array(matches.length).fill("question") : [];
  }

  private isQuestionAnswered(question: string, response: string): boolean {
    // Vérification simplifiée si une question est répondue
    return response.length > 50; // Heuristique basique
  }

  private getSuggestion(criterion: string): string {
    const suggestions: Record<string, string> = {
      accuracy: "Assure-toi de répondre précisément à la question posée",
      clarity: "Utilise des phrases plus courtes et plus simples",
      completeness: "Couvre tous les aspects de la question",
      safety: "Évite les termes problématiques"
    };
    return suggestions[criterion] || "Améliore la qualité globale de la réponse";
  }
}

export const responseCritic = new ResponseCritic();
```

#### 2. Création du Moteur TRM comme Moteur Central d'Auto-Correction
Implémentation d'un moteur TRM qui combine génération ET critique dans un cycle itératif ultra-rapide.

```typescript
// src/core/kernel/engine/TRMEngine.ts (Mise à jour)

export class TRMEngine {
  /**
   * Intègre TRM comme moteur central d'auto-correction.
   * Combine génération ET critique dans un cycle itératif ultra-rapide.
   * Utilise generateWithSelfCorrection qui affine la réponse étape par étape
   * sans refaire une génération complète à chaque correction.
   */
  public async *generateWithSelfCorrection(
    prompt: string,
    maxRecursions: number = 12
  ): AsyncGenerator<{ step: number, solution: string, reasoning: string }> {
    console.log("[TRMEngine] Démarrage de la génération avec self-correction intégrée...");
    
    // Simule l'embedding du prompt
    const x = this.embed(prompt);
    let z = this.initLatent(); // "scratchpad" pour le raisonnement
    let y = this.initSolution();
    
    for (let step = 0; step < maxRecursions; step++) {
      // --- THINK: Le modèle "critique" sa réponse actuelle ---
      z = await this.think(x, y, z);
      
      // --- ACT: Améliore la solution basée sur la critique ---
      const newY = await this.act(y, z);
      
      // Decode pour streaming
      const currentSolution = this.decode(newY);
      const reasoning = this.decodeReasoning(z);
      
      yield {
        step,
        solution: currentSolution,
        reasoning // ✅ Expose le "pourquoi" de chaque amélioration
      };
      
      // Halting condition (converged)
      if (this.hasConverged(y, newY)) {
        console.log(`[TRMEngine] Self-correction terminée à l'étape ${step} (convergence atteinte)`);
        break;
      }
      
      y = newY;
    }
  }

  private embed(prompt: string): any {
    // Simule l'embedding du prompt
    return { embedded: prompt.substring(0, 10) + "..." };
  }

  private initLatent(): any {
    // Initialise l'espace latent pour le raisonnement ("scratchpad")
    return { thoughts: [], history: [] };
  }

  private initSolution(): any {
    // Initialise la solution
    return { content: "" };
  }

  private async think(x: any, y: any, z: any): Promise<any> {
    // Simule le processus de pensée avec critique intégrée
    await new Promise(r => setTimeout(r, 8)); // 8ms par étape (TRM léger)
    
    // Ajoute la pensée courante à l'historique
    const thought = `Thought at step ${z.thoughts.length}: Analyzing solution quality`;
    return { 
      ...z, 
      thoughts: [...z.thoughts, thought],
      history: [...z.history, { solution: y.content, thought }]
    };
  }

  private async act(y: any, z: any): Promise<any> {
    // Simule l'amélioration de la solution basée sur la critique
    await new Promise(r => setTimeout(r, 8)); // 8ms par étape (TRM léger)
    
    // Améliore progressivement la solution en s'appuyant sur l'historique
    const improvement = ` Improvement step ${z.thoughts.length} based on previous analysis`;
    return { 
      ...y, 
      content: y.content + improvement
    };
  }

  private decode(solution: any): string {
    // Décode la solution pour le streaming
    return solution.content;
  }

  private decodeReasoning(latent: any): string {
    // Décode le raisonnement
    return latent.thoughts[latent.thoughts.length - 1] || "Initial reasoning";
  }

  private hasConverged(oldY: any, newY: any): boolean {
    // Condition d'arrêt : convergence basée sur la stabilité
    return Math.random() < 0.15; // 15% de chance de converger à chaque étape
  }
}
```

#### 3. Mise à jour du TaskExecutor avec Intégration TRM et Suivi d'Amélioration
Le TaskExecutor devient le chef d'orchestre avec TRM comme moteur central, critique structurée et delta scoring.

```typescript
// src/core/kernel/TaskExecutor.ts (Mise à jour majeure)

import { responseCritic, Critique } from './critics/ResponseCritic';
import { TRMEngine } from './engine/TRMEngine';
// ... (autres imports)

const MAX_CORRECTION_ATTEMPTS = 2;

class TaskExecutor {
  // ... (propriétés et executePlan existants)

  private async executeSingleTask(task: ExpertTask): Promise<TaskResult> {
    // Détecte si la tâche nécessite du raisonnement
    const requiresReasoning = this.detectReasoningTask(task.prompt);
    
    if (requiresReasoning) {
      // ✅ Utilise TRM comme moteur central pour les tâches complexes
      return this.executeWithTRM(task);
    }
    
    // Pour les tâches simples, utilise l'approche avec critique comme backstop
    return this.executeSingleTaskWithCritic(task);
  }

  private detectReasoningTask(prompt: string): boolean {
    // Détecte si la tâche nécessite du raisonnement
    const reasoningKeywords = ['why', 'how', 'explain', 'reason', 'analyze', 'compare', 'evaluate', 'justify'];
    const lowerPrompt = prompt.toLowerCase();
    return reasoningKeywords.some(keyword => lowerPrompt.includes(keyword));
  }

  private async executeWithTRM(task: ExpertTask): Promise<TaskResult> {
    console.log(`[TaskExecutor] Exécution avec TRM (moteur central) pour ${task.expert}`);
    
    const trmEngine = new TRMEngine();
    let finalSolution = "";
    let reasoningTrace = "";
    let stepCount = 0;
    
    // Stream les étapes de raisonnement à l'utilisateur via SSE pour transparence
    console.log("[TaskExecutor] Streaming des étapes de raisonnement...");
    
    for await (const { step, solution, reasoning } of trmEngine.generateWithSelfCorrection(task.prompt)) {
      stepCount = step + 1;
      
      // Stream les étapes de raisonnement à l'utilisateur
      console.log(`[Step ${step}] ${reasoning}`);
      
      // En production, cela serait envoyé via SSE
      // sseStreamer.streamPartial(`[Step ${step}] ${reasoning}\n`);
      
      finalSolution = solution;
      reasoningTrace += `[Step ${step}] ${reasoning}\n`;
    }
    
    return {
      expert: 'reasoning-trm-7m',
      result: finalSolution,
      metadata: { 
        reasoningTrace,
        steps: stepCount,
        engine: 'TRM',
        mode: 'explain-reasoning'
      },
      status: 'success'
    };
  }

  private async executeSingleTaskWithCritic(task: ExpertTask): Promise<TaskResult> {
    let attempt = 0;
    let bestResponse = "";
    let bestScore = 0;
    let currentPrompt = task.prompt;

    while (attempt < MAX_CORRECTION_ATTEMPTS) {
      attempt++;
      console.log(`[TaskExecutor] Tentative de génération #${attempt} pour ${task.expert}`);
      
      // --- Génération ---
      let generationResult = "";
      try {
        const engine = await runtimeManager.getEngineFor(task);
        for await (const token of engine.generate(currentPrompt, task.expert)) {
          generationResult += token;
        }
      } catch (error) {
        runtimeManager.handleFailure();
        throw error;
      }

      // --- Critique avec scoring détaillé ---
      const critique = await responseCritic.review(task.prompt, generationResult);
      const currentScore = this.calculateGlobalScore(critique.scores);

      // ✅ Suivi de l'amélioration par delta scoring
      const improvement = currentScore - bestScore;
      console.log(`[TaskExecutor] Tentative ${attempt}: score ${(currentScore * 100).toFixed(0)}% (${improvement > 0 ? '+' : ''}${(improvement * 100).toFixed(0)}%)`);

      if (currentScore > bestScore) {
        bestResponse = generationResult;
        bestScore = currentScore;
      }

      if (critique.is_acceptable) {
        console.log(`[TaskExecutor] ✅ Réponse validée à la tentative #${attempt}.`);
        return {
          expert: task.expert,
          result: generationResult,
          metadata: {
            attempts: attempt,
            finalScore: currentScore,
            improvements: improvement,
            engine: 'MockEngine'
          },
          status: 'success'
        };
      }

      // --- Correction ---
      console.log(`[TaskExecutor] 🔄 Demande de correction. Raison: ${critique.reason}`);
      
      // Si le score baisse, arrête (pas d'amélioration) - delta scoring
      if (improvement < 0 && attempt > 1) {
        console.warn('[TaskExecutor] Score en baisse, utilisation de la meilleure réponse précédente');
        return {
          expert: task.expert,
          result: bestResponse,
          metadata: { 
            attempts: attempt, 
            finalScore: bestScore,
            engine: 'MockEngine'
          },
          status: 'success'
        };
      }

      // Crée un prompt structuré avec balises XML pour guidage précis
      currentPrompt = this.buildStructuredCorrectionPrompt(task.prompt, generationResult, critique);
    }

    console.warn(`[TaskExecutor] Échec de la validation après ${MAX_CORRECTION_ATTEMPTS} tentatives. Utilisation de la dernière réponse générée.`);
    return {
      expert: task.expert,
      result: bestResponse,
      metadata: { 
        attempts: MAX_CORRECTION_ATTEMPTS, 
        finalScore: bestScore,
        status: 'max_attempts_reached',
        engine: 'MockEngine'
      },
      status: 'success_with_warnings'
    };
  }

  private calculateGlobalScore(scores: any): number {
    if (!scores) return 0;
    return Object.values(scores).reduce((a: number, b: number) => a + b, 0) / Object.keys(scores).length;
  }

  private buildStructuredCorrectionPrompt(
    originalPrompt: string,
    previousResponse: string,
    critique: Critique
  ): string {
    // Prompt de correction structuré avec balises XML
    return `<task>
Améliore la réponse suivante en te basant sur la critique.

<original_question>
${originalPrompt}
</original_question>

<previous_response>
${previousResponse}
</previous_response>

<critique>
Problème: ${critique.reason}
Scores détaillés: ${JSON.stringify(critique.scores)}
Suggestion: ${critique.correction_suggestions}
</critique>

<instructions>
1. Garde ce qui était bon dans la réponse précédente
2. Corrige spécifiquement le problème: ${critique.reason}
3. Applique cette suggestion: ${critique.correction_suggestions}
4. Assure-toi de la clarté, de l'exactitude et de l'exhaustivité
</instructions>

<improved_response>`;
  }
}

export const taskExecutor = new TaskExecutor();
```

## 🎯 Tâche #28 : Predictive Caching

### Objectif
Implémenter une logique de mise en cache prédictive. Après avoir répondu à une question, le système doit :

1. Générer 2 ou 3 questions de suivi probables.
2. Exécuter ces questions en arrière-plan, de manière silencieuse et avec une priorité basse.
3. Stocker les réponses dans le ResponseCache.

Ainsi, lorsque l'utilisateur cliquera sur une suggestion de question de suivi, la réponse sera déjà prête et s'affichera instantanément.

### Philosophie "Usine Vide"
Nous allons modifier notre DialoguePlugin pour orchestrer ce processus. Nous utiliserons notre MockEngine pour simuler à la fois la génération des questions de suivi et la génération de leurs réponses.

### Spécifications Techniques Détaillées

#### 1. Création du "Générateur de Questions de Suivi" Contextuel et Intelligent

Ce service simulera la prédiction des prochaines questions de l'utilisateur avec une approche contextuelle, un scoring de confiance et une boucle de rétroaction.

```typescript
// src/core/kernel/predictors/FollowUpPredictor.ts (Mise à jour)

console.log("🔮 FollowUpPredictor (Production) initialisé.");

interface PredictedQuestion {
  question: string;
  confidence: number; // 0-1
  reasoning: string;
}

class FollowUpPredictor {
  private readonly QUESTION_PATTERNS = {
    'definition': [
      'Qu\'est-ce que {concept} exactement ?',
      'Peux-tu expliquer {concept} plus en détail ?'
    ],
    'example': [
      'Peux-tu donner un exemple de {concept} ?',
      'Comment {concept} s\'applique-t-il dans la pratique ?'
    ],
    'comparison': [
      'Quelle est la différence entre {concept1} et {concept2} ?',
      'Pourquoi choisir {concept1} plutôt que {concept2} ?'
    ],
    'implementation': [
      'Comment implémenter {concept} ?',
      'Quels sont les pré-requis pour utiliser {concept} ?'
    ]
  };

  /**
   * Génère des questions de suivi contextuelles avec scoring de confiance.
   * Prédiction contextuelle + scoring + boucle de rétroaction.
   */
  public async predict(prompt: string, response: string): Promise<PredictedQuestion[]> {
    console.log("[Predictor] Prédiction des questions de suivi...");
    await new Promise(r => setTimeout(r, 100)); // Simule le temps d'analyse

    const predictions: PredictedQuestion[] = [];
    const concepts = this.extractConcepts(response);
    const questionType = this.detectQuestionType(prompt);

    // Calcule une confiance pour chaque type de suivi
    if (concepts.length > 0) {
      predictions.push({
        question: `Peux-tu expliquer ${concepts[0]} plus en détail ?`,
        confidence: 0.7, // Haute confiance : approfondissement est toujours pertinent
        reasoning: 'Approfondissement du concept principal'
      });
    }

    if (this.isTheoretical(response) && concepts.length > 0) {
      predictions.push({
        question: `Peux-tu donner un exemple de ${concepts[0]} ?`,
        confidence: 0.8, // Très haute : les exemples sont souvent demandés
        reasoning: 'Réponse théorique sans exemple'
      });
    }

    if (concepts.length >= 2) {
      predictions.push({
        question: `Quelle est la différence entre ${concepts[0]} et ${concepts[1]} ?`,
        confidence: 0.5, // Moyenne : pas toujours pertinent
        reasoning: 'Plusieurs concepts mentionnés'
      });
    }

    if (questionType === 'what' && concepts.length > 0) {
      predictions.push({
        question: `Comment implémenter ${concepts[0]} ?`,
        confidence: 0.6, // Moyenne-haute : souvent pertinent après définition
        reasoning: 'Question "quoi" -> besoin d\'implémentation'
      });
    }

    // Trie par confiance décroissante et limite à 3
    return predictions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  private extractConcepts(text: string): string[] {
    // Détecte les noms propres, termes techniques, etc.
    const words = text.split(/\s+/);
    const concepts: string[] = [];

    // Pattern 1: Mots capitalisés (React, Python, Docker)
    const capitalizedWords = words.filter(w => 
      /^[A-Z][a-z]+/.test(w) && w.length > 3
    );
    concepts.push(...capitalizedWords);

    // Pattern 2: Mots entre guillemets
    const quotedTerms = text.match(/"([^"]+)"/g)?.map(q => q.replace(/"/g, '')) || [];
    concepts.push(...quotedTerms);

    // Pattern 3: Termes techniques (contiennent -, _, ou camelCase)
    const technicalTerms = words.filter(w => 
      /[a-z][A-Z]/.test(w) || w.includes('-') || w.includes('_')
    );
    concepts.push(...technicalTerms);

    // Déduplique et limite
    return [...new Set(concepts)].slice(0, 5);
  }

  private detectQuestionType(prompt: string): 'what' | 'how' | 'why' | 'compare' | 'other' {
    const lower = prompt.toLowerCase();
    if (lower.startsWith('what') || lower.includes('qu\'est-ce')) return 'what';
    if (lower.startsWith('how') || lower.includes('comment')) return 'how';
    if (lower.startsWith('why') || lower.includes('pourquoi')) return 'why';
    if (lower.includes('difference') || lower.includes('vs')) return 'compare';
    return 'other';
  }

  private isTheoretical(response: string): boolean {
    // Détecte si la réponse est théorique (pas d'exemples de code)
    const hasCodeExample = /```/.test(response) || /function|class|const/.test(response);
    return !hasCodeExample && response.length > 200;
  }
}

export const followUpPredictor = new FollowUpPredictor();
```

#### 2. Création du Système de Métriques pour le Predictive Caching Intelligent

Un système de tracking des performances du caching prédictif avec boucle de rétroaction adaptative.

```typescript
// src/core/kernel/cache/PredictiveCacheMetrics.ts (Mise à jour)

console.log("📊 PredictiveCacheMetrics initialisé.");

class PredictiveCacheMetrics {
  private predictions: Array<{
    question: string;
    confidence: number;
    timestamp: number;
    wasUsed: boolean;
    timeToUse?: number; // Temps avant utilisation
  }> = [];
  
  private readonly MAX_PREDICTIONS = 1000; // Limite de taille
  private confidenceThreshold = 0.6; // Seuil adaptatif

  public trackPrediction(question: string, confidence: number): void {
    // Garbage collection : retire les anciennes prédictions
    if (this.predictions.length >= this.MAX_PREDICTIONS) {
      this.predictions = this.predictions.slice(this.MAX_PREDICTIONS / 2);
    }
    
    this.predictions.push({
      question,
      confidence,
      timestamp: Date.now(),
      wasUsed: false
    });
  }

  public trackCacheHit(question: string): void {
    const prediction = this.predictions.find(p => 
      this.isSimilar(p.question, question) && !p.wasUsed
    );

    if (prediction) {
      prediction.wasUsed = true;
      prediction.timeToUse = Date.now() - prediction.timestamp;
      console.log(`[Metrics] 🎯 Cache hit ! Utilisé après ${(prediction.timeToUse / 1000).toFixed(1)}s`);
      
      // Met à jour le seuil adaptatif
      this.updateAdaptiveThreshold();
    }
  }

  public getStats(): {
    totalPredictions: number;
    hitRate: number;
    avgConfidence: number;
    avgTimeToUse: number;
    confidenceThreshold: number;
  } {
    const hits = this.predictions.filter(p => p.wasUsed);
    const usedPredictions = hits.filter(p => p.timeToUse !== undefined);

    return {
      totalPredictions: this.predictions.length,
      hitRate: this.predictions.length > 0 ? (hits.length / this.predictions.length) * 100 : 0,
      avgConfidence: this.predictions.length > 0 ? 
        this.predictions.reduce((sum, p) => sum + p.confidence, 0) / this.predictions.length : 0,
      avgTimeToUse: usedPredictions.length > 0 ?
        usedPredictions.reduce((sum, p) => sum + (p.timeToUse || 0), 0) / usedPredictions.length : 0,
      confidenceThreshold: this.confidenceThreshold
    };
  }

  private updateAdaptiveThreshold(): void {
    const stats = this.getStats();
    
    // Ajuste le seuil selon le hit rate
    if (stats.hitRate > 75) {
      // Hit rate élevé : on peut descendre le seuil pour capturer plus de prédictions
      this.confidenceThreshold = Math.max(0.4, this.confidenceThreshold - 0.05);
    } else if (stats.hitRate < 50) {
      // Hit rate faible : on monte le seuil pour être plus sélectif
      this.confidenceThreshold = Math.min(0.8, this.confidenceThreshold + 0.05);
    }
    
    console.log(`[Metrics] Seuil de confiance mis à jour: ${(this.confidenceThreshold * 100).toFixed(0)}%`);
  }

  private isSimilar(q1: string, q2: string): boolean {
    // Détecte si deux questions sont similaires (Levenshtein, cosine similarity, etc.)
    const normalized1 = q1.toLowerCase().replace(/[^\w\s]/g, '');
    const normalized2 = q2.toLowerCase().replace(/[^\w\s]/g, '');
    return normalized1 === normalized2; // Simpliste pour la demo
  }
  
  public getConfidenceThreshold(): number {
    return this.confidenceThreshold;
  }
}

export const cacheMetrics = new PredictiveCacheMetrics();
```

#### 3. Mise à jour du ResponseCache avec TTL, GC et Limites

Amélioration du système de cache avec expiration automatique, garbage collection et limites.

```typescript
// src/core/kernel/cache/ResponseCache.ts (Mise à jour)

interface CacheEntry {
  response: string;
  cachedAt: number;
  ttl: number; // Durée de vie en ms
  metadata?: {
    confidence?: number;
    predictedAt?: number;
  };
}

class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_ENTRIES = 100; // Limite de taille
  private readonly GC_INTERVAL = 60 * 1000; // 1 minute
  private gcTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Lance le garbage collector périodique
    this.startGarbageCollection();
  }

  public set(
    prompt: string, 
    modelKey: string, 
    response: string,
    metadata?: any
  ): void {
    // Garbage collection si nécessaire
    if (this.cache.size >= this.MAX_ENTRIES) {
      this.performGarbageCollection();
    }
    
    const entry: CacheEntry = {
      response,
      cachedAt: Date.now(),
      // ✅ TTL adaptatif : plus la confiance est haute, plus on garde longtemps
      ttl: metadata?.confidence 
        ? this.DEFAULT_TTL * metadata.confidence 
        : this.DEFAULT_TTL,
      metadata
    };

    this.cache.set(this.getCacheKey(prompt, modelKey), entry);
  }

  public get(prompt: string, modelKey?: string): string | null {
    const entry = this.cache.get(this.getCacheKey(prompt, modelKey));
    
    if (!entry) return null;

    // ✅ Vérifie l'expiration
    const age = Date.now() - entry.cachedAt;
    if (age > entry.ttl) {
      console.log(`[Cache] Entry expired (${(age / 1000).toFixed(0)}s old)`);
      this.cache.delete(this.getCacheKey(prompt, modelKey));
      return null;
    }

    return entry.response;
  }

  private getCacheKey(prompt: string, modelKey?: string): string {
    return `${prompt}::${modelKey || 'default'}`;
  }

  private startGarbageCollection(): void {
    this.gcTimer = setInterval(() => {
      this.performGarbageCollection();
    }, this.GC_INTERVAL);
  }

  private performGarbageCollection(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.cachedAt;
      if (age > entry.ttl) {
        this.cache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`[Cache] Garbage collection: ${expiredCount} entrées expirées supprimées`);
    }
    
    // Si trop d'entrées, supprime les plus anciennes (LRU)
    if (this.cache.size > this.MAX_ENTRIES) {
      const entriesToDelete = this.cache.size - this.MAX_ENTRIES;
      const sortedEntries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].cachedAt - b[1].cachedAt)
        .slice(0, entriesToDelete);
      
      for (const [key] of sortedEntries) {
        this.cache.delete(key);
      }
      
      console.log(`[Cache] LRU eviction: ${entriesToDelete} entrées supprimées`);
    }
  }

  public getStats(): { size: number, maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_ENTRIES
    };
  }
}

export const responseCache = new ResponseCache();
```

#### 4. Mise à jour du DialoguePlugin pour le Caching Prédictif Intelligent avec Backpressure

Le DialoguePlugin devient le chef d'orchestre de cette stratégie d'anticipation avec toutes les améliorations.

```typescript
// src/core/plugins/DialoguePlugin.ts (Mise à jour majeure)

import { followUpPredictor } from '../kernel/predictors/FollowUpPredictor';
import { cacheMetrics } from '../kernel/cache/PredictiveCacheMetrics';
// ... (autres imports)

class DialoguePlugin {
  // File de prédictions avec backpressure
  private predictionQueue: Array<{
    question: string;
    confidence: number;
    reasoning: string;
    timestamp: number;
  }> = [];
  
  private readonly MAX_CONCURRENT_PREDICTIONS = 3;
  private readonly MAX_QUEUE_SIZE = 3; // File bornée stricte
  private activePredictions = 0;

  // ... (process et processStream existants)

  /**
   * Orchestre le processus de réponse principal et lance le caching prédictif.
   */
  public async handleUserPrompt(prompt: string): Promise<void> {
    try {
      // Exécute le plan principal pour répondre à la question de l'utilisateur
      const plan = await router.createPlan(prompt);
      const results = await taskExecutor.executePlan(plan);
      const finalResponse = await fusioner.fuse(results);
      const sanitizedResponse = guardrails.sanitizeOutput(finalResponse);
      const watermarkedResponse = watermarkingService.apply(sanitizedResponse);

      // Stream la réponse finale à l'UI
      sseStreamer.streamComplete(watermarkedResponse);
      responseCache.set(prompt, plan.tasks[0].expert, watermarkedResponse);

      // LANCE LE CACHING PRÉDICTIF en arrière-plan
      this.runPredictiveCaching(prompt, watermarkedResponse);

    } catch (error) {
      sseStreamer.streamError(error as Error);
    }
  }

  /**
   * Génère et met en cache les réponses aux questions de suivi probables.
   * C'est une opération "fire-and-forget" de basse priorité avec backpressure.
   */
  private async runPredictiveCaching(originalPrompt: string, originalResponse: string): Promise<void> {
    console.log("[PredictiveCache] Démarrage du caching prédictif...");
    
    // 1. Prédire les questions de suivi avec scoring de confiance
    const predictions = await followUpPredictor.predict(originalPrompt, originalResponse);
    
    // ✅ Ne cache que les questions avec confiance ≥ 0.6
    const threshold = 0.6; // Seuil fixe selon les spécifications
    const worthCaching = predictions.filter(p => p.confidence >= threshold);
    
    if (worthCaching.length === 0) {
      console.log(`[PredictiveCache] Aucune question avec confiance ≥ ${(threshold * 100).toFixed(0)}%`);
      return;
    }

    // 2. Ajoute les prédictions à la file avec backpressure
    for (const { question, confidence, reasoning } of worthCaching) {
      // Gestion de la backpressure stricte
      if (this.predictionQueue.length >= this.MAX_QUEUE_SIZE) {
        console.log("[PredictiveCache] File pleine, suppression des prédictions les plus anciennes (OLDEST)");
        this.predictionQueue.shift(); // Supprime la plus ancienne (stratégie OLDEST)
      }
      
      this.predictionQueue.push({
        question,
        confidence,
        reasoning,
        timestamp: Date.now()
      });
    }
    
    // 3. Traite la file
    this.processPredictionQueue();
  }

  private async processPredictionQueue(): Promise<void> {
    // Backpressure : limite le nombre de prédictions concurrentes
    while (this.activePredictions < this.MAX_CONCURRENT_PREDICTIONS && this.predictionQueue.length > 0) {
      const prediction = this.predictionQueue.shift();
      if (!prediction) continue;
      
      this.activePredictions++;
      
      // Exécute la prédiction en parallèle
      this.executePrediction(prediction)
        .finally(() => {
          this.activePredictions--;
          // Continue à traiter la file
          if (this.predictionQueue.length > 0) {
            this.processPredictionQueue();
          }
        });
    }
  }

  private async executePrediction(prediction: { question: string, confidence: number, reasoning: string, timestamp: number }): Promise<void> {
    const { question, confidence, reasoning } = prediction;
    
    try {
      console.log(`[PredictiveCache] Pré-calcul de la réponse pour: "${question.substring(0, 40)}..."`);
      
      // ✅ Track la prédiction pour les métriques
      cacheMetrics.trackPrediction(question, confidence);
      
      // Crée un plan avec une priorité basse
      const plan = await router.createPlan(question);
      plan.tasks.forEach(t => t.priority = 'BACKGROUND'); // Marque comme tâche de fond
      
      const results = await taskExecutor.executePlan(plan);
      const finalResponse = await fusioner.fuse(results);
      
      // Met en cache la réponse avec métadonnées
      responseCache.set(question, plan.tasks[0].expert, finalResponse, {
        confidence,
        predictedAt: Date.now(),
        reasoning
      });
      
      console.log(`[PredictiveCache] ✅ Réponse pour "${question.substring(0, 40)}..." mise en cache.`);

    } catch (error) {
      console.warn(`[PredictiveCache] Échec du pré-calcul pour une question.`, error);
    }
  }
}

export const dialoguePlugin = new DialoguePlugin();
```

### Résultats Attendus
1. Création du module ResponseCritic avec évaluation structurée multi-dimensionnelle
2. Création du moteur TRMEngine comme moteur central d'auto-correction intégrant génération ET critique
3. Mise à jour du TaskExecutor avec TRM comme moteur central, critique structurée et suivi d'amélioration
4. Implémentation d'une boucle d'itération avec tracking d'amélioration (delta scoring)
5. Architecture modulaire permettant de remplacer les composants factices
6. Amélioration de la qualité des réponses générées avec rapidité quasi-instantanée
7. Contrôle qualité interne avant envoi à l'utilisateur
8. Journalisation des tentatives de correction pour suivi et amélioration
9. Exposition du processus de raisonnement à l'utilisateur via streaming pour transparence
10. Intégration optimale avec TRM pour une correction ultra-rapide (96ms vs plusieurs secondes)
11. Utilisation du critique structuré comme backstop ou pour audit externe
12. Implémentation de prompts structurés avec balises XML pour un guidage précis
13. Mode "explain reasoning" pour traces de raisonnement à des usages avancés
14. Création du module FollowUpPredictor pour la prédiction contextuelle des questions de suivi
15. Mise à jour du DialoguePlugin pour orchestrer le caching prédictif intelligent
16. Exécution en arrière-plan des réponses aux questions de suivi probables avec scoring de confiance
17. Stockage des réponses prédites dans le cache avec TTL adaptatif
18. Système de métriques pour le tracking du hit rate et de la performance
19. Filtrage des prédictions par seuil de confiance fixe (≥ 0.6)
20. Métadonnées enrichies pour chaque entrée de cache
21. Garbage collection périodique pour maintenir le cache sain
22. Limites de taille avec stratégie LRU pour éviter la saturation mémoire
23. Backpressure stricte avec file bornée (3 max) et stratégie OLDEST
24. Boucle de rétroaction adaptative qui ajuste le seuil de confiance selon les performances
25. Suggestions UI branchées sur le même prédicteur pour affichage des follow-ups