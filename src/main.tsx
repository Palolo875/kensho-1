import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { UserPreferencesProvider } from "./contexts/UserPreferencesContext";
import { createLogger } from "@/lib/logger";

const log = createLogger('Main');

// Global error handlers for unhandled exceptions
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[Global Error Handler]', event.error || event);
    if (event.error && event.error instanceof Error) {
      log.error('Unhandled error:', event.error.message, event.error.stack);
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Promise Rejection]', event.reason);
    log.error('Unhandled promise rejection:', event.reason);
  });
}

createRoot(document.getElementById("root")!).render(
  <UserPreferencesProvider>
    <App />
  </UserPreferencesProvider>
);
