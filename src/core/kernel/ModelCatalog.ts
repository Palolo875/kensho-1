export type ModelPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export type ModelSpecialty = 'DIALOGUE' | 'CODE' | 'MATH' | 'EMBEDDING' | 'GENERAL';

export type ModelMeta = {
  model_id: string;
  size: string;
  description: string;
  quantization: string;
  virtual_vram_gb: number;
  specialty: ModelSpecialty;
  priority: ModelPriority;
  pin: boolean;
};

export const MODEL_CATALOG: Record<string, ModelMeta> = {
  "gemma-3-270m": {
    model_id: "gemma-3-270m-it-MLC",
    size: "270M",
    description: "Gemma 3 270M - Ultra-compact model with int4 quantization, perfect for edge devices",
    quantization: "q4f16_1",
    virtual_vram_gb: 0.35,
    specialty: 'DIALOGUE',
    priority: 'HIGH',
    pin: false
  },
  "gemma-2-2b": {
    model_id: "Gemma-2-2b-it-q4f32_1-MLC",
    size: "2B",
    description: "Gemma 2 2B - Official WebLLM model, ultra-compact and production-ready",
    quantization: "q4f32_1",
    virtual_vram_gb: 1.5,
    specialty: 'DIALOGUE',
    priority: 'NORMAL',
    pin: false
  },
  "qwen2-e5-embed": {
    model_id: "Qwen1.5-0.5B-Chat-q4f16_1-MLC",
    size: "500M",
    description: "Modèle compact pour le chat.",
    quantization: "q4f16_1",
    virtual_vram_gb: 0.4,
    specialty: 'EMBEDDING',
    priority: 'NORMAL',
    pin: false
  },
  "dialogue-gemma-mock": {
    model_id: "dialogue-gemma-mock",
    size: "500M",
    description: "Mock: Dialogue model for testing",
    quantization: "q4f16_1",
    virtual_vram_gb: 0.5,
    specialty: 'DIALOGUE',
    priority: 'HIGH',
    pin: false
  },
  "code-qwen-mock": {
    model_id: "code-qwen-mock",
    size: "1.8B",
    description: "Mock: Code generation model for testing",
    quantization: "q4f16_1",
    virtual_vram_gb: 1.8,
    specialty: 'CODE',
    priority: 'NORMAL',
    pin: false
  },
  "math-bitnet-mock": {
    model_id: "math-bitnet-mock",
    size: "1.2B",
    description: "Mock: Math model for testing",
    quantization: "q4f16_1",
    virtual_vram_gb: 1.2,
    specialty: 'MATH',
    priority: 'CRITICAL',
    pin: true
  }
};

export type ModelKey = keyof typeof MODEL_CATALOG;

export function getModelsBySpecialty(specialty: ModelSpecialty): ModelMeta[] {
  return Object.values(MODEL_CATALOG).filter(m => m.specialty === specialty);
}

export function getModelsByPriority(priority: ModelPriority): ModelMeta[] {
  return Object.values(MODEL_CATALOG).filter(m => m.priority === priority);
}

export function getPinnedModels(): ModelMeta[] {
  return Object.values(MODEL_CATALOG).filter(m => m.pin);
}

export function getModelKey(modelId: string): ModelKey | null {
  for (const [key, meta] of Object.entries(MODEL_CATALOG)) {
    if (meta.model_id === modelId) {
      return key as ModelKey;
    }
  }
  return null;
}
