import { IntentCategory, ClassificationResult } from './RouterTypes';
import { createLogger } from '../../lib/logger';

const log = createLogger('IntentClassifier');

/**
 * Structure pour les entrées du cache de classification
 */
interface ClassificationCacheEntry {
  result: ClassificationResult;
  timestamp: number;
  queryHash: string;
}

/**
 * Configuration du cache
 */
interface CacheConfig {
  maxSize: number;
  ttlMs: number;
}

/**
 * Mots-clés multilingues pour la classification
 * Supporte: Français, Anglais, Espagnol, Allemand, Italien, Portugais
 */
const KEYWORDS_MAP: Record<IntentCategory, string[]> = {
  CODE: [
    // Anglais
    'code', 'coding', 'programming', 'programmer', 'debug', 'debugger', 'debugging',
    'function', 'class', 'variable', 'algorithm', 'syntax', 'error', 'bug', 'bugs',
    'compile', 'compiler', 'compiling', 'import', 'export', 'api', 'apis',
    'typescript', 'javascript', 'python', 'rust', 'java', 'c++', 'golang', 'go',
    'react', 'vue', 'angular', 'node', 'nodejs', 'npm', 'yarn', 'webpack',
    'html', 'css', 'scss', 'sass', 'frontend', 'backend', 'fullstack',
    'database', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql',
    'git', 'github', 'gitlab', 'branch', 'merge', 'commit', 'pull request',
    'refactor', 'refactoring', 'optimize', 'optimization', 'performance',
    'test', 'testing', 'unit test', 'integration test', 'e2e',
    'script', 'scripting', 'automation', 'automate',
    'library', 'framework', 'module', 'package', 'dependency',
    'async', 'await', 'promise', 'callback', 'event', 'listener',
    'loop', 'array', 'object', 'string', 'number', 'boolean',
    'if', 'else', 'switch', 'case', 'try', 'catch', 'throw',
    'implement', 'implementation', 'develop', 'developer', 'development',
    // Français
    'coder', 'programmer', 'programmation', 'développer', 'développement',
    'fonction', 'classe', 'algorithme', 'syntaxe', 'erreur', 'bogue',
    'compiler', 'compilation', 'importer', 'exporter',
    'base de données', 'tester', 'automatiser', 'automatisation',
    'bibliothèque', 'dépendance', 'boucle', 'tableau', 'chaîne',
    'implémenter', 'implémentation', 'développeur',
    // Espagnol
    'código', 'programación', 'programar', 'desarrollar', 'desarrollo',
    'función', 'clase', 'variable', 'algoritmo', 'sintaxis',
    'error', 'compilar', 'importar', 'exportar',
    'base de datos', 'probar', 'automatizar',
    'biblioteca', 'dependencia', 'bucle', 'matriz', 'cadena',
    'implementar', 'implementación', 'desarrollador',
    // Allemand
    'programmieren', 'programmierung', 'entwickeln', 'entwicklung',
    'funktion', 'klasse', 'algorithmus', 'fehler',
    'kompilieren', 'importieren', 'exportieren',
    'datenbank', 'testen', 'automatisieren',
    'bibliothek', 'abhängigkeit', 'schleife', 'zeichenkette',
    'implementieren', 'implementierung', 'entwickler',
  ],
  MATH: [
    // Anglais
    'calculate', 'calculation', 'calculator', 'compute', 'computation',
    'math', 'mathematics', 'mathematical', 'maths',
    'equation', 'equations', 'solve', 'solving', 'solution',
    'proof', 'prove', 'theorem', 'lemma', 'corollary',
    'integral', 'integrate', 'integration', 'derivative', 'differentiate', 'differentiation',
    'matrix', 'matrices', 'vector', 'vectors', 'tensor',
    'addition', 'add', 'subtraction', 'subtract', 'multiplication', 'multiply',
    'division', 'divide', 'modulo', 'remainder',
    'algebra', 'algebraic', 'geometry', 'geometric', 'trigonometry', 'trigonometric',
    'calculus', 'statistics', 'statistical', 'probability', 'probabilistic',
    'logarithm', 'logarithmic', 'exponential', 'exponent', 'power',
    'square root', 'cube root', 'factorial', 'permutation', 'combination',
    'fraction', 'decimal', 'percentage', 'percent', 'ratio', 'proportion',
    'sum', 'product', 'quotient', 'difference',
    'sine', 'cosine', 'tangent', 'sin', 'cos', 'tan',
    'limit', 'infinity', 'converge', 'diverge', 'series', 'sequence',
    'polynomial', 'quadratic', 'linear', 'cubic',
    'graph', 'plot', 'function', 'domain', 'range',
    'prime', 'composite', 'factor', 'factorization', 'gcd', 'lcm',
    // Français
    'calculer', 'calcul', 'calculatrice', 'mathématique', 'mathématiques',
    'équation', 'résoudre', 'résolution', 'solution',
    'preuve', 'prouver', 'théorème', 'lemme', 'corollaire',
    'intégrale', 'intégrer', 'intégration', 'dérivée', 'dériver', 'dérivation',
    'matrice', 'vecteur', 'tenseur',
    'addition', 'ajouter', 'soustraction', 'soustraire', 'multiplication', 'multiplier',
    'division', 'diviser', 'reste',
    'algèbre', 'algébrique', 'géométrie', 'géométrique', 'trigonométrie',
    'statistique', 'statistiques', 'probabilité',
    'logarithme', 'exponentiel', 'exposant', 'puissance',
    'racine carrée', 'racine cubique', 'factorielle', 'permutation', 'combinaison',
    'fraction', 'décimal', 'pourcentage', 'rapport', 'proportion',
    'somme', 'produit', 'quotient', 'différence',
    'sinus', 'cosinus', 'tangente',
    'limite', 'infini', 'converger', 'diverger', 'série', 'suite',
    'polynôme', 'quadratique', 'linéaire', 'cubique',
    'graphique', 'tracer', 'domaine', 'image',
    'premier', 'composé', 'facteur', 'factorisation', 'pgcd', 'ppcm',
    // Espagnol
    'calcular', 'cálculo', 'calculadora', 'matemática', 'matemáticas',
    'ecuación', 'resolver', 'resolución', 'solución',
    'prueba', 'demostrar', 'teorema',
    'integral', 'integrar', 'derivada', 'derivar',
    'matriz', 'vector',
    'suma', 'sumar', 'resta', 'restar', 'multiplicación', 'multiplicar',
    'división', 'dividir',
    'álgebra', 'geometría', 'trigonometría',
    'estadística', 'probabilidad',
    'logaritmo', 'exponencial', 'exponente', 'potencia',
    'raíz cuadrada', 'factorial', 'permutación', 'combinación',
    'fracción', 'porcentaje', 'razón', 'proporción',
    'producto', 'cociente', 'diferencia',
    // Allemand
    'berechnen', 'berechnung', 'rechner', 'mathematik', 'mathematisch',
    'gleichung', 'lösen', 'lösung',
    'beweis', 'beweisen', 'theorem',
    'integral', 'integrieren', 'ableitung', 'ableiten',
    'vektor',
    'summe', 'addieren', 'subtraktion', 'subtrahieren', 'multiplikation', 'multiplizieren',
    'teilen',
    'algebra', 'geometrie', 'trigonometrie',
    'statistik', 'wahrscheinlichkeit',
    'logarithmus', 'exponentiell', 'potenz',
    'quadratwurzel', 'fakultät',
    'bruch', 'prozent', 'verhältnis',
    'produkt', 'quotient', 'differenz',
  ],
  FACTCHECK: [
    // Anglais
    'verify', 'verification', 'fact', 'facts', 'factual',
    'true', 'truth', 'false', 'falsehood', 'fake', 'hoax',
    'check', 'checking', 'source', 'sources', 'citation', 'cite',
    'evidence', 'proof', 'claim', 'claims', 'assertion',
    'accurate', 'accuracy', 'inaccurate', 'inaccuracy',
    'confirm', 'confirmation', 'deny', 'denial',
    'myth', 'myths', 'mythbuster', 'debunk', 'debunking',
    'real', 'reality', 'rumor', 'rumour', 'gossip',
    'authentic', 'authenticity', 'legitimate', 'legitimacy',
    'credible', 'credibility', 'reliable', 'reliability',
    'misinformation', 'disinformation', 'propaganda',
    'is it true', 'is this true', 'is that true',
    'did this happen', 'really happened', 'actually',
    // Français
    'vérifier', 'vérification', 'fait', 'faits', 'factuel',
    'vrai', 'vérité', 'faux', 'fausseté', 'canular',
    'source', 'sources', 'citation', 'citer',
    'preuve', 'preuves', 'affirmation', 'affirmer',
    'exact', 'exactitude', 'inexact',
    'confirmer', 'confirmation', 'nier', 'démenti',
    'mythe', 'mythes', 'démystifier',
    'réel', 'réalité', 'rumeur', 'rumeurs',
    'authentique', 'authenticité', 'légitime', 'légitimité',
    'crédible', 'crédibilité', 'fiable', 'fiabilité',
    'désinformation', 'propagande',
    'est-ce vrai', 'c\'est vrai', 'vraiment',
    // Espagnol
    'verificar', 'verificación', 'hecho', 'hechos',
    'verdad', 'verdadero', 'falso', 'falsedad', 'engaño',
    'fuente', 'fuentes', 'cita', 'citar',
    'evidencia', 'prueba', 'afirmación', 'afirmar',
    'exacto', 'exactitud', 'inexacto',
    'confirmar', 'confirmación', 'negar', 'negación',
    'mito', 'mitos', 'desmentir',
    'real', 'realidad', 'rumor', 'rumores',
    'auténtico', 'autenticidad', 'legítimo',
    'creíble', 'credibilidad', 'fiable', 'fiabilidad',
    'desinformación', 'propaganda',
    'es verdad', 'es cierto', 'realmente',
    // Allemand
    'überprüfen', 'überprüfung', 'fakt', 'fakten', 'tatsache',
    'wahr', 'wahrheit', 'falsch', 'fälschung', 'schwindel',
    'quelle', 'quellen', 'zitat', 'zitieren',
    'beweis', 'beweise', 'behauptung', 'behaupten',
    'genau', 'genauigkeit', 'ungenau',
    'bestätigen', 'bestätigung', 'leugnen',
    'mythos', 'mythen', 'entlarven',
    'echt', 'realität', 'gerücht', 'gerüchte',
    'authentisch', 'authentizität', 'legitim',
    'glaubwürdig', 'glaubwürdigkeit', 'zuverlässig',
    'fehlinformation', 'desinformation', 'propaganda',
    'stimmt das', 'ist das wahr', 'wirklich',
  ],
  DIALOGUE: [],
  UNKNOWN: []
};

