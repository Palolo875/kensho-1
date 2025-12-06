import { useEffect } from "react";
import { useKenshoStore } from "@/stores/useKenshoStore";

// Type pour le contexte
type ContextType = 'CODING' | 'DASHBOARD' | 'WRITING';

const UIController = () => {
  const worker = useKenshoStore(state => state.worker);

  // Simule un changement de contexte de l'utilisateur
  const simulateContextChange = (context: ContextType) => {
    console.log(`[UI] L'utilisateur est maintenant dans un contexte de : ${context}`);
    
    if (worker) {
      worker.postMessage({ type: 'context-changed', payload: { context } });
    }
  };

  // Simulation automatique après 5 secondes
  useEffect(() => {
    const timer = setTimeout(() => {
      simulateContextChange('CODING');
    }, 5000);

    return () => clearTimeout(timer);
  }, [worker]);

  return null; // Composant sans rendu visuel
};

export default UIController;