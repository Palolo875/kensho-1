/**
 * Fusioner v2.0 - Fusion Intelligente des Résultats Multi-Agents
 * 
 * Stratégies de fusion:
 * 1. COMPLEMENTARY: Ajouter les informations manquantes des experts
 * 2. CONFLICT_RESOLUTION: Détecter et résoudre les contradictions
 * 3. QUALITY_SYNTHESIS: Choisir la meilleure réponse selon qualité
 * 4. ENRICHMENT: Améliorer la réponse primaire avec contexte expert
 */

import { TaskResult } from '../router/RouterTypes';

interface FusionInput {
  primaryResult: TaskResult;
  expertResults: TaskResult[];
}

interface FusionMetadata {
  strategy: string;
  sources: string[];
  confidence: number;
  quality: number;
}

export class Fusioner {
  /**
   * Fusionne intelligemment les résultats
   */
  public async fuse(input: FusionInput): Promise<string> {
    console.log(`[Fusioner] 🔀 Fusion: 1 primaire + ${input.expertResults.length} expert(s)`);

    // Si pas d'experts, retourner le résultat primaire
    if (input.expertResults.length === 0 || input.primaryResult.status !== 'success') {
      return input.primaryResult.result || '';
    }

    const successfulExperts = input.expertResults.filter(r => r.status === 'success');
    if (successfulExperts.length === 0) {
      return input.primaryResult.result || '';
    }

    // Déterminer la stratégie optimale
    const strategy = this.determineStrategy(input.primaryResult, successfulExperts);

    // Appliquer la fusion selon la stratégie
    const fused = await this.applyStrategy(strategy, input.primaryResult, successfulExperts);

    console.log(`[Fusioner] ✅ Stratégie appliquée: ${strategy.strategy}`);

    return fused.content;
  }

  /**
   * Fusionne avec métadonnées complètes
   */
  public async fuseWithMetadata(input: FusionInput): Promise<{
    content: string;
    metadata: FusionMetadata;
  }> {
    const content = await this.fuse(input);
    const metadata = this.extractMetadata(input);

    return { content, metadata };
  }

  /**
   * Détermine la meilleure stratégie de fusion
   */
  private determineStrategy(
    primaryResult: TaskResult,
    expertResults: TaskResult[]
  ): {
    strategy: string;
    experts: TaskResult[];
  } {
    const intentHints = this.detectIntentFromAgents(expertResults);

    // FACTCHECK: Utiliser experts comme validators
    if (
      primaryResult.agentName.includes('FactChecker') ||
      expertResults.some(e => e.agentName.includes('Verifier'))
    ) {
      return {
        strategy: 'CONFLICT_RESOLUTION',
        experts: expertResults
      };
    }

    // CODE/MATH: Utiliser experts comme reviewers
    if (
      primaryResult.agentName.includes('CodeExpert') ||
      primaryResult.agentName.includes('Calculator')
    ) {
      return {
        strategy: 'COMPLEMENTARY',
        experts: expertResults
      };
    }

    // DIALOGUE: Synthétiser plusieurs perspectives
    if (expertResults.length >= 2) {
      return {
        strategy: 'ENRICHMENT',
        experts: expertResults
      };
    }

    // Default: Enrichissement
    return {
      strategy: 'ENRICHMENT',
      experts: expertResults.slice(0, 2)
    };
  }

  /**
   * Applique la stratégie de fusion choisie
   */
  private async applyStrategy(
    { strategy, experts }: ReturnType<typeof Fusioner.prototype.determineStrategy>,
    primaryResult: TaskResult,
    expertResults: TaskResult[]
  ): Promise<{ content: string; confidence: number }> {
    switch (strategy) {
      case 'COMPLEMENTARY':
        return this.complementaryFusion(primaryResult, experts);

      case 'CONFLICT_RESOLUTION':
        return this.conflictResolution(primaryResult, experts);

      case 'QUALITY_SYNTHESIS':
        return this.qualitySynthesis(primaryResult, experts);

      case 'ENRICHMENT':
        return this.enrichmentFusion(primaryResult, experts);

      default:
        return {
          content: primaryResult.result || '',
          confidence: 0.8
        };
    }
  }

  /**
   * COMPLEMENTARY: Ajouter infos manquantes des experts
   */
  private complementaryFusion(
    primaryResult: TaskResult,
    experts: TaskResult[]
  ): { content: string; confidence: number } {
    const primaryLength = primaryResult.result?.length || 0;
    const expertAdditions = experts
      .map(e => e.result || '')
      .filter(r => r.length > 0)
      .join('\n\n---\n\n');

    let content = primaryResult.result || '';

    // Ajouter les infos complémentaires si elles sont significatives
    if (expertAdditions.length > primaryLength * 0.2) {
      content += `\n\n## Perspectives additionnelles:\n${expertAdditions}`;
    }

    const confidence = Math.min(0.95, 0.8 + experts.length * 0.05);

    return { content, confidence };
  }

