import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'happy-dom',
        include: ['src/**/__tests__/**/*.test.ts'],

        // Fix pour Windows: Use threads instead of forks
        pool: 'threads',
        poolOptions: {
            threads: {
                singleThread: false,
                minThreads: 1,
                maxThreads: 4,
            }
        },

        // Augmenter les timeouts pour éviter les erreurs
        testTimeout: 10000,
        hookTimeout: 10000,
        teardownTimeout: 10000,

        // Configuration pour happy-dom
        environmentOptions: {
            happyDOM: {
                width: 1024,
                height: 768,
            }
        },

        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: [
                'node_modules/',
                'dist/',
                'tests/',
                'src/**/__tests__/**',
                'src/**/*.test.ts',
                '**/*.config.ts',
                '**/*.d.ts',
                'src/vite-env.d.ts',
                'src/main.tsx',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
