export type ModelMeta = {
  model_id: string;
  size: string;
  description: string;
  quantization: string;
};

export const MODEL_CATALOG: Record<string, ModelMeta> = {
  "phi-3-mini": {
    model_id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
    size: "3.8B",
    description: "Modèle ultra-léger et rapide pour le chat temps réel.",
    quantization: "q4f16_1"
  },
  "qwen2-e5-embed": {
    model_id: "Qwen1.5-0.5B-Chat-q4f16_1-MLC",
    size: "500M",
    description: "Modèle compact pour le chat.",
    quantization: "q4f16_1"
  }
};
