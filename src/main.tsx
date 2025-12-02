import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { UserPreferencesProvider } from "./contexts/UserPreferencesContext";
import { createLogger } from "@/lib/logger";

const log = createLogger('Main');

// Global error handlers for unhandled exceptions
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // Convert non-Error objects to proper Error format for logging
    const errorInfo = event.error instanceof Error 
      ? { message: event.error.message, stack: event.error.stack }
      : { 
          message: event.message || 'Unknown error',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          type: 'ErrorEvent'
        };
    
    // Only log if it's a real error (not a WASM module loading event)
    if (event.error || event.message) {
      log.error('Unhandled error:', JSON.stringify(errorInfo));
    }
    
    // Prevent the error from propagating (suppress noisy WASM errors)
    if (!event.error && event.isTrusted) {
      event.preventDefault();
      return true;
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    // Normalize rejection reason to Error
    const reason = event.reason;
    const errorMessage = reason instanceof Error 
      ? reason.message 
      : typeof reason === 'string' 
        ? reason 
        : JSON.stringify(reason);
    
    log.error('Unhandled promise rejection:', errorMessage);
    
    // Prevent propagation of non-critical rejections (e.g., WASM loading)
    if (reason && typeof reason === 'object' && 'isTrusted' in reason) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <UserPreferencesProvider>
    <App />
  </UserPreferencesProvider>
);
