import { Plus, Mic, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const ChatInput = () => {
  const [message, setMessage] = useState("");

  return (
    <div className="fixed bottom-20 left-0 right-0 px-4 pb-4">
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Quick action buttons */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <Button 
            variant="secondary" 
            className="rounded-full whitespace-nowrap bg-card hover:bg-accent border border-border/50 shadow-sm"
          >
            premier brouillon
          </Button>
          <Button 
            variant="secondary" 
            className="rounded-full whitespace-nowrap bg-card hover:bg-accent border border-border/50 shadow-sm"
          >
            Créez une image
          </Button>
        </div>

        {/* Input field */}
        <div className="relative">
          <div className="flex items-center gap-2 bg-card rounded-full px-4 py-3 shadow-lg border border-border/50">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 rounded-full hover:bg-accent"
            >
              <Plus className="h-5 w-5" />
            </Button>
            
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Envoyer un message..."
              className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
            />
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 rounded-full hover:bg-accent"
            >
              <Mic className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
