import { useState } from "react";
import { BookOpen, Lightbulb, FileText, Palette, PenTool, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useKenshoStore } from "@/stores/useKenshoStore";

interface ActionButton {
  id: string;
  icon: React.ReactNode;
  label: string;
  prompt: string;
}

interface WelcomeScreenProps {
  userName?: string;
}

const WelcomeScreen = ({ userName = "there" }: WelcomeScreenProps) => {
  const [pressedButton, setPressedButton] = useState<string | null>(null);
  const sendMessage = useKenshoStore(state => state.sendMessage);
  const modelReady = useKenshoStore(state => state.modelProgress.phase === 'ready');

  const actionButtons: ActionButton[] = [
    {
      id: "ideas",
      icon: <Lightbulb className="w-5 h-5 md:w-6 md:h-6" />,
      label: "Trouvez des idées",
      prompt: "Aide-moi à trouver des idées créatives"
    },
    {
      id: "summary",
      icon: <FileText className="w-5 h-5 md:w-6 md:h-6" />,
      label: "Résumez un document",
      prompt: "Aide-moi à résumer un document"
    },
    {
      id: "draft",
      icon: <PenTool className="w-5 h-5 md:w-6 md:h-6" />,
      label: "Écrivez un brouillon",
      prompt: "Aide-moi à écrire un brouillon"
    },
    {
      id: "design",
      icon: <Palette className="w-5 h-5 md:w-6 md:h-6" />,
      label: "Concevez un logo",
      prompt: "Aide-moi à concevoir un logo"
    },
    {
      id: "advice",
      icon: <Sparkles className="w-5 h-5 md:w-6 md:h-6" />,
      label: "Obtenez des conseils",
      prompt: "J'ai besoin de conseils"
    },
    {
      id: "read",
      icon: <BookOpen className="w-5 h-5 md:w-6 md:h-6" />,
      label: "Lisez-moi un livre",
      prompt: "Raconte-moi une histoire"
    },
  ];

  const handleButtonPress = (button: ActionButton) => {
    if (!modelReady) return;
    
    setPressedButton(button.id);
    setTimeout(() => {
      setPressedButton(null);
      sendMessage(button.prompt);
    }, 150);
  };

  return (
    <div className="flex flex-col items-center justify-center py-8 md:py-12 lg:py-16 px-4">
      <div className="text-center mb-8 md:mb-12 max-w-2xl">
        <h2 className="text-foreground/80 text-xl md:text-2xl lg:text-3xl font-light mb-2 md:mb-3">
          Hello {userName}
        </h2>
        <h1 className="text-foreground text-2xl md:text-3xl lg:text-4xl font-normal leading-tight mb-3 md:mb-4">
          How can I help you today?
        </h1>
        <p className="text-muted-foreground text-sm md:text-base font-normal leading-relaxed">
          Choisissez une action rapide ou posez-moi directement votre question
        </p>
      </div>

      <div className="w-full max-w-2xl">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
          {actionButtons.map((button) => (
            <button
              key={button.id}
              onClick={() => handleButtonPress(button)}
              disabled={!modelReady}
              className={cn(
                "flex flex-col items-center gap-2 md:gap-2.5",
                "bg-white/50 hover:bg-white rounded-lg md:rounded-xl",
                "px-3 md:px-4 py-3 md:py-3.5",
                "transition-all duration-200 cursor-pointer",
                "focus:outline-none focus:ring-1 focus:ring-[#888888]/40",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/50",
                "border border-[#E0E0E0]/60 hover:border-[#D0D0D0]",
                "active:scale-95",
                pressedButton === button.id && "scale-[0.98]"
              )}
              aria-label={button.label}
            >
              <span className="text-[#666666] flex-shrink-0">
                {button.icon}
              </span>
              <span className="text-[#1A1A1A] text-xs md:text-sm font-normal text-center leading-tight">
                {button.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
