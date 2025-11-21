import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["src/agents/calculator/__tests__/**"],
    setupFiles: ["./tests/setup/vitest-setup.ts"],

    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,

    environmentOptions: {
      happyDOM: {
        width: 1024,
        height: 768,
      },
    },

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "node_modules/",
        "dist/",
        "tests/",
        "src/**/__tests__/**",
        "src/**/*.test.{ts,tsx}",
        "**/*.config.ts",
        "**/*.d.ts",
        "src/vite-env.d.ts",
        "src/main.tsx",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
