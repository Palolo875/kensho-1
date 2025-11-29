/**
 * Mock Engines pour le développement et les tests
 *
 * Ces mocks simulent les APIs de WebLLM (GPU) et Transformers.js (CPU)
 * permettant de tester le RuntimeManager sans télécharger de vrais modèles.
 *
 * @module core/runtime/mocks/mock-engines
 */

import { createLogger } from '../../../lib/logger';
import type { IInferenceEngine, InferenceOptions, InferenceResult, ProgressCallback } from '../../kernel/RuntimeManager';

const log = createLogger('MockEngines');

log.info('🔧 Moteurs factices (Mocks) chargés.');

/**
 * Type de backend simulé
 */
export type MockEngineType = 'GPU' | 'CPU';

/**
 * Configuration pour les mocks
 */
export interface MockEngineConfig {
  simulatedLatencyMs?: number;
  simulatedTokensPerSecond?: number;
  shouldFail?: boolean;
  failureRate?: number;
}

/**
 * Classe de base abstraite pour les moteurs mock
 */
abstract class BaseMockEngine implements IInferenceEngine {
  protected loaded = false;
  protected currentModelId: string | null = null;
  protected config: MockEngineConfig;

  abstract readonly name: string;
  abstract readonly type: MockEngineType;
  protected abstract readonly baseLatencyMs: number;

  constructor(config: MockEngineConfig = {}) {
    this.config = {
      simulatedLatencyMs: config.simulatedLatencyMs,
      simulatedTokensPerSecond: config.simulatedTokensPerSecond ?? 30,
      shouldFail: config.shouldFail ?? false,
      failureRate: config.failureRate ?? 0,
    };
  }

  async load(modelId: string, onProgress?: ProgressCallback): Promise<void> {
    log.info(`[${this.name}] Chargement simulé du modèle: ${modelId}`);

    if (this.config.shouldFail) {
      throw new Error(`[${this.name}] Échec simulé du chargement`);
    }

    // Simuler les étapes de chargement
    const phases = [
      { name: 'downloading', duration: 200 },
      { name: 'loading', duration: 150 },
      { name: 'compiling', duration: this.type === 'GPU' ? 300 : 100 },
      { name: 'ready', duration: 50 },
    ];

    for (let i = 0; i < phases.length; i++) {
      await new Promise(resolve => setTimeout(resolve, phases[i].duration));
      onProgress?.({
        phase: phases[i].name,
        progress: (i + 1) / phases.length,
        text: `[${this.name}] ${phases[i].name}...`,
      });
    }

    this.loaded = true;
    this.currentModelId = modelId;
    log.info(`[${this.name}] Modèle ${modelId} chargé avec succès (${this.type})`);
  }

  async generate(prompt: string, options?: InferenceOptions): Promise<InferenceResult> {
    if (!this.loaded) {
      throw new Error(`[${this.name}] Aucun modèle chargé`);
    }

    // Simuler un échec aléatoire si configuré
    if (this.config.failureRate && Math.random() < this.config.failureRate) {
      throw new Error(`[${this.name}] Échec aléatoire simulé de l'inférence`);
    }

    const startTime = performance.now();
    log.debug(`[${this.name}] Génération pour: "${prompt.substring(0, 30)}..."`);

    // Calculer le délai basé sur le type de moteur
    const latency = this.config.simulatedLatencyMs ?? this.baseLatencyMs;
    const jitter = latency * 0.2 * (Math.random() - 0.5);
    await new Promise(resolve => setTimeout(resolve, latency + jitter));

    const mockResponse = this.generateMockResponse(prompt, options);
    const timeMs = performance.now() - startTime;
    const tokensGenerated = mockResponse.split(' ').length;

    return {
      text: mockResponse,
      tokensGenerated,
      timeMs,
      finishReason: 'stop',
    };
  }

  async generateStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: InferenceOptions
  ): Promise<InferenceResult> {
    if (!this.loaded) {
      throw new Error(`[${this.name}] Aucun modèle chargé`);
    }

    const startTime = performance.now();
    log.debug(`[${this.name}] Streaming pour: "${prompt.substring(0, 30)}..."`);

    const mockResponse = this.generateMockResponse(prompt, options);
    const words = mockResponse.split(' ');

    // Calculer le délai entre les tokens
    const tokensPerSecond = this.config.simulatedTokensPerSecond ?? (this.type === 'GPU' ? 50 : 15);
    const delayPerToken = 1000 / tokensPerSecond;

    for (const word of words) {
      const jitter = delayPerToken * 0.3 * (Math.random() - 0.5);
      await new Promise(resolve => setTimeout(resolve, delayPerToken + jitter));
      onChunk(word + ' ');
    }

    const timeMs = performance.now() - startTime;

    return {
      text: mockResponse,
      tokensGenerated: words.length,
      timeMs,
      finishReason: 'stop',
    };
  }

  async unload(): Promise<void> {
    log.info(`[${this.name}] Déchargement du modèle: ${this.currentModelId}`);
    this.loaded = false;
    this.currentModelId = null;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getModelId(): string | null {
    return this.currentModelId;
  }

  protected generateMockResponse(prompt: string, options?: InferenceOptions): string {
    const responses = [
      `Je suis ${this.name} (${this.type}). Voici ma réponse à votre question.`,
      `Réponse simulée via ${this.type} pour le développement et les tests.`,
      `En mode mock ${this.type}, je génère des réponses prédéfinies rapidement.`,
      `Cette réponse est générée par ${this.name} pour tester le système.`,
      `Kensho fonctionne correctement avec le moteur ${this.type} simulé.`,
    ];

    // Sélectionner une réponse basée sur le hash du prompt
    const hash = prompt.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    let response = responses[hash % responses.length];

    // Ajouter un contexte basé sur le prompt
    if (prompt.toLowerCase().includes('bonjour') || prompt.toLowerCase().includes('hello')) {
      response = `Bonjour ! ${response}`;
    }

    // Respecter maxTokens si spécifié
    if (options?.maxTokens) {
      const words = response.split(' ');
      if (words.length > options.maxTokens) {
        response = words.slice(0, options.maxTokens).join(' ') + '...';
      }
    }

    return response;
  }
}

/**
 * Mock WebLLM Engine - Simule un moteur GPU rapide
 */
export class MockWebLLMEngine extends BaseMockEngine {
  readonly name = 'MockWebLLM';
  readonly type: MockEngineType = 'GPU';
  protected readonly baseLatencyMs = 150;

  constructor(config?: MockEngineConfig) {
    super({
      simulatedTokensPerSecond: 50,
      ...config,
    });
  }
}

/**
 * Mock Transformers.js Engine - Simule un moteur CPU plus lent
 */
export class MockTransformersJSEngine extends BaseMockEngine {
  readonly name = 'MockTransformersJS';
  readonly type: MockEngineType = 'CPU';
  protected readonly baseLatencyMs = 500;

  constructor(config?: MockEngineConfig) {
    super({
      simulatedTokensPerSecond: 15,
      ...config,
    });
  }
}

/**
 * Instances singleton pour compatibilité avec l'ancien code
 */
export const mockWebLLMEngine = new MockWebLLMEngine();
export const mockTransformersJSEngine = new MockTransformersJSEngine();

/**
 * Factory pour créer un moteur mock selon le type
 */
export function createMockEngine(
  type: MockEngineType,
  config?: MockEngineConfig
): IInferenceEngine {
  switch (type) {
    case 'GPU':
      return new MockWebLLMEngine(config);
    case 'CPU':
      return new MockTransformersJSEngine(config);
    default:
      throw new Error(`Type de moteur mock non supporté: ${type}`);
  }
}
