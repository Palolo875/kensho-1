import { Plus, Mic, Paperclip, FileText, Image as ImageIcon, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, FormEvent, KeyboardEvent } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import VoiceRecorderInline from "./VoiceRecorderInline";
import VoiceWaveformBar from "./VoiceWaveformBar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKenshoStore } from "@/stores/useKenshoStore";

interface ChatInputProps {
  showSuggestions?: boolean;
}

const MAX_MESSAGE_LENGTH = 2000;

const ChatInput = ({ showSuggestions = false }: ChatInputProps) => {
  const isMobile = useIsMobile();
  const [message, setMessage] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [samples, setSamples] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const sendMessage = useKenshoStore(state => state.sendMessage);
  const modelReady = useKenshoStore(state => state.modelProgress.phase === 'ready');
  const isKenshoWriting = useKenshoStore(state => state.isKenshoWriting);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim() && modelReady && !isKenshoWriting) {
      sendMessage(message);
      setMessage("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Soumettre avec Enter (sans Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (message.trim() && modelReady && !isKenshoWriting) {
        sendMessage(message);
        setMessage("");
      }
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= MAX_MESSAGE_LENGTH) {
      setMessage(newValue);
    } else {
      toast({
        title: "Message trop long",
        description: `Le message ne peut pas dépasser ${MAX_MESSAGE_LENGTH} caractères`,
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (type: "file" | "image") => {
    const inputRef = type === "file" ? fileInputRef : imageInputRef;
    inputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "file" | "image") => {
    const files = e.target.files;
    if (files && files.length > 0) {
      toast({
        title: "Fichier téléchargé",
        description: `${files.length} fichier(s) ajouté(s)`,
      });
    }
  };

  const menuItems = [
    {
      icon: Paperclip,
      label: "Ajouter des fichiers",
      action: () => handleFileUpload("file"),
    },
    {
      icon: ImageIcon,
      label: "Ajouter des images",
      action: () => handleFileUpload("image"),
    },
    {
      icon: FileText,
      label: "Coller du texte",
      action: () => {
        toast({ title: "Fonction à venir" });
      },
    },
  ];

  const quickActions = [
    "Créez une image",
    "Écrivez un brouillon",
    "Concevez un logo",
    "Obtenez des conseils",
    "Résumez un document",
    "Trouvez des idées",
  ];

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 bg-transparent",
        "px-3 sm:px-6 md:px-8 lg:px-12 py-4 sm:py-5 md:py-6",
        !isMobile && "md:left-16 lg:left-64"
      )}
    >
      <div className={cn(
        "mx-auto space-y-3 sm:space-y-4",
        isMobile ? "max-w-2xl" : "max-w-3xl lg:max-w-4xl xl:max-w-5xl"
      )}>
        {/* Quick action buttons - only on home screen */}
        {showSuggestions && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center flex-wrap">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant="secondary"
                className="rounded-full whitespace-nowrap bg-background/40 backdrop-blur-md hover:bg-background/60 border border-border/30 text-xs sm:text-sm px-3 sm:px-4 md:px-5 h-8 sm:h-9 font-light transition-all duration-200 shadow-sm hover:shadow-md"
              >
                {action}
              </Button>
            ))}
          </div>
        )}

        {/* Input field */}
        <div className="relative">
          <div className={cn(
            "relative bg-background/60 backdrop-blur-xl rounded-full shadow-2xl border border-border/40 overflow-hidden transition-all duration-300 hover:shadow-3xl hover:bg-background/70",
            isRecording && "ring-2 ring-recording-active/50"
          )}>
            {isRecording && (
              <VoiceWaveformBar samples={samples} />
            )}
            <div className="relative z-10 flex items-center gap-2 sm:gap-3 px-3 sm:px-5 md:px-6 py-3 sm:py-3.5 md:py-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileChange(e, "file")}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileChange(e, "image")}
              />

              {!isRecording && (
                <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 rounded-full hover:bg-accent/50 shrink-0 transition-colors"
                    >
                      <Plus className="h-5 w-5 sm:h-5.5 sm:w-5.5 md:h-6 md:w-6" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-64 p-2 bg-background/95 backdrop-blur-xl border-border/50 shadow-xl"
                    side="top"
                  >
                    <div className="space-y-1">
                      {menuItems.map((item, index) => (
                        <button
                          key={index}
                          onClick={item.action}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary text-left text-sm text-foreground transition-colors"
                        >
                          <item.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {isRecording ? (
                <VoiceRecorderInline
                  onTranscript={(text) => {
                    setMessage(text);
                    setIsRecording(false);
                  }}
                  onStop={() => setIsRecording(false)}
                  onLevel={(level) => {
                    setSamples((prev) => {
                      const next = [...prev, level];
                      return next.length > 160 ? next.slice(next.length - 160) : next;
                    });
                  }}
                />
              ) : (
                <form onSubmit={handleSubmit} className="flex items-center gap-2 sm:gap-3 flex-1">
                  <div className="flex-1 relative">
                    <Input
                      value={message}
                      onChange={handleMessageChange}
                      onKeyDown={handleKeyDown}
                      placeholder={modelReady ? (isKenshoWriting ? "Kensho écrit..." : "Envoyer un message...") : "Chargement du modèle..."}
                      disabled={!modelReady || isKenshoWriting}
                      className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm sm:text-base md:text-lg placeholder:text-muted-foreground/70 font-light pr-12"
                    />
                    {message.length > MAX_MESSAGE_LENGTH * 0.8 && (
                      <span className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 text-xs",
                        message.length >= MAX_MESSAGE_LENGTH ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {message.length}/{MAX_MESSAGE_LENGTH}
                      </span>
                    )}
                  </div>

                  {message ? (
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!modelReady || isKenshoWriting}
                      className="h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 rounded-full shrink-0 bg-foreground text-background hover:bg-foreground/90 transition-all duration-200 disabled:opacity-50"
                    >
                      <Send className="h-5 w-5 sm:h-5.5 sm:w-5.5 md:h-6 md:w-6" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => { setSamples([]); setIsRecording(true); }}
                      disabled={!modelReady}
                      className="h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 rounded-full hover:bg-accent/50 shrink-0 transition-colors disabled:opacity-50"
                    >
                      <Mic className="h-5 w-5 sm:h-5.5 sm:w-5.5 md:h-6 md:w-6" />
                    </Button>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
export type { ChatInputProps };
