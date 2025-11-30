/**
 * Fusioner v3.0 - Fusion Intelligente et Unifiée des Résultats Multi-Agents
 *
 * ✨ NOUVELLES FEATURES:
 * - API unifiée: fuseUnified(results[]) pour N agents égaux
 * - Stratégies: COMPLEMENTARY, CONFLICT_RESOLUTION, QUALITY_SYNTHESIS, ENRICHMENT, CONSENSUS, PRIORITY
 * - Mock Harmonizer par spécialité (CODE, DIALOGUE, MATH)
 * - Détection avancée de contradictions
 * - Métadonnées enrichies (tokens, timestamp, confidence)
 */

import { TaskResult } from '../router/RouterTypes';
import { createLogger } from '../../lib/logger';

const log = createLogger('Fusioner');

/**
 * Résultat unifié d'un agent (primaire ou expert)
 */
export interface UnifiedTaskResult {
  agentName: string;
  content: string;
  status: 'success' | 'error' | 'timeout';
  confidence?: number;
  tokens?: number;
  timestamp?: number;
  error?: string;
  specialty?: 'CODE' | 'DIALOGUE' | 'MATH' | 'GENERAL';
}

/**
 * Résultat de fusion avec métadonnées complètes
 */
export interface FusionOutput {
  content: string;
  sources: string[];
  confidence: number;
  strategy: string;
  conflicts: number;
  tokensUsed: number;
  timestamp: number;
}

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

/**
 * Mock Harmonizer - Simule la synthèse par spécialité
 */
class MockHarmonizer {
  synthesizeCode(primary: string, expertResults: UnifiedTaskResult[]): string {
    let result = primary;
    
    // Extraction d'insights critiques
    const securityIssues = expertResults
      .filter(e => e.content.toLowerCase().includes('security') || e.content.toLowerCase().includes('xss'))
      .map(e => `🔒 ${e.content.split('\n')[0]}`)
      .slice(0, 2);
    
    const perfTips = expertResults
      .filter(e => e.content.toLowerCase().includes('performance') || e.content.toLowerCase().includes('o(n'))
      .map(e => `⚡ ${e.content.split('\n')[0]}`)
      .slice(0, 2);
    
    if (securityIssues.length > 0) {
      result += `\n\n**Sécurité:**\n${securityIssues.join('\n')}`;
    }
    
    if (perfTips.length > 0) {
      result += `\n\n**Performance:**\n${perfTips.join('\n')}`;
    }
    
    return result;
  }

  synthesizeDialogue(primary: string, _expertResults: UnifiedTaskResult[]): string {
    // Dialogue passe-through, déjà optimisé
    return primary;
  }

  synthesizeMath(primary: string, expertResults: UnifiedTaskResult[]): string {
    let result = primary;
    
    const altMethods = expertResults
      .filter(e => e.content.toLowerCase().includes('method') || e.content.toLowerCase().includes('alternative'))
      .slice(0, 1);
    
    if (altMethods.length > 0) {
      result += `\n\n**Méthode Alternative:**\n${altMethods[0].content.substring(0, 100)}...`;
    }
    
    return result;
  }
}

export class Fusioner {
  private harmonizer = new MockHarmonizer();

  /**
   * API UNIFIÉE: Fusionne N résultats d'agents (NOUVEAU)
   * Permet de traiter primaryResult et expertResults de manière homogène
   */
  public async fuseUnified(results: UnifiedTaskResult[]): Promise<FusionOutput> {
    if (results.length === 0) {
      return {
        content: 'Aucun résultat disponible.',
        sources: [],
        confidence: 0,
        strategy: 'NONE',
        conflicts: 0,
        tokensUsed: 0,
        timestamp: Date.now()
      };
    }

    log.info(`🔀 Fusion Unifiée: ${results.length} agent(s)`);

    // Filtrer les résultats réussis
    const successful = results.filter(r => r.status === 'success');
    
    if (successful.length === 0) {
      return {
        content: 'Tous les agents ont échoué. Veuillez réessayer.',
        sources: results.map(r => r.agentName),
        confidence: 0,
        strategy: 'FAILURE',
        conflicts: 0,
        tokensUsed: 0,
        timestamp: Date.now()
      };
    }

    // Détecter les contradictions
    const conflicts = this.detectContradictions(successful);
    
    // Déterminer la stratégie optimale
    const strategy = this.determineUnifiedStrategy(successful, conflicts);
    
    // Appliquer la fusion
    const content = await this.applyUnifiedStrategy(strategy, successful);
    
    const tokensUsed = successful.reduce((sum, r) => sum + (r.tokens || 0), 0);
    const avgConfidence = successful.reduce((sum, r) => sum + (r.confidence || 0.8), 0) / successful.length;

    log.info(`✅ Stratégie appliquée: ${strategy} (${conflicts.count} conflits détectés)`);

    return {
      content,
      sources: successful.map(r => r.agentName),
      confidence: avgConfidence,
      strategy,
      conflicts: conflicts.count,
      tokensUsed,
      timestamp: Date.now()
    };
  }

