import { Home, Ban, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t border-border/50">
      <div className="flex items-center justify-around px-4 py-2">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-12 w-12 hover:bg-accent"
        >
          <Home className="h-6 w-6" />
        </Button>
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-12 w-12 hover:bg-accent"
        >
          <Ban className="h-6 w-6" />
        </Button>
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-12 w-12 hover:bg-accent"
        >
          <Copy className="h-6 w-6" />
        </Button>
      </div>
    </nav>
  );
};

export default BottomNav;
