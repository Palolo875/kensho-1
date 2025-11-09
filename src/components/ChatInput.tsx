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
          "fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t border-border",
          "px-3 sm:px-4 md:px-8 py-3 sm:py-4 md:py-6",
          !isMobile && "md:left-16 lg:left-64"
        )}
      >
        <div className="max-w-4xl mx-auto space-y-2 sm:space-y-3 md:space-y-4">
          {/* Input field */}
          <div className="relative">
            <div className="bg-card rounded-xl sm:rounded-2xl md:rounded-3xl shadow-lg border border-border overflow-hidden">
              <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-2 md:py-3">
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
                      className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 rounded-full hover:bg-secondary shrink-0"
                    >
                      <Plus className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-56 sm:w-64 md:w-80 p-2 bg-popover border-border"
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
                  placeholder="Écrivez votre message..."
                  className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-xs sm:text-sm md:text-base placeholder:text-muted-foreground"
                />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowVoiceRecorder(true)}
                  className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 rounded-full hover:bg-secondary shrink-0"
                >
                  <Mic className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5" />
                </Button>

                {message && (
                  <Button
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 rounded-full shrink-0"
                  >
                    <Send className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center flex-wrap">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant="secondary"
                className="rounded-full whitespace-nowrap bg-secondary hover:bg-secondary/80 border border-border/50 text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 md:px-4 h-6 sm:h-7 md:h-8"
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
