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
          "bg-[#F5F0E8] rounded-3xl",
          "px-4 md:px-5 lg:px-6 py-4 md:py-5",
          "min-h-[120px] flex flex-col justify-between",
          "shadow-lg transition-shadow duration-200",
          "focus-within:shadow-xl"
        )}
      >
        {attachedFile && (
          <div className="flex items-center gap-2 mb-3 px-2 py-2 bg-white/50 rounded-xl">
            <Paperclip className="h-4 w-4 text-[#888888]" />
            <span className="text-sm text-[#1A1A1A] truncate flex-1 max-w-[200px]">
              {attachedFile.file.name}
            </span>
            <button
              type="button"
              onClick={detachFile}
              className="h-6 w-6 rounded-full bg-[#E8E8E8] flex items-center justify-center hover:bg-[#D0D0D0] transition-colors"
            >
              <X className="h-3 w-3 text-[#888888]" />
            </button>
          </div>
        )}

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Paperclip className="h-4 w-4 text-[#888888]" />
              <span className="text-sm text-[#1A1A1A]">Chargement...</span>
              <span className="text-xs text-[#888888] ml-auto">{uploadProgress.toFixed(0)}%</span>
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
                "text-[#1A1A1A] text-base md:text-lg",
                "placeholder:text-[#1A1A1A]/70",
                "focus:outline-none focus:ring-0",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "font-normal leading-relaxed",
                "min-h-[24px] max-h-[200px]"
              )}
              style={{ overflow: message.length > 100 ? 'auto' : 'hidden' }}
            />

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-3 md:gap-4">
                <button
                  type="button"
                  onClick={handlePlusClick}
                  className={cn(
                    "w-11 h-11 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full",
                    "bg-[#E8E8E8] flex items-center justify-center",
                    "transition-all duration-200",
                    "hover:opacity-100 hover:scale-105 opacity-80",
                    "focus:outline-none focus:ring-2 focus:ring-[#888888]/50",
                    "active:scale-95"
                  )}
                  aria-label="Plus d'options"
                >
                  <Plus className="w-5 h-5 md:w-6 md:h-6 text-[#888888]" />
                </button>

                <button
                  type="button"
                  onClick={handleAttachmentClick}
                  className={cn(
                    "w-11 h-11 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full",
                    "bg-[#E8E8E8] flex items-center justify-center",
                    "transition-all duration-200",
                    "hover:opacity-100 hover:scale-105 opacity-80",
                    "focus:outline-none focus:ring-2 focus:ring-[#888888]/50",
                    "active:scale-95"
                  )}
                  aria-label="Joindre un fichier"
                >
                  <Paperclip className="w-5 h-5 md:w-6 md:h-6 text-[#888888]" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileChange}
                  accept="application/pdf,image/png,image/jpeg,image/jpg"
                />
              </div>

              <div className="flex items-center gap-3 md:gap-4">
                <button
                  type="button"
                  onClick={handleMicClick}
                  disabled={!modelReady}
                  className={cn(
                    "w-11 h-11 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full",
                    "bg-[#E8E8E8] flex items-center justify-center",
                    "transition-all duration-200",
                    "hover:opacity-100 hover:scale-105 opacity-80",
                    "focus:outline-none focus:ring-2 focus:ring-[#888888]/50",
                    "active:scale-95",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                  aria-label="Enregistrement vocal"
                >
                  <Mic className="w-5 h-5 md:w-6 md:h-6 text-[#888888]" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={!canSend}
                  className={cn(
                    "w-11 h-11 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full",
                    "bg-[#000000] flex items-center justify-center",
                    "transition-all duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-[#000000]/50",
                    canSend 
                      ? "opacity-100 cursor-pointer hover:bg-[#222222] hover:scale-108 active:scale-95" 
                      : "opacity-50 cursor-not-allowed"
                  )}
                  aria-label="Envoyer le message"
                >
                  <ArrowUp className="w-5 h-5 md:w-6 md:h-6 text-white" />
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
