/**
 * src/pages/GemmaChat.tsx
 * 
 * Page dédiée pour le chat Gemma 3 270m
 * Affiche KenshoChat en fullscreen
 */

import Sidebar, { SidebarTrigger } from "@/components/Sidebar";
import { KenshoChat } from "@/components/KenshoChat";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";

const GemmaChat = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen relative bg-background">
      {/* Top bar with back button and sidebar trigger */}
      <div className="fixed top-4 left-4 right-4 z-50 flex justify-between items-center pointer-events-none">
        <div className="pointer-events-auto">
          <Button
            onClick={() => navigate('/')}
            variant="ghost"
            size="icon"
            className="hover:bg-accent/80 backdrop-blur-sm"
            title="Retour à Kensho"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
        </div>
        <h1 className="text-lg font-semibold">💬 Chat AI</h1>
        <div className="pointer-events-auto">
          <SidebarTrigger onClick={() => setSidebarOpen(!sidebarOpen)} />
        </div>
      </div>

      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onOpenSettings={() => {}}
        onOpenSearch={() => {}}
        onOpenObservatory={() => {}}
        onNewConversation={() => {}}
      />

      <main className={cn(
        "transition-all duration-300 min-h-screen",
        !isMobile && "ml-16 lg:ml-64",
        "pt-16"
      )}>
        <KenshoChat />
      </main>
    </div>
  );
};

export default GemmaChat;
