/**
 * FeedbackLearner - Framework pour apprendre du feedback utilisateur
 * 
 * Ajuste dynamiquement:
 * - Seuil MetaCritic (actuellement 40, peut changer)
 * - Weights des agents
 * - Longueur des prompts
 */

export interface LearningWeights {
  metaCriticThreshold: number; // Actuellement 40, peut devenir 35-50
  optimistWeight: number;
  criticWeight: number;
  synthesisWeight: number;
}

export class FeedbackLearner {
  private weights: LearningWeights = {
    metaCriticThreshold: 40,
    optimistWeight: 1.0,
    criticWeight: 1.0,
    synthesisWeight: 1.0
  };

  private feedbackHistory: Array<{
    userRating: number; // 1-5
    metaCriticScore: number;
    wasDegradation: boolean;
    timestamp: number;
  }> = [];

  /**
   * Record feedback et auto-adjust seuil MetaCritic
   */
  recordFeedback(
    userRating: number,
    metaCriticScore: number,
    wasDegradation: boolean
  ): void {
    this.feedbackHistory.push({
      userRating,
      metaCriticScore,
      wasDegradation,
      timestamp: Date.now()
    });

    // Auto-tune threshold
    this.autoTuneMetaCriticThreshold();
  }

  /**
   * Ajuste le seuil MetaCritic basé sur feedback
   * 
   * Logique:
   * - Si score < seuil ET user aime → threshold trop haut, baisser
   * - Si score >= seuil ET user n'aime pas → threshold trop bas, augmenter
   */
  private autoTuneMetaCriticThreshold(): void {
    const recent = this.feedbackHistory.slice(-10); // 10 derniers
    
    if (recent.length < 5) return; // Pas assez de données

    let adjustments = 0;
    for (const feedback of recent) {
      const userLiked = feedback.userRating >= 4;
      const scoreWasLow = feedback.metaCriticScore < this.weights.metaCriticThreshold;

      // Cas 1: Score bas mais user a aimé (false positive de degradation)
      if (scoreWasLow && userLiked) {
        adjustments -= 1; // Threshold trop haut
      }

      // Cas 2: Score haut mais user n'a pas aimé (false negative)
      if (!scoreWasLow && !userLiked) {
        adjustments += 1; // Threshold trop bas
      }
    }

    // Appliquer ajustements (graduel, max ±5 par cycle)
    const adjustment = Math.max(-5, Math.min(5, adjustments));
    this.weights.metaCriticThreshold = Math.max(20, Math.min(60, 
      this.weights.metaCriticThreshold + adjustment
    ));
  }

  /**
   * Get current weights
   */
  getWeights(): LearningWeights {
    return { ...this.weights };
  }

  /**
   * Set weights manuellement (si admin veut override)
   */
  setWeights(weights: Partial<LearningWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  /**
   * Get learning summary
   */
  getSummary() {
    const avg = this.feedbackHistory.length > 0
      ? this.feedbackHistory.reduce((sum, f) => sum + f.userRating, 0) / this.feedbackHistory.length
      : 0;

    return {
      feedbackCount: this.feedbackHistory.length,
      averageRating: avg,
      currentThreshold: this.weights.metaCriticThreshold,
      trend: this.feedbackHistory.length >= 2
        ? this.feedbackHistory[this.feedbackHistory.length - 1].userRating -
          this.feedbackHistory[this.feedbackHistory.length - 2].userRating
        : 0
    };
  }
}

// Singleton
export const feedbackLearner = new FeedbackLearner();
