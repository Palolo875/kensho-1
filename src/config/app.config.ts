export interface AppConfig {
    llm: {
        enabled: boolean;
        autoload: boolean;
        modelId: string;
    };
    mode: 'full' | 'lite';
}

const MODE = (import.meta.env.VITE_MODE || 'full') as 'full' | 'lite';
const LLM_AUTOLOAD = import.meta.env.VITE_LLM_AUTOLOAD !== 'false';

export const appConfig: AppConfig = {
    llm: {
        enabled: MODE === 'full',
        autoload: LLM_AUTOLOAD && MODE === 'full',
        modelId: 'Phi-3-mini-4k-instruct-q4f32_1-MLC'
    },
    mode: MODE
};

console.log('[AppConfig] Mode:', MODE, '| LLM enabled:', appConfig.llm.enabled, '| Autoload:', appConfig.llm.autoload);