  /**
   * Fusionne les résultats de manière intelligente (ANCIEN API - compatibilité)
   */
  public async fuse(input: FusionInput): Promise<string> {
    log.info(`🔀 Fusion: 1 primaire + ${input.expertResults.length} expert(s)`);

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

    log.info(`✅ Stratégie appliquée: ${strategy.strategy}`);

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
   * NOUVEAU: Détecte les contradictions de manière avancée
   */
  private detectContradictions(results: UnifiedTaskResult[]): {
    count: number;
    details: Array<{ agent1: string; agent2: string; similarity: number }>;
  } {
    const details: Array<{ agent1: string; agent2: string; similarity: number }> = [];
    let conflictCount = 0;

    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const r1 = results[i];
        const r2 = results[j];
        
        const similarity = this.calculateSimilarity(
          this.tokenize(r1.content),
          this.tokenize(r2.content)
        );

        // Si similarité < 0.4, c'est une possible contradiction
        if (similarity < 0.4) {
          conflictCount++;
          details.push({
            agent1: r1.agentName,
            agent2: r2.agentName,
            similarity
          });
        }
      }
    }

    return { count: conflictCount, details };
  }

  /**
   * NOUVEAU: Détermine la stratégie pour API unifiée
   */
  private determineUnifiedStrategy(
    results: UnifiedTaskResult[],
    conflicts: ReturnType<typeof Fusioner.prototype.detectContradictions>
  ): string {
    // Si consensus fort (>80% similarité moyenne)
    if (conflicts.count === 0) {
      return 'CONSENSUS';
    }

    // Si conflits détectés
    if (conflicts.count > 0) {
      return 'CONFLICT_RESOLUTION';
    }

    // Si spécialités diverses
    const specialties = new Set(results.map(r => r.specialty || 'GENERAL'));
    if (specialties.size > 1) {
      return 'ENRICHMENT';
    }

    // Défaut
    return 'PRIORITY';
  }

  /**
   * NOUVEAU: Applique stratégie pour API unifiée
   */
  private async applyUnifiedStrategy(
    strategy: string,
    results: UnifiedTaskResult[]
  ): Promise<string> {
    switch (strategy) {
      case 'CONSENSUS':
        return results[0].content; // Tous d'accord, prendre le premier

      case 'CONFLICT_RESOLUTION':
        // Ajouter un avertissement + toutes les perspectives
        return `⚠️ **Perspectives variées:**\n\n${results
          .map(r => `**${r.agentName}:**\n${r.content}`)
          .join('\n\n---\n\n')}`;

      case 'PRIORITY':
        // Synthèse par spécialité
        const specialty = results[0].specialty || 'GENERAL';
        return this.synthesizeBySpecialty(specialty, results[0], results.slice(1));

      case 'ENRICHMENT':
      default:
        return `${results[0].content}\n\n${results
          .slice(1)
          .map(r => `**${r.agentName}:** ${r.content.substring(0, 80)}...`)
          .join('\n\n')}`;
    }
  }

  /**
   * NOUVEAU: Synthèse par spécialité (Mock Harmonizer)
   */
  private synthesizeBySpecialty(
    specialty: string,
    primary: UnifiedTaskResult,
    experts: UnifiedTaskResult[]
  ): string {
    switch (specialty) {
      case 'CODE':
        return this.harmonizer.synthesizeCode(primary.content, experts);
      case 'DIALOGUE':
        return this.harmonizer.synthesizeDialogue(primary.content, experts);
      case 'MATH':
        return this.harmonizer.synthesizeMath(primary.content, experts);
      default:
        return primary.content;
    }
  }

  /**
   * Détermine la meilleure stratégie de fusion (ANCIEN - compatibilité)
   */
  private determineStrategy(
    primaryResult: TaskResult,
    expertResults: TaskResult[]
  ): {
    strategy: string;
    experts: TaskResult[];
  } {
    // Detect intent for potential future use in strategy selection
    this.detectIntentFromAgents(expertResults);

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
   * Applique la stratégie de fusion choisie (ANCIEN - compatibilité)
   */
  private async applyStrategy(
    { strategy, experts }: ReturnType<typeof Fusioner.prototype.determineStrategy>,
    primaryResult: TaskResult,
    _expertResults: TaskResult[]
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
   * Détecte les conflits entre réponses (ANCIEN - compatibilité)
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
   * Utilitaires de tokenization et similarité
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
