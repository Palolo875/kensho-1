import { useState, useEffect } from "react";
import Sidebar, { SidebarTrigger } from "@/components/Sidebar";
import ChatInput from "@/components/ChatInput";
import TimeBasedGreeting from "@/components/TimeBasedGreeting";
import MessageBubble from "@/components/MessageBubble";
import AIResponse from "@/components/AIResponse";
import SettingsModal from "@/components/SettingsModal";
import SearchModal from "@/components/SearchModal";
import { ObservatoryModal } from "@/components/ObservatoryModal";
import { ModelLoadingView } from "@/components/ModelLoadingView";
import { useObservatory } from "@/contexts/ObservatoryContext";
import { useKenshoStore } from "@/stores/useKenshoStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const Index = () => {
  const isMobile = useIsMobile();
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showObservatory, setShowObservatory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { workers, leader, epoch, logs, isEnabled, startObservatory, killWorker } = useObservatory();

  const init = useKenshoStore(state => state.init);
  const messages = useKenshoStore(state => state.messages);
  const clearMessages = useKenshoStore(state => state.clearMessages);
  const modelReady = useKenshoStore(state => state.modelProgress.phase === 'ready');

  useEffect(() => {
    init();
  }, [init]);

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
        "pb-32 sm:pb-36 md:pb-40",
        !isMobile && "ml-16 lg:ml-64",
        "pt-16 md:pt-4"
      )}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          {messages.length === 0 ? (
            <TimeBasedGreeting />
          ) : (
            <div className="space-y-1">
              {messages.map((msg) =>
                msg.author === 'user' ? (
                  <MessageBubble
                    key={msg.id}
                    content={msg.text}
                    isUser={true}
                  />
                ) : (
                  <AIResponse
                    key={msg.id}
                    content={msg.text}
                    thinking=""
                  />
                )
              )}
            </div>
          )}
        </div>
      </main>

      <ChatInput showSuggestions={messages.length === 0} />

      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
      <SearchModal open={showSearch} onOpenChange={setShowSearch} />
      <ObservatoryModal
        open={showObservatory}
        onOpenChange={setShowObservatory}
        workers={workers}
        leader={leader}
        epoch={epoch}
        logs={logs}
        onKillWorker={killWorker}
      />
    </div>
  );
};

export default Index;
