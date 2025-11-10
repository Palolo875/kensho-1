import { Plus, Mic, Paperclip, FileText, Image as ImageIcon, Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import VoiceRecorder from "./VoiceRecorder";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ChatInput = () => {
  const isMobile = useIsMobile();
  const [message, setMessage] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
  ];

  return (
    <>
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 bg-transparent",
          "px-3 sm:px-4 md:px-8 py-4 sm:py-5 md:py-6",
          !isMobile && "md:left-16 lg:left-64"
        )}
      >
        <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
          {/* Input field */}
          <div className="relative">
            <div className="bg-background/60 backdrop-blur-xl rounded-full shadow-2xl border border-border/40 overflow-hidden transition-all duration-300 hover:shadow-3xl hover:bg-background/70">
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-5 py-2.5 sm:py-3 md:py-3.5">
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

                <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-full hover:bg-accent/50 shrink-0 transition-colors"
                    >
                      <Plus className="h-5 w-5 sm:h-5 sm:w-5 md:h-5.5 md:w-5.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-56 sm:w-64 md:w-80 p-2 bg-popover/95 backdrop-blur-xl border-border/50 shadow-xl"
                    align="start"
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

                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Envoyer un message..."
                  className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm sm:text-base md:text-lg placeholder:text-muted-foreground/70 font-light"
                />

                {message ? (
                  <Button
                    size="icon"
                    className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-full shrink-0 bg-foreground text-background hover:bg-foreground/90 transition-all duration-200"
                  >
                    <Send className="h-4.5 w-4.5 sm:h-5 sm:w-5 md:h-5.5 md:w-5.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowVoiceRecorder(true)}
                    className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-full hover:bg-accent/50 shrink-0 transition-colors"
                  >
                    <Mic className="h-4.5 w-4.5 sm:h-5 sm:w-5 md:h-5.5 md:w-5.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center flex-wrap">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant="secondary"
                className="rounded-full whitespace-nowrap bg-background/40 backdrop-blur-md hover:bg-background/60 border border-border/30 text-[11px] sm:text-xs md:text-sm px-3 sm:px-4 md:px-5 h-7 sm:h-8 md:h-9 font-light transition-all duration-200 shadow-sm hover:shadow-md"
              >
                {action}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Voice Recorder Modal */}
      <Dialog open={showVoiceRecorder} onOpenChange={setShowVoiceRecorder}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Enregistrement vocal</DialogTitle>
          </DialogHeader>
          <VoiceRecorder
            onTranscript={(text) => {
              setMessage(text);
              setShowVoiceRecorder(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ChatInput;

// Import cn utility and hook
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
