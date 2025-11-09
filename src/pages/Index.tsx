import { useState } from "react";
import Sidebar, { SidebarTrigger } from "@/components/Sidebar";
import ChatInput from "@/components/ChatInput";
import TimeBasedGreeting from "@/components/TimeBasedGreeting";
import MessageBubble from "@/components/MessageBubble";
import AIResponse from "@/components/AIResponse";
import SettingsModal from "@/components/SettingsModal";
import SearchModal from "@/components/SearchModal";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const Index = () => {
  const isMobile = useIsMobile();
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Demo messages
  const [messages, setMessages] = useState([
    {
      id: 1,
      isUser: false,
      content: "Bienvenue ! Je suis votre assistant IA. Comment puis-je vous aider aujourd'hui ?",
      thinking: "Analyse de la requête utilisateur... Identification du contexte... Préparation de la réponse optimale basée sur les informations disponibles et l'historique de la conversation.",
    },
    {
      id: 2,
      isUser: true,
      content: "Peux-tu m'aider à comprendre les concepts de base de React ?",
    },
    {
      id: 3,
      isUser: false,
      content: "Bien sûr ! React est une bibliothèque JavaScript pour créer des interfaces utilisateur. Les concepts clés incluent les composants, les props, le state et les hooks. Voulez-vous que j'explique l'un de ces concepts en détail ?",
      thinking: "Évaluation de la complexité de la question... Structuration de la réponse pour être claire et concise... Proposition de suivi pour approfondir le sujet.",
    },
  ]);

  const handleNewConversation = () => {
    setMessages([]);
  };

  return (
    <div className="min-h-screen relative bg-background">
      {/* Sidebar trigger for mobile */}
      <SidebarTrigger onClick={() => setSidebarOpen(!sidebarOpen)} />
      
      <Sidebar 
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenSearch={() => setShowSearch(true)}
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
                msg.isUser ? (
                  <MessageBubble
                    key={msg.id}
                    content={msg.content}
                    isUser={msg.isUser}
                  />
                ) : (
                  <AIResponse
                    key={msg.id}
                    content={msg.content}
                    thinking={msg.thinking}
                  />
                )
              )}
            </div>
          )}
        </div>
      </main>

      <ChatInput />
      
      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
      <SearchModal open={showSearch} onOpenChange={setShowSearch} />
    </div>
  );
};

export default Index;
