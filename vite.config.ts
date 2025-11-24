/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import type { RollupOptions } from "rollup";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Build mode detection for different entry points
  const isTestAgentsBuild = mode === "test-agents";
  const isRemoteAgentsBuild = mode === "remote-agents";
  const isLLMBuild = mode === "llm";

  if (isTestAgentsBuild || isRemoteAgentsBuild || isLLMBuild) {
    // Agent build modes - use rollupOptions for multi-entry builds
    const rollupOptions: RollupOptions = {
      output: {
        format: "es",
        entryFileNames: "[name].agent.js",
      },
    };

    if (isTestAgentsBuild) {
      rollupOptions.input = {
        llm: path.resolve(__dirname, "src/agents/llm/mock.ts"),
        calculator: path.resolve(__dirname, "src/agents/calculator/index.ts"),
      };
      (rollupOptions.output as any).dir = path.resolve(__dirname, "dist/test-agents");
    } else if (isRemoteAgentsBuild) {
      rollupOptions.input = {
        "remote-ping": path.resolve(__dirname, "src/agents/remote-ping/index.ts"),
      };
      (rollupOptions.output as any).dir = path.resolve(__dirname, "dist/remote-agents");
    } else if (isLLMBuild) {
      rollupOptions.input = {
        llm: path.resolve(__dirname, "src/agents/llm/mock.ts"),
      };
      (rollupOptions.output as any).dir = path.resolve(__dirname, "dist/test-agents");
    }

    return {
      build: {
        emptyOutDir: false,
        rollupOptions,
        minify: false,
      },
    };
  }

  // Development/main build mode
  return {
    server: {
      host: "0.0.0.0",
      port: 5000,
      watch: {
        ignored: ["**/node_modules/**", "**/.cache/**", "**/bun.lockb/**"],
      },
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    worker: {
      format: 'es',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    test: {
      globals: true,
    },
  };
});
