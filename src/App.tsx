import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ObservatoryProvider } from "@/contexts/ObservatoryContext";
import { ModelSelector } from "@/components/ModelSelector";
import Index from "./pages/Index";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import { useEffect, useState } from "react";

const queryClient = new QueryClient();

const App = () => {
  const [modelSelected, setModelSelected] = useState(false);

  useEffect(() => {
    const selectedModel = localStorage.getItem('kensho_selected_model');
    if (selectedModel) {
      setModelSelected(true);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ObservatoryProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {!modelSelected && (
            <ModelSelector 
              isOpen={!modelSelected}
              onModelSelected={() => setModelSelected(true)}
            />
          )}
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/analytics" element={<Analytics />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ObservatoryProvider>
    </QueryClientProvider>
  );
};

export default App;
