/**
 * DebateMetrics - Monitoring et analytics pour le système de débat
 * 
 * Tracks:
 * - MetaCriticAgent accuracy (quand degradation est-elle correcte?)
 * - Latency par étape
 * - Feedback utilisateur vs score réel
 * - Patterns de mauvaises critiques
 */

export interface MetaCriticScore {
  queryId: string;
  score: number; // 0-100
  wasDegradationApplied: boolean;
  userFeedbackRating?: number; // 1-5 stars
  userFeedbackComment?: string;
  timestamp: number;
}

export interface StepLatency {
  agent: string;
  action: string;
  duration: number; // ms
  timestamp: number;
}

export class DebateMetrics {
  private metaCriticScores: MetaCriticScore[] = [];
  private stepLatencies: StepLatency[] = [];
  private feedbackStore: Map<string, MetaCriticScore> = new Map();

  /**
   * Enregistre un score MetaCritic et si degradation a été appliquée
   */
  recordMetaCriticScore(
    queryId: string,
    score: number,
    wasDegradationApplied: boolean
  ): void {
    const record: MetaCriticScore = {
      queryId,
      score,
      wasDegradationApplied,
      timestamp: Date.now()
    };
    this.metaCriticScores.push(record);
    this.feedbackStore.set(queryId, record);
  }

  /**
   * Enregistre le feedback utilisateur pour une requête
   */
  recordUserFeedback(
    queryId: string,
    rating: number,
    comment?: string
  ): void {
    const existing = this.feedbackStore.get(queryId);
    if (existing) {
      existing.userFeedbackRating = rating;
      existing.userFeedbackComment = comment;
    }
  }

  /**
   * Enregistre la latence d'une étape
   */
  recordStepLatency(agent: string, action: string, duration: number): void {
    this.stepLatencies.push({
      agent,
      action,
      duration,
      timestamp: Date.now()
    });
  }

  /**
   * Calcule la précision du MetaCriticAgent
   * = % de fois où sa décision était correcte (basée sur feedback)
   */
  getMetaCriticAccuracy(): number {
    const withFeedback = Array.from(this.feedbackStore.values()).filter(
      m => m.userFeedbackRating !== undefined
    );

    if (withFeedback.length === 0) return 0;

    // Heuristique: 
    // - Si score < 40 et user rate 5/5 → mauvaise décision (false positive)
    // - Si score >= 40 et user rate 1-2/5 → mauvaise décision (false negative)
    const correctDecisions = withFeedback.filter(m => {
      const lowScore = m.score < 40;
      const userLiked = (m.userFeedbackRating ?? 0) >= 4;

      // Décision correcte = (lowScore ET userDisliked) OR (highScore ET userLiked)
      return (lowScore && !userLiked) || (!lowScore && userLiked);
    }).length;

    return (correctDecisions / withFeedback.length) * 100;
  }

  /**
   * Calcule latence moyenne par étape
   */
  getAverageLatency(agent?: string, action?: string): number {
    let relevant = this.stepLatencies;

    if (agent) {
      relevant = relevant.filter(s => s.agent === agent);
    }
    if (action) {
      relevant = relevant.filter(s => s.action === action);
    }

    if (relevant.length === 0) return 0;

    const total = relevant.reduce((sum, s) => sum + s.duration, 0);
    return total / relevant.length;
  }

  /**
   * Latence totale estimée pour débat complet (4 étapes)
   */
  getTotalDebateLatency(): number {
    // Optimist + Critic (parallèles) + MetaCritic + Synthesis
    const optimistLatency = this.getAverageLatency('OptimistAgent');
    const criticLatency = this.getAverageLatency('CriticAgent');
    const metaCriticLatency = this.getAverageLatency('MetaCriticAgent');
    const synthesisLatency = this.getAverageLatency('MainLLMAgent', 'synthesizeDebate');

    // Optimist et Critic parallèles = max(optimist, critic)
    const parallelLatency = Math.max(optimistLatency, criticLatency);

    return parallelLatency + metaCriticLatency + synthesisLatency;
  }

  /**
   * Get patterns: quand MetaCritic score est-il bas? 
   */
  getLowScorePatterns(): { queryType?: string; frequency: number } {
    const lowScores = this.metaCriticScores.filter(m => m.score < 40);
    return {
      frequency: lowScores.length / Math.max(this.metaCriticScores.length, 1)
    };
  }

  /**
   * Export des métriques pour monitoring externe
   */
  export() {
    return {
      metaCriticAccuracy: this.getMetaCriticAccuracy(),
      averageDebateLatency: this.getTotalDebateLatency(),
      totalQueries: this.metaCriticScores.length,
      lowScoreFrequency: this.getLowScorePatterns().frequency,
      stepLatencies: {
        optimist: this.getAverageLatency('OptimistAgent'),
        critic: this.getAverageLatency('CriticAgent'),
        metaCritic: this.getAverageLatency('MetaCriticAgent'),
        synthesis: this.getAverageLatency('MainLLMAgent')
      },
      feedbackCount: Array.from(this.feedbackStore.values()).filter(
        m => m.userFeedbackRating !== undefined
      ).length
    };
  }
}

// Singleton pour tracking global
export const debateMetrics = new DebateMetrics();
