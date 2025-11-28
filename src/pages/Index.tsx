import { useState, useEffect, useRef } from "react";
import Sidebar, { SidebarTrigger } from "@/components/Sidebar";
import InputBar from "@/components/InputBar";
import WelcomeScreen from "@/components/WelcomeScreen";
import MessageBubble from "@/components/MessageBubble";
import AIResponse from "@/components/AIResponse";
import SettingsModal from "@/components/SettingsModal";
import SearchModal from "@/components/SearchModal";
import { ObservatoryModal } from "@/components/ObservatoryModal";
import { ModelLoadingView } from "@/components/ModelLoadingView";
import { ModelSelector } from "@/components/ModelSelector";
import { PlanView } from "@/components/PlanView";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { useObservatory } from "@/contexts/ObservatoryContext";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { useKenshoStore } from "@/stores/useKenshoStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Toaster } from "sonner";


const Index = () => {
  const isMobile = useIsMobile();
  const { firstName } = useUserPreferences();
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showObservatory, setShowObservatory] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { workers, leader, epoch, logs, journal, isEnabled, startObservatory, killWorker } = useObservatory();

  const init = useKenshoStore(state => state.init);
  const messages = useKenshoStore(state => state.messages);
  const clearMessages = useKenshoStore(state => state.clearMessages);
  const modelReady = useKenshoStore(state => state.modelProgress.phase === 'ready');
  const isKenshoWriting = useKenshoStore(state => state.isKenshoWriting);
  const statusMessage = useKenshoStore(state => state.statusMessage);
  const ocrProgress = useKenshoStore(state => state.ocrProgress);

  useEffect(() => {
    init();
  }, [init]);

  // Auto-scroll vers le bas quand les messages changent (streaming)
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isKenshoWriting]);

  const handleOpenObservatory = () => {
    if (!isEnabled) {
      startObservatory();
    }
    setShowObservatory(true);
  };

  const handleNewConversation = () => {
    clearMessages();
  };

  return (
    <div className="min-h-screen relative bg-background">
      {/* Model Loading Overlay */}
      <ModelLoadingView />

      {/* Top bar with new conversation button and sidebar trigger */}
      <div className="fixed top-4 left-4 right-4 z-50 flex justify-between items-center pointer-events-none">
        <Button
          onClick={handleNewConversation}
          variant="ghost"
          size="icon"
          disabled={!modelReady}
          className="pointer-events-auto hover:bg-accent/80 backdrop-blur-sm disabled:opacity-50"
        >
          <Plus className="h-6 w-6" />
        </Button>
        <div className="pointer-events-auto">
          <SidebarTrigger onClick={() => setSidebarOpen(!sidebarOpen)} />
        </div>
      </div>

      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenSearch={() => setShowSearch(true)}
        onOpenObservatory={handleOpenObservatory}
        onNewConversation={handleNewConversation}
      />

      <main className={cn(
        "transition-all duration-300 min-h-screen",
        !isMobile && "ml-16 lg:ml-64",
      )}>
        {messages.length === 0 ? (
          <div className="h-screen flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl space-y-6">
              {/* Welcome text */}
              <div className="text-center mb-4">
                <h2 className="text-foreground/80 text-xl md:text-2xl lg:text-3xl font-light mb-2 md:mb-3">
                  Hello {firstName || "there"}
                </h2>
                <h1 className="text-foreground text-2xl md:text-3xl lg:text-4xl font-normal leading-tight">
                  How can I help you today?
                </h1>
              </div>

              {/* Input Bar Centered */}
              <div className="flex justify-center">
                <div className="w-full">
                  <InputBar />
                </div>
              </div>

              {/* CTA Cards - Very Small Below */}
              <div className="flex justify-center">
                <WelcomeScreen />
              </div>
            </div>
          </div>
        ) : (
          <div className={cn(
            "pb-32 sm:pb-36 md:pb-40",
            "pt-16 md:pt-4"
          )}>
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
              {/* Sprint 7: Project Dashboard */}
              <ProjectDashboard />

              <div className="space-y-1">
                {messages.map((msg) =>
                  msg.author === 'user' ? (
                    <MessageBubble
                      key={msg.id}
                      content={msg.text}
                      isUser={true}
                    />
                  ) : (
                    <div key={msg.id}>
                      {/* Afficher le plan de réflexion s'il existe */}
                      {msg.plan && <PlanView plan={msg.plan} />}
                      <AIResponse
                        content={msg.text}
                        thinking={msg.thinking || (isKenshoWriting && msg.text === '' ? "Kensho réfléchit..." : "")}
                        statusMessage={isKenshoWriting && msg.text === '' ? statusMessage || undefined : undefined}
                        ocrProgress={isKenshoWriting && msg.text === '' && ocrProgress >= 0 ? ocrProgress : undefined}
                        thoughtProcess={msg.thoughtProcess}
                        factCheckingClaims={msg.factCheckingClaims}
                        semanticSearchResults={msg.semanticSearchResults}
                      />
                    </div>
                  )
                )}
                {/* Élément invisible pour auto-scroll */}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Input Bar - Fixed at bottom only during conversation */}
      {messages.length > 0 && (
        <div className={cn(
          "fixed bottom-0 left-0 right-0",
          "px-3 sm:px-6 md:px-8 lg:px-12 py-4 sm:py-5 md:py-6",
          !isMobile && "md:left-16 lg:left-64"
        )}>
          <div className={cn(
            "mx-auto",
            isMobile ? "max-w-2xl" : "max-w-3xl lg:max-w-4xl"
          )}>
            <InputBar />
          </div>
        </div>
      )}


      <SettingsModal 
        open={showSettings} 
        onOpenChange={setShowSettings}
        onOpenObservatory={handleOpenObservatory}
        onOpenModelSelector={() => {
          setShowSettings(false);
          setShowModelSelector(true);
        }}
      />
      <SearchModal open={showSearch} onOpenChange={setShowSearch} />
      <ObservatoryModal
        open={showObservatory}
        onOpenChange={setShowObservatory}
        workers={workers}
        leader={leader}
        epoch={epoch}
        logs={logs}
        onKillWorker={killWorker}
        journal={journal}
      />
      {showModelSelector && (
        <ModelSelector
          isOpen={showModelSelector}
          onModelSelected={() => setShowModelSelector(false)}
        />
      )}

      {/* Toast Notifications */}
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
};

export default Index;
