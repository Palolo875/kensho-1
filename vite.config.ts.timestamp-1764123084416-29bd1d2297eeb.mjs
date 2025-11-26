// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///home/project/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "/home/project";
var vite_config_default = defineConfig(({ mode }) => {
  const isTestAgentsBuild = mode === "test-agents";
  const isRemoteAgentsBuild = mode === "remote-agents";
  const isLLMBuild = mode === "llm";
  if (isTestAgentsBuild || isRemoteAgentsBuild || isLLMBuild) {
    const rollupOptions = {
      output: {
        format: "es",
        entryFileNames: "[name].agent.js"
      }
    };
    if (isTestAgentsBuild) {
      rollupOptions.input = {
        llm: path.resolve(__vite_injected_original_dirname, "src/agents/llm/mock.ts"),
        calculator: path.resolve(__vite_injected_original_dirname, "src/agents/calculator/index.ts")
      };
      rollupOptions.output.dir = path.resolve(__vite_injected_original_dirname, "dist/test-agents");
    } else if (isRemoteAgentsBuild) {
      rollupOptions.input = {
        "remote-ping": path.resolve(__vite_injected_original_dirname, "src/agents/remote-ping/index.ts")
      };
      rollupOptions.output.dir = path.resolve(__vite_injected_original_dirname, "dist/remote-agents");
    } else if (isLLMBuild) {
      rollupOptions.input = {
        llm: path.resolve(__vite_injected_original_dirname, "src/agents/llm/mock.ts")
      };
      rollupOptions.output.dir = path.resolve(__vite_injected_original_dirname, "dist/test-agents");
    }
    return {
      build: {
        emptyOutDir: false,
        rollupOptions,
        minify: false
      }
    };
  }
  return {
    server: {
      host: "0.0.0.0",
      port: 5e3,
      allowedHosts: true,
      watch: {
        ignored: ["**/node_modules/**", "**/.cache/**", "**/bun.lockb/**"]
      }
    },
    plugins: [
      react(),
      mode === "development" && componentTagger()
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src")
      }
    },
    worker: {
      format: "es"
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: void 0
        }
      }
    },
    test: {
      globals: true
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjsvLy8gPHJlZmVyZW5jZSB0eXBlcz1cInZpdGVzdFwiIC8+XG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBjb21wb25lbnRUYWdnZXIgfSBmcm9tIFwibG92YWJsZS10YWdnZXJcIjtcbmltcG9ydCB0eXBlIHsgUm9sbHVwT3B0aW9ucyB9IGZyb20gXCJyb2xsdXBcIjtcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+IHtcbiAgLy8gQnVpbGQgbW9kZSBkZXRlY3Rpb24gZm9yIGRpZmZlcmVudCBlbnRyeSBwb2ludHNcbiAgY29uc3QgaXNUZXN0QWdlbnRzQnVpbGQgPSBtb2RlID09PSBcInRlc3QtYWdlbnRzXCI7XG4gIGNvbnN0IGlzUmVtb3RlQWdlbnRzQnVpbGQgPSBtb2RlID09PSBcInJlbW90ZS1hZ2VudHNcIjtcbiAgY29uc3QgaXNMTE1CdWlsZCA9IG1vZGUgPT09IFwibGxtXCI7XG5cbiAgaWYgKGlzVGVzdEFnZW50c0J1aWxkIHx8IGlzUmVtb3RlQWdlbnRzQnVpbGQgfHwgaXNMTE1CdWlsZCkge1xuICAgIC8vIEFnZW50IGJ1aWxkIG1vZGVzIC0gdXNlIHJvbGx1cE9wdGlvbnMgZm9yIG11bHRpLWVudHJ5IGJ1aWxkc1xuICAgIGNvbnN0IHJvbGx1cE9wdGlvbnM6IFJvbGx1cE9wdGlvbnMgPSB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgZm9ybWF0OiBcImVzXCIsXG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiBcIltuYW1lXS5hZ2VudC5qc1wiLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgaWYgKGlzVGVzdEFnZW50c0J1aWxkKSB7XG4gICAgICByb2xsdXBPcHRpb25zLmlucHV0ID0ge1xuICAgICAgICBsbG06IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjL2FnZW50cy9sbG0vbW9jay50c1wiKSxcbiAgICAgICAgY2FsY3VsYXRvcjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJzcmMvYWdlbnRzL2NhbGN1bGF0b3IvaW5kZXgudHNcIiksXG4gICAgICB9O1xuICAgICAgKHJvbGx1cE9wdGlvbnMub3V0cHV0IGFzIGFueSkuZGlyID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJkaXN0L3Rlc3QtYWdlbnRzXCIpO1xuICAgIH0gZWxzZSBpZiAoaXNSZW1vdGVBZ2VudHNCdWlsZCkge1xuICAgICAgcm9sbHVwT3B0aW9ucy5pbnB1dCA9IHtcbiAgICAgICAgXCJyZW1vdGUtcGluZ1wiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcInNyYy9hZ2VudHMvcmVtb3RlLXBpbmcvaW5kZXgudHNcIiksXG4gICAgICB9O1xuICAgICAgKHJvbGx1cE9wdGlvbnMub3V0cHV0IGFzIGFueSkuZGlyID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJkaXN0L3JlbW90ZS1hZ2VudHNcIik7XG4gICAgfSBlbHNlIGlmIChpc0xMTUJ1aWxkKSB7XG4gICAgICByb2xsdXBPcHRpb25zLmlucHV0ID0ge1xuICAgICAgICBsbG06IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjL2FnZW50cy9sbG0vbW9jay50c1wiKSxcbiAgICAgIH07XG4gICAgICAocm9sbHVwT3B0aW9ucy5vdXRwdXQgYXMgYW55KS5kaXIgPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcImRpc3QvdGVzdC1hZ2VudHNcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGJ1aWxkOiB7XG4gICAgICAgIGVtcHR5T3V0RGlyOiBmYWxzZSxcbiAgICAgICAgcm9sbHVwT3B0aW9ucyxcbiAgICAgICAgbWluaWZ5OiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIC8vIERldmVsb3BtZW50L21haW4gYnVpbGQgbW9kZVxuICByZXR1cm4ge1xuICAgIHNlcnZlcjoge1xuICAgICAgaG9zdDogXCIwLjAuMC4wXCIsXG4gICAgICBwb3J0OiA1MDAwLFxuICAgICAgYWxsb3dlZEhvc3RzOiB0cnVlLFxuICAgICAgd2F0Y2g6IHtcbiAgICAgICAgaWdub3JlZDogW1wiKiovbm9kZV9tb2R1bGVzLyoqXCIsIFwiKiovLmNhY2hlLyoqXCIsIFwiKiovYnVuLmxvY2tiLyoqXCJdLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHBsdWdpbnM6IFtcbiAgICAgIHJlYWN0KCksXG4gICAgICBtb2RlID09PSBcImRldmVsb3BtZW50XCIgJiYgY29tcG9uZW50VGFnZ2VyKCksXG4gICAgXS5maWx0ZXIoQm9vbGVhbiksXG4gICAgcmVzb2x2ZToge1xuICAgICAgYWxpYXM6IHtcbiAgICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgd29ya2VyOiB7XG4gICAgICBmb3JtYXQ6ICdlcycsXG4gICAgfSxcbiAgICBidWlsZDoge1xuICAgICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgICBvdXRwdXQ6IHtcbiAgICAgICAgICBtYW51YWxDaHVua3M6IHVuZGVmaW5lZCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB0ZXN0OiB7XG4gICAgICBnbG9iYWxzOiB0cnVlLFxuICAgIH0sXG4gIH07XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFDQSxTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMsdUJBQXVCO0FBSmhDLElBQU0sbUNBQW1DO0FBUXpDLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBRXhDLFFBQU0sb0JBQW9CLFNBQVM7QUFDbkMsUUFBTSxzQkFBc0IsU0FBUztBQUNyQyxRQUFNLGFBQWEsU0FBUztBQUU1QixNQUFJLHFCQUFxQix1QkFBdUIsWUFBWTtBQUUxRCxVQUFNLGdCQUErQjtBQUFBLE1BQ25DLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLGdCQUFnQjtBQUFBLE1BQ2xCO0FBQUEsSUFDRjtBQUVBLFFBQUksbUJBQW1CO0FBQ3JCLG9CQUFjLFFBQVE7QUFBQSxRQUNwQixLQUFLLEtBQUssUUFBUSxrQ0FBVyx3QkFBd0I7QUFBQSxRQUNyRCxZQUFZLEtBQUssUUFBUSxrQ0FBVyxnQ0FBZ0M7QUFBQSxNQUN0RTtBQUNBLE1BQUMsY0FBYyxPQUFlLE1BQU0sS0FBSyxRQUFRLGtDQUFXLGtCQUFrQjtBQUFBLElBQ2hGLFdBQVcscUJBQXFCO0FBQzlCLG9CQUFjLFFBQVE7QUFBQSxRQUNwQixlQUFlLEtBQUssUUFBUSxrQ0FBVyxpQ0FBaUM7QUFBQSxNQUMxRTtBQUNBLE1BQUMsY0FBYyxPQUFlLE1BQU0sS0FBSyxRQUFRLGtDQUFXLG9CQUFvQjtBQUFBLElBQ2xGLFdBQVcsWUFBWTtBQUNyQixvQkFBYyxRQUFRO0FBQUEsUUFDcEIsS0FBSyxLQUFLLFFBQVEsa0NBQVcsd0JBQXdCO0FBQUEsTUFDdkQ7QUFDQSxNQUFDLGNBQWMsT0FBZSxNQUFNLEtBQUssUUFBUSxrQ0FBVyxrQkFBa0I7QUFBQSxJQUNoRjtBQUVBLFdBQU87QUFBQSxNQUNMLE9BQU87QUFBQSxRQUNMLGFBQWE7QUFBQSxRQUNiO0FBQUEsUUFDQSxRQUFRO0FBQUEsTUFDVjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBR0EsU0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsT0FBTztBQUFBLFFBQ0wsU0FBUyxDQUFDLHNCQUFzQixnQkFBZ0IsaUJBQWlCO0FBQUEsTUFDbkU7QUFBQSxJQUNGO0FBQUEsSUFDQSxTQUFTO0FBQUEsTUFDUCxNQUFNO0FBQUEsTUFDTixTQUFTLGlCQUFpQixnQkFBZ0I7QUFBQSxJQUM1QyxFQUFFLE9BQU8sT0FBTztBQUFBLElBQ2hCLFNBQVM7QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxNQUN0QztBQUFBLElBQ0Y7QUFBQSxJQUNBLFFBQVE7QUFBQSxNQUNOLFFBQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxPQUFPO0FBQUEsTUFDTCxlQUFlO0FBQUEsUUFDYixRQUFRO0FBQUEsVUFDTixjQUFjO0FBQUEsUUFDaEI7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLElBQ0EsTUFBTTtBQUFBLE1BQ0osU0FBUztBQUFBLElBQ1g7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
