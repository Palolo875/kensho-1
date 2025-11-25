import { gemmaMock } from '../mocks/GemmaMock';
import { qwenCoderMock } from '../mocks/QwenCoderMock';
import { intentClassifierMock } from '../mocks/IntentClassifierMock';
import { ThoughtStep } from '../../agents/oie/types';

console.log("🔌 Initialisation du DialoguePlugin v1.0 (Mode Simulation)...");

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

// Étapes de pensée simulées
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

  /**
   * Génère les étapes de pensée pour affichage dans l'UI
   */
  private generateThinkingSteps(intent: string): ThoughtStep[] {
    const steps: ThoughtStep[] = [];
    let elapsed = 0;

    // Étape 1: Analyse
    elapsed += THINKING_STEPS[0].duration;
    steps.push({
      id: `thought_1_${Date.now()}`,
      label: THINKING_STEPS[0].label,
      status: 'completed',
      result: `Analyse de "${intent}" détectée`
    });

    // Étape 2: Intention
    elapsed += THINKING_STEPS[1].duration;
    steps.push({
      id: `thought_2_${Date.now()}`,
      label: THINKING_STEPS[1].label,
      status: 'completed',
      result: `Intent: ${intent}`
    });

    // Étape 3: Recherche
    elapsed += THINKING_STEPS[2].duration;
    steps.push({
      id: `thought_3_${Date.now()}`,
      label: THINKING_STEPS[2].label,
      status: 'completed',
      result: 'Contexte chargé'
    });

    // Étape 4: Formulation
    elapsed += THINKING_STEPS[3].duration;
    steps.push({
      id: `thought_4_${Date.now()}`,
      label: THINKING_STEPS[3].label,
      status: 'completed',
      result: 'Prêt à répondre'
    });

    // Étape 5: Vérification
    steps.push({
      id: `thought_5_${Date.now()}`,
      label: THINKING_STEPS[4].label,
      status: 'completed',
      result: '✓ Validé'
    });

    return steps;
  }

  /**
   * Génère un texte de pensée simulé
   */
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
      console.log(`[Plugin Mock] Conversation démarrée avec: "${userPrompt.substring(0, 50)}..."`);
      
      const intent = await intentClassifierMock(userPrompt);
      console.log(`[Plugin Mock] Intent détecté: ${intent}`);

      // Générer les étapes de pensée
      this.thinkingSteps = this.generateThinkingSteps(intent);
      const thinkingText = this.generateThinkingText(userPrompt, intent);

      // Émettre les étapes de pensée
      for (const step of this.thinkingSteps) {
        yield {
          type: 'thinking_step',
          data: step,
          timestamp: Date.now()
        };
        await new Promise(res => setTimeout(res, step.status === 'completed' ? 100 : 50));
      }

      let executor = MOCK_EXECUTORS[modelKey];
      
      if (intent === 'CODE') {
        executor = MOCK_EXECUTORS["qwen2.5-coder-1.5b"];
      }

      if (!executor) {
        executor = gemmaMock;
      }

      const response = await executor(userPrompt);
      
      const words = response.split(' ');
      for (const word of words) {
        yield {
          type: 'token',
          data: word + ' ',
          timestamp: Date.now()
        };
        await new Promise(res => setTimeout(res, 30));
      }

      const totalTime = Date.now() - this.startTime;
      const tokens = words.length;

      yield {
        type: 'complete',
        data: {
          response,
          thinking: thinkingText,
          thoughtProcess: this.thinkingSteps,
          fromCache: false,
          tokens,
          metrics: {
            ttft: 150,
            totalTime,
            tokens,
            tokensPerSec: (tokens / (totalTime / 1000)).toFixed(2)
          }
        },
        timestamp: Date.now()
      };

      console.log(`[Plugin Mock] Réponse complète envoyée (${tokens} tokens, ${totalTime}ms)`);

    } catch (error) {
      console.error("[Plugin Mock] Erreur:", error);
      yield {
        type: 'error',
        data: { error: error instanceof Error ? error.message : String(error) },
        timestamp: Date.now()
      };
    }
  }
}