/**
 * Patterns de phrases pour améliorer la classification
 */
const PHRASE_PATTERNS: Record<IntentCategory, RegExp[]> = {
  CODE: [
    /(?:write|create|make|build|generate|implement)\s+(?:a\s+)?(?:function|class|method|script|program|code)/i,
    /(?:écrire|créer|faire|construire|générer|implémenter)\s+(?:une?\s+)?(?:fonction|classe|méthode|script|programme|code)/i,
    /(?:how|comment)\s+(?:to|do|can)\s+(?:i\s+)?(?:code|program|implement|develop)/i,
    /(?:fix|debug|solve|resolve)\s+(?:this|the|my)?\s*(?:error|bug|issue|problem)/i,
    /(?:corriger|déboguer|résoudre)\s+(?:cette?|le|mon)?\s*(?:erreur|bogue|problème)/i,
    /what\s+(?:is|does)\s+(?:this|the)\s+(?:code|function|method|class)/i,
    /explain\s+(?:this|the)?\s*(?:code|function|algorithm|syntax)/i,
    /(?:expliquer|explique)\s+(?:ce|cette?|le|la)?\s*(?:code|fonction|algorithme|syntaxe)/i,
  ],
  MATH: [
    /(?:calculate|compute|find|solve|evaluate)\s+(?:the)?\s*(?:\d|x|y|equation|integral|derivative|sum|product)/i,
    /(?:calculer|trouver|résoudre|évaluer)\s+(?:la|le|l')?\s*(?:\d|x|y|équation|intégrale|dérivée|somme|produit)/i,
    /what\s+is\s+\d+\s*[\+\-\*\/\^]\s*\d+/i,
    /(?:combien|quel)\s+(?:fait|est|vaut)\s+\d+/i,
    /(?:prove|demonstrate|show)\s+(?:that|the)?\s*(?:theorem|equation|formula)/i,
    /(?:prouver|démontrer|montrer)\s+(?:que|le|la)?\s*(?:théorème|équation|formule)/i,
    /\d+\s*[\+\-\*\/\^%]\s*\d+/,
    /(?:simplify|factor|expand|derive|integrate)/i,
    /(?:simplifier|factoriser|développer|dériver|intégrer)/i,
  ],
  FACTCHECK: [
    /(?:is\s+it|is\s+this|is\s+that)\s+(?:true|real|accurate|correct|a\s+fact)/i,
    /(?:est-ce|c'est)\s+(?:vrai|réel|exact|correct|un\s+fait)/i,
    /(?:can\s+you|please)\s+(?:verify|check|confirm|fact-check)/i,
    /(?:peux-tu|pouvez-vous)\s+(?:vérifier|confirmer)/i,
    /(?:did|does|do|has|have|is|are|was|were)\s+.+\s+(?:really|actually|truly)/i,
    /(?:source|citation|reference)\s+(?:for|on|about)/i,
    /(?:debunk|mythbust|fact\s*check)/i,
    /(?:rumor|rumour|myth|hoax|fake\s+news)/i,
  ],
  DIALOGUE: [],
  UNKNOWN: []
};

/**
 * ClassificationCache - Cache LRU pour les résultats de classification
 */
class ClassificationCache {
  private cache: Map<string, ClassificationCacheEntry> = new Map();
  private config: CacheConfig;

  constructor(config: CacheConfig = { maxSize: 500, ttlMs: 300000 }) {
    this.config = config;
  }

  /**
   * Génère un hash simple pour la requête
   */
  private hashQuery(query: string): string {
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Récupère une entrée du cache
   */
  get(query: string): ClassificationResult | null {
    const hash = this.hashQuery(query);
    const entry = this.cache.get(hash);

    if (!entry) return null;

    // Vérifier le TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(hash);
      return null;
    }

    return entry.result;
  }

  /**
   * Ajoute une entrée au cache
   */
  set(query: string, result: ClassificationResult): void {
    const hash = this.hashQuery(query);

    // Éviction LRU si nécessaire
    if (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(hash, {
      result,
      timestamp: Date.now(),
      queryHash: hash
    });
  }

  /**
   * Vide le cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Obtient les statistiques du cache
   */
  getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: 0 // Would need to track hits/misses for accurate rate
    };
  }
}

/**
 * IntentClassifier - Classifieur d'intention amélioré
 *
 * Fonctionnalités:
 * - Mots-clés multilingues (FR, EN, ES, DE, IT, PT)
 * - Patterns de phrases regex
 * - Cache LRU pour les classifications répétées
 * - Scoring pondéré avec confiance
 */
export class IntentClassifier {
  private cache: ClassificationCache;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private totalClassifications: number = 0;

  constructor(cacheConfig?: CacheConfig) {
    this.cache = new ClassificationCache(cacheConfig);
  }

  /**
   * Normalise une chaîne pour la comparaison
   */
  private normalizeString(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Classifie par mots-clés avec scoring pondéré
   */
  private classifyByKeywords(query: string): { intent: IntentCategory; score: number } | null {
    const normalized = this.normalizeString(query);
    const words = normalized.split(/\s+/);

    const scores: Record<IntentCategory, number> = {
      CODE: 0,
      MATH: 0,
      FACTCHECK: 0,
      DIALOGUE: 0,
      UNKNOWN: 0
    };

    // Score par mots-clés individuels
    for (const [category, keywords] of Object.entries(KEYWORDS_MAP)) {
      for (const keyword of keywords) {
        const normalizedKeyword = this.normalizeString(keyword);

        // Match exact de mot
        if (words.includes(normalizedKeyword)) {
          scores[category as IntentCategory] += 2;
        }
        // Match partiel (le keyword est contenu dans la query)
        else if (normalized.includes(normalizedKeyword)) {
          scores[category as IntentCategory] += 1;
        }
      }
    }

    // Score par patterns de phrases
    for (const [category, patterns] of Object.entries(PHRASE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          scores[category as IntentCategory] += 3; // Les patterns valent plus
        }
      }
    }

    // Trouver le score max
    let maxScore = 0;
    let maxCategory: IntentCategory = 'UNKNOWN';

    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxCategory = category as IntentCategory;
      }
    }

    // Seuil minimum pour une classification valide
    if (maxScore >= 2) {
      return { intent: maxCategory, score: maxScore };
    }

    return null;
  }

  /**
   * Calcule la confiance basée sur le score
   */
  private calculateConfidence(score: number, queryLength: number): number {
    // Plus le score est élevé et la query longue, plus on est confiant
    const baseConfidence = Math.min(score / 10, 1.0);
    const lengthFactor = Math.min(queryLength / 50, 1.0);
    const confidence = baseConfidence * 0.8 + lengthFactor * 0.2;
    return Math.round(confidence * 100) / 100;
  }

  /**
   * Classifie une requête utilisateur
   */
  public async classify(query: string): Promise<ClassificationResult> {
    this.totalClassifications++;

    // Vérifier le cache
    const cached = this.cache.get(query);
    if (cached) {
      this.cacheHits++;
      log.debug(`Cache hit pour classification: ${cached.intent}`);
      return cached;
    }
    this.cacheMisses++;

    // Classification par mots-clés et patterns
    const keywordResult = this.classifyByKeywords(query);

    let result: ClassificationResult;

    if (keywordResult && keywordResult.score >= 3) {
      // Haute confiance
      result = {
        intent: keywordResult.intent,
        confidence: this.calculateConfidence(keywordResult.score, query.length),
        method: 'keywords'
      };
      log.info(`Classification haute confiance: ${result.intent} (score: ${keywordResult.score}, conf: ${result.confidence})`);
    } else if (keywordResult && keywordResult.score >= 2) {
      // Confiance moyenne
      result = {
        intent: keywordResult.intent,
        confidence: this.calculateConfidence(keywordResult.score, query.length),
        method: 'keywords'
      };
      log.info(`Classification confiance moyenne: ${result.intent} (score: ${keywordResult.score}, conf: ${result.confidence})`);
    } else {
      // Fallback vers DIALOGUE
      result = {
        intent: 'DIALOGUE',
        confidence: 0.5,
        method: 'fallback'
      };
      log.info('Fallback vers classification DIALOGUE');
    }

    // Mettre en cache
    this.cache.set(query, result);

    return result;
  }

  /**
   * Classification synchrone (pour les cas simples)
   */
  public classifySync(query: string): ClassificationResult {
    const cached = this.cache.get(query);
    if (cached) {
      return cached;
    }

    const keywordResult = this.classifyByKeywords(query);

    if (keywordResult && keywordResult.score >= 2) {
      return {
        intent: keywordResult.intent,
        confidence: this.calculateConfidence(keywordResult.score, query.length),
        method: 'keywords'
      };
    }

    return {
      intent: 'DIALOGUE',
      confidence: 0.5,
      method: 'fallback'
    };
  }

  /**
   * Vérifie si une requête correspond à une catégorie spécifique
   */
  public matchesCategory(query: string, category: IntentCategory): boolean {
    const result = this.classifySync(query);
    return result.intent === category && result.confidence >= 0.6;
  }

  /**
   * Obtient les statistiques du classifieur
   */
  public getStats(): {
    totalClassifications: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    cacheStats: { size: number; maxSize: number; hitRate: number };
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      totalClassifications: this.totalClassifications,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: total > 0 ? this.cacheHits / total : 0,
      cacheStats: this.cache.getStats()
    };
  }

  /**
   * Réinitialise les statistiques
   */
  public resetStats(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.totalClassifications = 0;
  }

  /**
   * Vide le cache
   */
  public clearCache(): void {
    this.cache.clear();
    log.info('Cache de classification vidé');
  }

  /**
   * Ajoute des mots-clés personnalisés pour une catégorie
   */
  public addCustomKeywords(category: IntentCategory, keywords: string[]): void {
    if (KEYWORDS_MAP[category]) {
      KEYWORDS_MAP[category].push(...keywords);
      log.info(`${keywords.length} mots-clés ajoutés à la catégorie ${category}`);
    }
  }
}

// Export singleton
export const intentClassifier = new IntentClassifier();
