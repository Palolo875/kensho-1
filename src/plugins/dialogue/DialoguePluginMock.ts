import { gemmaMock } from '../mocks/GemmaMock';
import { qwenCoderMock } from '../mocks/QwenCoderMock';
import { intentClassifierMock } from '../mocks/IntentClassifierMock';
import { ThoughtStep } from '../../agents/oie/types';
import { createLogger } from '../../lib/logger';

const log = createLogger('DialoguePluginMock');

log.info('Initialisation du DialoguePlugin v1.0 (Mode Simulation)...');

export interface StreamEvent {
  type: 'token' | 'complete' | 'error' | 'thinking_step';
  data: any;
  timestamp: number;
}

const MOCK_EXECUTORS: Record<string, (prompt: string) => Promise<string>> = {
  "gemma-3-270m": gemmaMock,
  "gemma-2-2b": gemmaMock,
  "qwen2.5-coder-1.5b": qwenCoderMock,
};

const THINKING_STEPS = [
  { label: "Analyse de la requête", duration: 200 },
  { label: "Détection de l'intention", duration: 150 },
  { label: "Recherche du contexte", duration: 250 },
  { label: "Formulation de la réponse", duration: 300 },
  { label: "Vérification finale", duration: 100 }
];

export class DialoguePluginMock {
  private startTime: number = 0;
  private thinkingSteps: ThoughtStep[] = [];

  private generateThinkingSteps(intent: string): ThoughtStep[] {
    const steps: ThoughtStep[] = [];
    let elapsed = 0;

    elapsed += THINKING_STEPS[0].duration;
    steps.push({
      id: `thought_1_${Date.now()}`,
      label: THINKING_STEPS[0].label,
      status: 'completed',
      result: `Analyse de "${intent}" détectée`
    });

    elapsed += THINKING_STEPS[1].duration;
    steps.push({
      id: `thought_2_${Date.now()}`,
      label: THINKING_STEPS[1].label,
      status: 'completed',
      result: `Intent: ${intent}`
    });

    elapsed += THINKING_STEPS[2].duration;
    steps.push({
      id: `thought_3_${Date.now()}`,
      label: THINKING_STEPS[2].label,
      status: 'completed',
      result: 'Contexte chargé'
    });

    elapsed += THINKING_STEPS[3].duration;
    steps.push({
      id: `thought_4_${Date.now()}`,
      label: THINKING_STEPS[3].label,
      status: 'completed',
      result: 'Prêt à répondre'
    });

    steps.push({
      id: `thought_5_${Date.now()}`,
      label: THINKING_STEPS[4].label,
      status: 'completed',
      result: '✓ Validé'
    });

    return steps;
  }

  private generateThinkingText(userPrompt: string, intent: string): string {
    const thinkingTexts = [
      `Je dois d'abord comprendre que l'utilisateur demande: "${userPrompt.substring(0, 50)}...". L'intention semble être de type ${intent}. Je vais analyser le contexte, chercher les informations pertinentes, puis formuler une réponse cohérente et utile.`,
      `L'analyse du texte indique un "${intent}". Je dois considérer plusieurs angles: la pertinence, la clarté, et l'utilité. Je vais chercher dans mes connaissances pour fournir la meilleure réponse possible.`,
      `Processus de réflexion: (1) Identifier la question: "${userPrompt.substring(0, 40)}...", (2) Déterminer l'intention: ${intent}, (3) Rassembler les informations, (4) Structurer la réponse, (5) Valider la qualité.`
    ];
    return thinkingTexts[Math.floor(Math.random() * thinkingTexts.length)];
  }

  public async *startConversation(
    userPrompt: string,
    modelKey = "gemma-3-270m"
  ): AsyncGenerator<StreamEvent> {
    this.startTime = Date.now();

    try {
      log.info(`Conversation démarrée avec: "${userPrompt.substring(0, 50)}..."`);
      
      const intent = await intentClassifierMock(userPrompt);
      log.info(`Intent détecté: ${intent}`);

      this.thinkingSteps = this.generateThinkingSteps(intent);
      const thinkingText = this.generateThinkingText(userPrompt, intent);

      for (const step of this.thinkingSteps) {
        yield {
          type: 'thinking_step',
          data: step,
          timestamp: Date.now()
        };
        await new Promise(res => setTimeout(res, step.status === 'completed' ? 100 : 50));
      }

      let executor = MOCK_EXECUTORS[modelKey];
      if (!executor) {
        executor = gemmaMock;
      }

      const response = await executor(userPrompt);
      
      for (const char of response) {
        yield {
          type: 'token',
          data: char,
          timestamp: Date.now()
        };
        await new Promise(res => setTimeout(res, Math.random() * 20));
      }

      yield {
        type: 'complete',
        data: {
          response,
          thinking: thinkingText,
          tokens: response.length
        },
        timestamp: Date.now()
      };

    } catch (error) {
      log.error('Erreur durant la génération:', error as Error);
      yield {
        type: 'error',
        data: { message: error instanceof Error ? error.message : 'Erreur inconnue' },
        timestamp: Date.now()
      };
    }
  }
}

export const dialoguePluginMock = new DialoguePluginMock();
