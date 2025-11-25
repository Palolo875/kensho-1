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
    description: "Noyau de dialogue ultra-compact et efficace.",
    quantization: "q4f16_1"
  },
  "qwen2-e5-embed": {
    model_id: "Qwen2-E5-Embedding-Model-ID-MLC",
    size: "150M",
    description: "Expert en encodage sémantique pour le RAG.",
    quantization: "f32"
  }
};
