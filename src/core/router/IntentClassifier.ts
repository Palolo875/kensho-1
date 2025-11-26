import { IntentCategory, ClassificationResult } from './RouterTypes';
import { createLogger } from '../../lib/logger';

const log = createLogger('IntentClassifier');

const KEYWORDS_MAP: Record<IntentCategory, string[]> = {
  CODE: [
    'code', 'coder', 'programming', 'programmer', 'debug', 'debugger',
    'function', 'fonction', 'class', 'classe', 'variable', 'algorithm', 'algorithme',
    'syntax', 'syntaxe', 'error', 'erreur', 'bug', 'compile', 'compiler',
    'import', 'export', 'api', 'typescript', 'javascript', 'python', 'rust'
  ],
  MATH: [
    'calculate', 'calculer', 'calcul', 'mathématique', 'math', 'equation', 'équation',
    'solve', 'résoudre', 'proof', 'preuve', 'theorem', 'théorème',
    'integral', 'intégrale', 'derivative', 'dérivée', 'matrix', 'matrice',
    'addition', 'soustraction', 'multiplication', 'division'
  ],
  FACTCHECK: [
    'verify', 'vérifier', 'fact', 'fait', 'true', 'vrai', 'false', 'faux',
    'check', 'source', 'evidence', 'preuve', 'claim', 'affirmation'
  ],
  DIALOGUE: [],
  UNKNOWN: []
};

export class IntentClassifier {
  
  private normalizeString(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private classifyByKeywords(query: string): ClassificationResult | null {
    const normalized = this.normalizeString(query);
    const scores: Record<IntentCategory, number> = {
      CODE: 0,
      MATH: 0,
      FACTCHECK: 0,
      DIALOGUE: 0,
      UNKNOWN: 0
    };

    for (const [category, keywords] of Object.entries(KEYWORDS_MAP)) {
      for (const keyword of keywords) {
        if (normalized.includes(this.normalizeString(keyword))) {
          scores[category as IntentCategory] += 1;
        }
      }
    }

    const maxScore = Math.max(...Object.values(scores));
    
    if (maxScore >= 2) {
      const intent = Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] as IntentCategory;
      return {
        intent,
        confidence: Math.min(maxScore / 5, 1.0),
        method: 'keywords'
      };
    }

    return null;
  }

  public async classify(query: string): Promise<ClassificationResult> {
    const keywordResult = this.classifyByKeywords(query);
    
    if (keywordResult && keywordResult.confidence >= 0.6) {
      log.info(`Classification par mots-clés : ${keywordResult.intent} (conf: ${keywordResult.confidence})`);
      return keywordResult;
    }

    log.info('Fallback vers classification DIALOGUE (mode simulation)');
    return {
      intent: 'DIALOGUE',
      confidence: 0.5,
      method: 'fallback'
    };
  }
}

export const intentClassifier = new IntentClassifier();
