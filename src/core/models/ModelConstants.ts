// src/core/models/ModelConstants.ts
// ⚠️ DÉPRÉCIÉ - Constants for model keys used throughout the system
// Utilisez catalogManager.getCatalog() à la place

console.warn('[ModelConstants] Utilisation d\'un fichier déprécié. Utilisez catalogManager à la place.');

export const MODEL_KEYS = {
    CODE_EXPERT: 'qwen2.5-coder-1.5b',
    MATH_EXPERT: 'qwen2.5-math-1.5b',
    GENERAL_DIALOGUE: 'gemma-3-270m',
    FACT_CHECK_EXPERT: 'fact-check-expert-1.0b',
    DEEP_THINK_EXPERT: 'deep-think-expert-1.0b'
} as const;

export type ModelKey = typeof MODEL_KEYS[keyof typeof MODEL_KEYS];