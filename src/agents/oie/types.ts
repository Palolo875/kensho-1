// src/agents/oie/types.ts
// Types partagés pour le système OIE

export interface PlanStep {
  id?: string;
  agent: string;
  action: string;
  args?: Record<string, any>;
  prompt?: string;
  label?: string;
}

export interface BasePlan {
  type: string;
  thought: string;
  steps: PlanStep[];
}

export interface SimplePlan extends BasePlan {
  type: 'SimplePlan';
}

export interface DebatePlan extends BasePlan {
  type: 'DebatePlan';
  steps: [
    { id: 'step1'; agent: 'OptimistAgent'; action: 'generateInitialResponse' },
    { id: 'step2'; agent: 'CriticAgent'; action: 'critique' },
    { id: 'step3'; agent: 'MetaCriticAgent'; action: 'validate' },
    { id: 'step4'; agent: 'SynthesizerAgent'; action: 'synthesizeDebate' }
  ];
}

export type Plan = SimplePlan | DebatePlan;

export interface MetaCriticValidation {
  overall_relevance_score: number;
  is_forced: boolean;
  feedback?: string;
}

export interface SynthesizedResponse {
  text: string;
  confidence: number;
  sources: string[];
}