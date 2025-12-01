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
    description: "Gemma 3 270M - Ultra-compact model with int4 quantization, perfect for edge devices",
    quantization: "q4f16_1"
  },
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

/**
 * Catalogue des modèles simulés avec poids virtuels
 * Pour la simulation "Usine Vide"
 * 
 * Spécialités:
 * - DIALOGUE: Modèles conversationnels légers
 * - CODE: Modèles spécialisés en programmation
 * - MATH: Calculs mathématiques et logiques
 * - RESEARCH: Analyse et recherche approfondie
 * - CREATIVE: Génération de contenu créatif
 * - SUMMARY: Résumé et extraction d'information
 * - VISION: Traitement d'images (futur)
 * - EMBEDDING: Modèles d'embedding vectoriel
 */
export const MOCK_MODEL_CATALOG = {
  "dialogue-gemma-mock": { specialty: 'DIALOGUE', virtual_vram_gb: 0.5 },
  "code-qwen-mock": { specialty: 'CODE', virtual_vram_gb: 1.8 },
  "math-bitnet-mock": { specialty: 'MATH', virtual_vram_gb: 1.2 },
  "research-phi-mock": { specialty: 'RESEARCH', virtual_vram_gb: 2.1 },
  "creative-llama-mock": { specialty: 'CREATIVE', virtual_vram_gb: 1.5 },
  "summary-t5-mock": { specialty: 'SUMMARY', virtual_vram_gb: 0.8 },
  "vision-clip-mock": { specialty: 'VISION', virtual_vram_gb: 2.5 },
  "embedding-e5-mock": { specialty: 'EMBEDDING', virtual_vram_gb: 0.3 },
} as const;

export type MockModelKey = keyof typeof MOCK_MODEL_CATALOG;
