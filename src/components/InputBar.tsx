import { useState, useRef, FormEvent, KeyboardEvent, useEffect } from "react";
import { Plus, Paperclip, Mic, ArrowUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useKenshoStore } from "@/stores/useKenshoStore";
import VoiceRecorderInline from "./VoiceRecorderInline";
import { Progress } from "./ui/progress";

interface InputBarProps {
  className?: string;
}

const MAX_MESSAGE_LENGTH = 2000;

const InputBar = ({ className }: InputBarProps) => {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const sendMessage = useKenshoStore(state => state.sendMessage);
  const modelReady = useKenshoStore(state => state.modelProgress.phase === 'ready');
  const isKenshoWriting = useKenshoStore(state => state.isKenshoWriting);
  const attachFile = useKenshoStore(state => state.attachFile);
  const detachFile = useKenshoStore(state => state.detachFile);
  const attachedFile = useKenshoStore(state => state.attachedFile);
  const uploadProgress = useKenshoStore(state => state.uploadProgress);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [message]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const hasMessage = message.trim().length > 0;
    const hasFile = attachedFile !== null;
    
    if ((hasMessage || hasFile) && modelReady && !isKenshoWriting) {
      let messageToSend = message.trim();
      
      if (hasFile && !hasMessage) {
        messageToSend = `[Fichier attaché: ${attachedFile.file.name}]`;
      } else if (hasFile && hasMessage) {
        messageToSend = `${message.trim()} [Fichier: ${attachedFile.file.name}]`;
      }
      
      sendMessage(messageToSend);
      setMessage("");
      
      if (hasFile) {
        detachFile();
      }
      
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const hasMessage = message.trim().length > 0;
      const hasFile = attachedFile !== null;
      if ((hasMessage || hasFile) && modelReady && !isKenshoWriting) {
        handleSubmit();
      }
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

  const handlePlusClick = () => {
    toast({
      title: "Fonctionnalité à venir",
      description: "Cette fonctionnalité sera bientôt disponible",
    });
  };

  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      attachFile(e.target.files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMicClick = () => {
    setIsRecording(true);
  };

  const isDisabled = !modelReady || isKenshoWriting;
  const hasContent = message.trim().length > 0 || attachedFile !== null;
  const canSend = hasContent && !isDisabled;

  return (
    <div className={cn("w-full", className)}>
      <div 
        className={cn(
          "bg-secondary/80 rounded-3xl",
          "px-4 md:px-5 lg:px-6 py-4 md:py-5",
          "min-h-[120px] flex flex-col justify-between",
          "shadow-xl transition-all duration-300 hover:shadow-2xl",
          "focus-within:shadow-2xl border border-border/50 hover:border-border/60",
          "backdrop-blur-md"
        )}
      >
        {attachedFile && (
          <div className="flex items-center gap-2 mb-3 px-2 py-2 bg-card/50 rounded-xl border border-border/30">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-foreground truncate flex-1 max-w-[200px]">
              {attachedFile.file.name}
            </span>
            <button
              type="button"
              onClick={detachFile}
              className="h-6 w-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        )}

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Chargement...</span>
              <span className="text-xs text-muted-foreground ml-auto">{uploadProgress.toFixed(0)}%</span>
            </div>
            <Progress value={uploadProgress} className="h-1" />
          </div>
        )}

        {isRecording ? (
          <div className="flex-1 flex items-center justify-center">
            <VoiceRecorderInline
              onTranscript={(text) => {
                setMessage(text);
                setIsRecording(false);
              }}
              onStop={() => setIsRecording(false)}
              onLevel={() => {}}
            />
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask à kensho......"
              disabled={isDisabled}
              rows={1}
              className={cn(
                "w-full bg-transparent border-0 resize-none",
                "text-foreground text-base md:text-lg",
                "placeholder:text-foreground/60",
                "focus:outline-none focus:ring-0",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "font-normal leading-relaxed",
                "min-h-[24px] max-h-[200px]"
              )}
              style={{ overflow: message.length > 100 ? 'auto' : 'hidden' }}
            />

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={handlePlusClick}
                  className={cn(
                    "w-9 h-9 md:w-10 md:h-10 rounded-full",
                    "bg-muted flex items-center justify-center",
                    "transition-all duration-200",
                    "hover:bg-muted/70 opacity-80 hover:opacity-100",
                    "focus:outline-none focus:ring-1 focus:ring-ring/30",
                    "active:scale-95 cursor-pointer"
                  )}
                  aria-label="Plus d'options"
                >
                  <Plus className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                </button>

                <button
                  type="button"
                  onClick={handleAttachmentClick}
                  className={cn(
                    "w-9 h-9 md:w-10 md:h-10 rounded-full",
                    "bg-muted flex items-center justify-center",
                    "transition-all duration-200",
                    "hover:bg-muted/70 opacity-80 hover:opacity-100",
                    "focus:outline-none focus:ring-1 focus:ring-ring/30",
                    "active:scale-95 cursor-pointer"
                  )}
                  aria-label="Joindre un fichier"
                >
                  <Paperclip className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileChange}
                  accept="application/pdf,image/png,image/jpeg,image/jpg"
                />
              </div>

              <div className="flex items-center gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={handleMicClick}
                  disabled={!modelReady}
                  className={cn(
                    "w-9 h-9 md:w-10 md:h-10 rounded-full",
                    "bg-muted flex items-center justify-center",
                    "transition-all duration-200",
                    "hover:bg-muted/70 opacity-80 hover:opacity-100",
                    "focus:outline-none focus:ring-1 focus:ring-ring/30",
                    "active:scale-95",
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-muted"
                  )}
                  aria-label="Enregistrement vocal"
                >
                  <Mic className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={!canSend}
                  className={cn(
                    "w-9 h-9 md:w-10 md:h-10 rounded-full",
                    "bg-accent flex items-center justify-center",
                    "transition-all duration-200",
                    "focus:outline-none focus:ring-1 focus:ring-ring/30",
                    canSend 
                      ? "opacity-100 cursor-pointer hover:bg-accent/90 active:scale-95" 
                      : "opacity-50 cursor-not-allowed"
                  )}
                  aria-label="Envoyer le message"
                >
                  <ArrowUp className="w-4 h-4 md:w-5 md:h-5 text-accent-foreground" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InputBar;
