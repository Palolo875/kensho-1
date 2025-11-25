export interface RouterModelMeta {
  model_id: string;
  size: string;
  specialization: 'dialogue' | 'code' | 'math' | 'embedding';
  description: string;
  quantization: string;
  contextWindow: number;
  verified: boolean;
  verifiedDate?: string;
}

export const ROUTER_MODEL_CATALOG: Record<string, RouterModelMeta> = {
  "gemma-3-270m": {
    model_id: "gemma-3-270m-it-MLC",
    size: "270M",
    specialization: "dialogue",
    description: "Noyau de dialogue généraliste ultra-compact et efficace. Expert en conversation naturelle et synthèse.",
    quantization: "q4f16_1",
    contextWindow: 32768,
    verified: true,
    verifiedDate: "2025-11-25"
  },
  
  "qwen2.5-coder-1.5b": {
    model_id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    size: "1.5B",
    specialization: "code",
    description: "Expert en génération de code, debugging, et explication de concepts techniques. Optimisé pour Python, JavaScript, TypeScript, Rust.",
    quantization: "q4f16_1",
    contextWindow: 32768,
    verified: true,
    verifiedDate: "2025-11-25"
  },
  
  "qwen2.5-math-1.5b": {
    model_id: "Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC",
    size: "1.5B",
    specialization: "math",
    description: "Expert en mathématiques, capable de résoudre des problèmes complexes, d'expliquer des concepts et de vérifier des calculs.",
    quantization: "q4f16_1",
    contextWindow: 32768,
    verified: true,
    verifiedDate: "2025-11-25"
  }
};

export function getModelBySpecialization(specialization: 'dialogue' | 'code' | 'math'): RouterModelMeta | null {
  for (const [key, model] of Object.entries(ROUTER_MODEL_CATALOG)) {
    if (model.specialization === specialization && model.verified) {
      return model;
    }
  }
  return null;
}

export function getAllVerifiedModels(): RouterModelMeta[] {
  return Object.values(ROUTER_MODEL_CATALOG).filter(m => m.verified);
}

export function validateModelExists(modelKey: string): boolean {
  return modelKey in ROUTER_MODEL_CATALOG && ROUTER_MODEL_CATALOG[modelKey].verified;
}
