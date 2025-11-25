export type ModelMeta = {
  model_id: string;
  size: string;
  description: string;
  quantization: string;
};

export const MODEL_CATALOG: Record<string, ModelMeta> = {
  "gemma-3-270m": {
    model_id: "gemma-3-270m-it-MLC",
    size: "270M",
    description: "Gemma 3 270M - Ultra-compact Google model optimized for WebGPU browser inference",
    quantization: "q4f16_1"
  },
  "qwen2-e5-embed": {
    model_id: "Qwen1.5-0.5B-Chat-q4f16_1-MLC",
    size: "500M",
    description: "Modèle compact pour le chat.",
    quantization: "q4f16_1"
  }
};
