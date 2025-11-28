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

const WelcomeScreen = () => {
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
    <div className="w-full">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 md:gap-2">
        {actionButtons.map((button) => (
          <button
            key={button.id}
            onClick={() => handleButtonPress(button)}
            disabled={!modelReady}
            className={cn(
              "flex flex-col items-center gap-1",
              "bg-card/60 hover:bg-card rounded-md",
              "px-1.5 md:px-2 py-1.5 md:py-2",
              "transition-all duration-300 cursor-pointer",
              "focus:outline-none focus:ring-0.5 focus:ring-ring/30",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card/60",
              "border border-border/30 hover:border-border/50",
              "shadow-sm hover:shadow-md",
              "active:scale-95",
              pressedButton === button.id && "scale-[0.98]"
            )}
            aria-label={button.label}
          >
            <span className="text-muted-foreground flex-shrink-0 w-4 h-4 md:w-5 md:h-5">
              {button.icon}
            </span>
            <span className="text-foreground text-[10px] md:text-xs font-normal text-center leading-tight line-clamp-1">
              {button.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default WelcomeScreen;
