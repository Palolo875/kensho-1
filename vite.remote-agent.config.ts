import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    build: {
        outDir: 'dist/remote-agents',
        emptyOutDir: true,
        lib: {
            entry: {
                'remote-ping': path.resolve(__dirname, 'src/agents/remote-ping/index.ts'),
            },
            formats: ['es'],
            fileName: (format, name) => `${name}.agent.js`,
        },
        rollupOptions: {
            output: {
                inlineDynamicImports: false,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