  /**
   * CONFLICT_RESOLUTION: Détecter et résoudre contradictions
   */
  private conflictResolution(
    primaryResult: TaskResult,
    experts: TaskResult[]
  ): { content: string; confidence: number } {
    const conflictScore = this.detectConflicts(primaryResult.result || '', experts);

    let content = primaryResult.result || '';
    let confidence = 0.8;

    if (conflictScore.hasConflicts) {
      // En cas de conflit détecté, marquer comme ambigu
      content = `⚠️ **Réponse ambiguë détectée**\n\nRéponse primaire:\n${content}\n\nNotes des experts:\n`;

      for (const expert of experts) {
        if (expert.result) {
          content += `- ${expert.agentName}: ${expert.result.substring(0, 100)}...\n`;
        }
      }

      confidence = 0.5; // Confiance réduite en cas de conflits
    }

    return { content, confidence };
  }

  /**
   * QUALITY_SYNTHESIS: Choisir la meilleure réponse
   */
  private qualitySynthesis(
    primaryResult: TaskResult,
    experts: TaskResult[]
  ): { content: string; confidence: number } {
    let bestResult = primaryResult;
    let bestScore = this.scoreQuality(primaryResult);

    for (const expert of experts) {
      const score = this.scoreQuality(expert);
      if (score > bestScore) {
        bestScore = score;
        bestResult = expert;
      }
    }

    const confidence = bestScore;

    return {
      content: bestResult.result || '',
      confidence
    };
  }

  /**
   * ENRICHMENT: Améliorer la réponse avec contexte expert
   */
  private enrichmentFusion(
    primaryResult: TaskResult,
    experts: TaskResult[]
  ): { content: string; confidence: number } {
    let content = primaryResult.result || '';
    const sources: string[] = [primaryResult.agentName];

    // Ajouter les perspectives des experts de manière structurée
    for (const expert of experts) {
      if (expert.result && expert.result.length > 0) {
        sources.push(expert.agentName);
        content += `\n\n### Perspective de ${expert.agentName}:\n${expert.result}`;
      }
    }

    const confidence = Math.min(0.95, 0.7 + sources.length * 0.08);

    return { content, confidence };
  }

  /**
   * Détecte les conflits entre réponses
   */
  private detectConflicts(
    primaryContent: string,
    experts: TaskResult[]
  ): { hasConflicts: boolean; conflictCount: number } {
    const primaryTokens = this.tokenize(primaryContent);

    let conflictCount = 0;

    for (const expert of experts) {
      if (!expert.result) continue;

      const expertTokens = this.tokenize(expert.result);
      const similarity = this.calculateSimilarity(primaryTokens, expertTokens);

      // Si la similarité est très basse, c'est possiblement un conflit
      if (similarity < 0.3) {
        conflictCount++;
      }
    }

    return {
      hasConflicts: conflictCount > 0,
      conflictCount
    };
  }

  /**
   * Score la qualité d'une réponse
   */
  private scoreQuality(result: TaskResult): number {
    let score = 0.5; // Score de base

    // Facteurs positifs
    if (result.status === 'success') score += 0.2;
    if (result.result && result.result.length > 100) score += 0.1; // Réponse détaillée
    if (result.confidence && result.confidence > 0.8) score += 0.1;
    if (result.duration && result.duration < 5000) score += 0.05; // Réponse rapide

    // Facteurs négatifs
    if (result.status === 'timeout') score -= 0.2;
    if (result.error) score -= 0.15;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Détecte l'intention à partir des noms d'agents
   */
  private detectIntentFromAgents(experts: TaskResult[]): string {
    const agentNames = experts.map(e => e.agentName.toLowerCase()).join(' ');

    if (agentNames.includes('verif') || agentNames.includes('fact')) return 'FACTCHECK';
    if (agentNames.includes('code')) return 'CODE';
    if (agentNames.includes('math') || agentNames.includes('calc')) return 'MATH';
    if (agentNames.includes('dialogue') || agentNames.includes('general')) return 'DIALOGUE';

    return 'UNKNOWN';
  }

  /**
   * Utilitaires
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private calculateSimilarity(tokens1: string[], tokens2: string[]): number {
    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = [...set1].filter(t => set2.has(t)).length;
    const union = new Set([...set1, ...set2]).size;

    return union > 0 ? intersection / union : 0;
  }

  private extractMetadata(input: FusionInput): FusionMetadata {
    const sources = [
      input.primaryResult.agentName,
      ...input.expertResults
        .filter(r => r.status === 'success')
        .map(r => r.agentName)
    ];

    const avgConfidence =
      (input.primaryResult.confidence || 0.8 +
        input.expertResults
          .filter(r => r.status === 'success')
          .reduce((sum, r) => sum + (r.confidence || 0.7), 0)) /
      (input.expertResults.filter(r => r.status === 'success').length + 1);

    return {
      strategy: 'multi-agent-fusion',
      sources,
      confidence: avgConfidence,
      quality: this.scoreQuality(input.primaryResult)
    };
  }
}

// Instance singleton exportée
export const fusioner = new Fusioner();
