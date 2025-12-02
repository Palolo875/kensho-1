// src/core/models/ModelConstants.ts
// Constants for model keys used throughout the system

export const MODEL_KEYS = {
    CODE_EXPERT: 'qwen2.5-coder-1.5b',
    MATH_EXPERT: 'qwen2.5-math-1.5b',
    GENERAL_DIALOGUE: 'gemma-3-270m'
} as const;

export type ModelKey = typeof MODEL_KEYS[keyof typeof MODEL_KEYS];