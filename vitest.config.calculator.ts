import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Configuration Vitest dédiée pour les tests du CalculatorAgent.
 * Utilise l'environnement 'node' au lieu de 'happy-dom' pour éviter
 * les problèmes de désérialisation avec les tests de logique pure.
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/agents/calculator/__tests__/**/*.test.{ts,tsx}'],
        
        testTimeout: 10000,
        hookTimeout: 10000,
        teardownTimeout: 10000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
