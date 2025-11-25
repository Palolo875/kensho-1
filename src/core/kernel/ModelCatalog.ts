export type ModelMeta = {
  model_id: string;
  size: string;
  description: string;
  quantization: string;
};

export const MODEL_CATALOG: Record<string, ModelMeta> = {
  "gemma-2-2b": {
    model_id: "Gemma-2-2b-it-q4f32_1-MLC",
    size: "2B",
    description: "Gemma 2 2B - Official WebLLM model, ultra-compact and production-ready",
    quantization: "q4f32_1"
  },
  "qwen2-e5-embed": {
    model_id: "Qwen1.5-0.5B-Chat-q4f16_1-MLC",
    size: "500M",
    description: "Modèle compact pour le chat.",
    quantization: "q4f16_1"
  }
};
