export interface AppConfig {
    llm: {
        enabled: boolean;
        autoload: boolean;
        modelId: string;
    };
    mode: 'full' | 'lite';
}

const MODE = (import.meta.env.VITE_MODE || 'full') as 'full' | 'lite';
const LLM_AUTOLOAD = import.meta.env.VITE_LLM_AUTOLOAD === 'true';

export const appConfig: AppConfig = {
    llm: {
        enabled: MODE === 'full',
        autoload: LLM_AUTOLOAD && MODE === 'full',
        modelId: 'gemma-3-270m-it-MLC'
    },
    mode: MODE
};

console.log('[AppConfig] Mode:', MODE, '| LLM enabled:', appConfig.llm.enabled, '| Autoload:', appConfig.llm.autoload);
