import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Configuration Vitest dédiée pour les tests en environnement Node pur.
 * 
 * IMPORTANT : N'utilise PAS tests/setup/vitest-setup.ts qui charge happy-dom.
 * Cette configuration est isolée pour éviter les problèmes de désérialisation
 * lors de l'exécution de tests de logique pure (sans DOM).
 * 
 * Force singleThread et useAtomics pour éviter les problèmes de worker pool.
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        
        include: ['src/agents/calculator/__tests__/**/*.test.{ts,tsx}'],
        
        testTimeout: 10000,
        hookTimeout: 10000,
        teardownTimeout: 10000,
        
        pool: 'threads',
        poolOptions: {
            threads: {
                singleThread: true,
                useAtomics: false,
                isolate: false,
            },
        },
        
        reporters: ['verbose'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
