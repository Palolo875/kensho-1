import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        emptyOutDir: false,
        rollupOptions: {
            input: {
                llm: resolve(__dirname, 'src/agents/llm/mock.ts'),
            },
            output: {
                dir: resolve(__dirname, 'dist/test-agents'),
                entryFileNames: '[name].agent.js',
                format: 'es',
            },
        },
        minify: false,
    },
});
