// src/utils/sampleJournal.ts
import { SerializedJournal } from '../core/oie/JournalCognitif';

export const SAMPLE_JOURNAL: SerializedJournal = {
  type: 'debate',
  queryId: 'example-001',
  userQuery: 'Comment puis-je améliorer la productivité de mon équipe?',
  startTime: Date.now() - 2500, // 2.5 seconds ago
  endTime: Date.now(),
  totalDuration: 2500,
  steps: [
    {
      stepId: 'step_1_optimist',
      agent: 'OptimistAgent',
      action: 'generateInitialResponse',
      label: 'Draft Optimiste',
      startTime: Date.now() - 2500,
      endTime: Date.now() - 1900,
      duration: 600,
      status: 'completed',
      result: 'La productivité peut être améliorée en implémentant des outils collaboratifs modernes, en établissant des objectifs clairs et mesurables, et en créant une culture d\'amélioration continue. Les équipes qui se concentrent sur l\'automatisation des tâches répétitives voient généralement une augmentation de 20-30% de la productivité.'
    },
    {
      stepId: 'step_2_critic',
      agent: 'CriticAgent',
      action: 'critique',
      label: 'Analyse Critique',
      startTime: Date.now() - 1900,
      endTime: Date.now() - 1200,
      duration: 700,
      status: 'completed',
      result: {
        issues: [
          'Pas assez spécifique sur les obstacles courants',
          'Manque de considération pour la fatigue mentale des équipes',
          'Ne mentionne pas les différences d\'industries'
        ],
        suggestions: [
          'Ajouter des obstacles pratiques et comment les surmonter',
          'Inclure l\'importance du bien-être et des breaks',
          'Contextualiser pour différents types d\'équipes'
        ]
      }
    },
    {
      stepId: 'step_3_metacritic',
      agent: 'MetaCriticAgent',
      action: 'validate',
      label: 'Validation Critique',
      startTime: Date.now() - 1200,
      endTime: Date.now() - 400,
      duration: 800,
      status: 'completed',
      result: {
        overall_relevance_score: 78,
        is_forced: false,
        reasoning: 'Critique bien structurée, soulevant des points pertinents et constructifs qui amélioreront la réponse'
      }
    },
    {
      stepId: 'step_4_synthesis',
      agent: 'MainLLMAgent',
      action: 'synthesize',
      label: 'Synthèse Finale',
      startTime: Date.now() - 400,
      endTime: Date.now(),
      duration: 400,
      status: 'completed',
      result: 'Réponse synthétisée combinant approche optimiste et critique...'
    }
  ],
  finalResponse: 'La productivité d\'équipe s\'améliore par une combinaison d\'outils collaboratifs intelligents, d\'objectifs SMART clairs, et d\'une culture qui valorise le bien-être. Pour réussir: (1) automatisez les tâches répétitives pour libérer du temps créatif, (2) établissez des sprints avec des pauses structurées pour éviter la fatigue, (3) adaptez votre approche à votre contexte (startup vs grande entreprise) - les startups se concentrent sur la vélocité, les grandes organisations sur l\'optimisation. Les équipes qui voient les plus gros gains (20-30%+) combinentabilitation individuelle et systèmes solides.',
  degradationApplied: false,
  degradationReason: undefined
};
