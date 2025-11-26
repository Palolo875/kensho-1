import { IntentCategory, ClassificationResult, ClassificationError } from './RouterTypes';
import { modelManager } from '../kernel/ModelManager';
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

  private async classifyWithLLM(query: string): Promise<ClassificationResult> {
    try {
      const engine = await modelManager.getEngine();
      
      const CLASSIFICATION_PROMPT = `Classifie cette requête utilisateur dans UNE SEULE catégorie :

CODE : Questions sur la programmation, le code, les bugs, les algorithmes
MATH : Questions sur les mathématiques, calculs, équations
FACTCHECK : Demandes de vérification de faits ou d'informations
DIALOGUE : Conversations générales, questions ouvertes, discussions

Requête : "${query}"

Réponds UNIQUEMENT avec l'une de ces catégories : CODE, MATH, FACTCHECK, DIALOGUE`;

      const response = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: 'Tu es un classificateur d\'intentions. Réponds avec un seul mot : CODE, MATH, FACTCHECK, ou DIALOGUE.' },
          { role: 'user', content: CLASSIFICATION_PROMPT }
        ],
        stream: false,
        temperature: 0.1,
        max_tokens: 10
      });

      const rawText = (response as any).choices?.[0]?.message?.content?.trim().toUpperCase() || '';
      
      const validCategories: IntentCategory[] = ['CODE', 'MATH', 'FACTCHECK', 'DIALOGUE'];
      const intent = validCategories.find(cat => rawText.includes(cat));
      
      if (!intent) {
        throw new ClassificationError(
          `Réponse LLM invalide : "${rawText}". Attendu : CODE, MATH, FACTCHECK, ou DIALOGUE.`,
          rawText
        );
      }

      return {
        intent,
        confidence: 0.85,
        method: 'llm'
      };

    } catch (error) {
      if (error instanceof ClassificationError) {
        throw error;
      }
      throw new ClassificationError(
        `Échec de la classification LLM : ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
        undefined
      );
    }
  }

  public async classify(query: string): Promise<ClassificationResult> {
    const keywordResult = this.classifyByKeywords(query);
    
    if (keywordResult && keywordResult.confidence >= 0.6) {
      log.info(`Classification par mots-clés : ${keywordResult.intent} (conf: ${keywordResult.confidence})`);
      return keywordResult;
    }

    log.info('Fallback vers classification LLM...');
    return this.classifyWithLLM(query);
  }
}

export const intentClassifier = new IntentClassifier();
