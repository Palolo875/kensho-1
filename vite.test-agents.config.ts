// vite.test-agents.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

// Ce fichier de configuration est UNIQUEMENT pour builder nos agents de test
// en fichiers JS autonomes pour les tests E2E dans le navigateur.
export default defineConfig({
  build: {
    // Vider le dossier de sortie avant chaque build
    emptyOutDir: false, 
    rollupOptions: {
      input: {
        // Chaque entrée correspond à un worker que nous voulons builder.
        // La clé ('ping') sera le nom du fichier de sortie.
        ping: resolve(__dirname, 'src/agents/ping/index.ts'),
        pong: resolve(__dirname, 'src/agents/pong/index.ts'),
      },
      output: {
        // Spécifie où et comment les fichiers sont générés.
        dir: resolve(__dirname, 'dist/test-agents'),
        entryFileNames: '[name].agent.js',
        format: 'iife', // 'Immediately Invoked Function Expression' - un format simple et autonome.
      },
    },
    // On désactive le minifying pour faciliter le débogage si nécessaire.
    minify: false,
  },
});
