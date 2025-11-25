/**
 * WebLLM Configuration
 * Defines available models and their MLC specifications
 */

export const WEBLLM_CONFIG = {
  model_list: [
    {
      model: "https://huggingface.co/llinguini/gemma-3-270m-it-q4f16_1-MLC",
      model_id: "gemma-3-270m-it-MLC",
      model_lib: "https://huggingface.co/llinguini/gemma-3-270m-it-q4f16_1-MLC/resolve/main/libs/gemma-3-270m-it-webgpu.wasm",
      required_features: ["shader-f16"]
    }
  ]
};
