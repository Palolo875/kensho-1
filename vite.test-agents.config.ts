// vite.test-agents.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

// This configuration file is ONLY for building our test agents
// into standalone JS files for E2E testing in the browser.
export default defineConfig({
  build: {
    // Vider le dossier de sortie avant chaque build
    emptyOutDir: false,
    rollupOptions: {
      input: {
        // Each entry corresponds to a worker we want to build.
        // The key ('ping') will be the output file name.
        ping: resolve(__dirname, 'src/agents/ping/index.ts'),
        pong: resolve(__dirname, 'src/agents/pong/index.ts'),
        telemetry: resolve(__dirname, 'src/agents/telemetry/index.ts'),
        state: resolve(__dirname, 'src/agents/test/state-agent.ts'),
      },
      output: {
        // Specify where and how the files are generated.
        dir: resolve(__dirname, 'dist/test-agents'),
        entryFileNames: '[name].agent.js',
        // Use 'es' (ES Module) format, which is compatible with modern workers
        // and supports multiple inputs.
        format: 'es',
      },
    },
    // Disable minifying to make debugging easier if needed.
    minify: false,
  },
});
