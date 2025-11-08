import { Menu, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";

const ChatHeader = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border/50">
      <div className="flex items-center justify-between px-4 py-3">
        <Button variant="ghost" size="icon" className="hover:bg-accent">
          <Menu className="h-6 w-6" />
        </Button>
        <h1 className="text-lg font-medium">Nouvelle conversation</h1>
        <Button variant="ghost" size="icon" className="hover:bg-accent">
          <Edit3 className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
};

export default ChatHeader;
