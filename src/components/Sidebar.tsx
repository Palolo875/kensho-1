import { Menu, MessageSquarePlus, Clock, Search, Settings, User, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

interface SidebarProps {
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onNewConversation: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

const Sidebar = ({ onOpenSettings, onOpenSearch, onNewConversation, isOpen: externalIsOpen, onToggle }: SidebarProps) => {
  const isMobile = useIsMobile();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Use external state if provided (for mobile), otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;

  // Close sidebar on mobile when clicking outside
  useEffect(() => {
    if (isMobile && isOpen) {
      const handleClickOutside = (e: MouseEvent) => {
        const sidebar = document.getElementById('mobile-sidebar');
        const trigger = document.getElementById('sidebar-trigger');
        if (sidebar && !sidebar.contains(e.target as Node) && trigger && !trigger.contains(e.target as Node)) {
          if (onToggle) {
            onToggle();
          } else {
            setInternalIsOpen(false);
          }
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMobile, isOpen, onToggle]);

  // Desktop sidebar (always visible, collapsible)
  if (!isMobile) {
    return (
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border/50 flex flex-col py-6 transition-all duration-300 z-40 shadow-lg",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Toggle Button */}
        <div className={cn("flex items-center px-2 mb-4", !isCollapsed && "justify-between")}>
          {!isCollapsed && (
            <span className="text-lg font-semibold px-2">Menu</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-9 w-9 hover:bg-sidebar-accent"
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Navigation Items */}
        <div className="flex flex-col gap-2 px-2">
          <Button
            variant="ghost"
            onClick={onNewConversation}
            className={cn(
              "h-11 hover:bg-sidebar-accent/60 rounded-xl transition-all duration-200 font-light",
              isCollapsed ? "w-11 px-0" : "w-full justify-start"
            )}
          >
            <MessageSquarePlus className="h-5 w-5" />
            {!isCollapsed && <span className="ml-3">Nouvelle conversation</span>}
          </Button>

          <Button
            variant="ghost"
            onClick={onOpenSearch}
            className={cn(
              "h-11 hover:bg-sidebar-accent/60 rounded-xl transition-all duration-200 font-light",
              isCollapsed ? "w-11 px-0" : "w-full justify-start"
            )}
          >
            <Search className="h-5 w-5" />
            {!isCollapsed && <span className="ml-3">Rechercher</span>}
          </Button>

          <Button
            variant="ghost"
            className={cn(
              "h-11 hover:bg-sidebar-accent/60 rounded-xl transition-all duration-200 font-light",
              isCollapsed ? "w-11 px-0" : "w-full justify-start"
            )}
          >
            <Clock className="h-5 w-5" />
            {!isCollapsed && <span className="ml-3">Historique</span>}
          </Button>
        </div>

        <div className="flex-1" />

        {/* Bottom Actions */}
        <div className="flex flex-col gap-2 px-2">
          <Button
            variant="ghost"
            onClick={onOpenSettings}
            className={cn(
              "h-11 hover:bg-sidebar-accent/60 rounded-xl transition-all duration-200 font-light",
              isCollapsed ? "w-11 px-0" : "w-full justify-start"
            )}
          >
            <Settings className="h-5 w-5" />
            {!isCollapsed && <span className="ml-3">Paramètres</span>}
          </Button>

          <Button
            variant="ghost"
            className={cn(
              "h-11 hover:bg-sidebar-accent/60 rounded-xl transition-all duration-200 font-light",
              isCollapsed ? "w-11 px-0" : "w-full justify-start"
            )}
          >
            <User className="h-5 w-5" />
            {!isCollapsed && <span className="ml-3">Profil</span>}
          </Button>
        </div>
      </aside>
    );
  }

  // Mobile sidebar (overlay, toggled by hamburger)
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-md z-40 md:hidden"
          onClick={() => onToggle ? onToggle() : setInternalIsOpen(false)}
        />
      )}
      
      {/* Mobile sidebar */}
      <aside
        id="mobile-sidebar"
        className={cn(
          "fixed left-0 top-0 bottom-0 bg-sidebar/95 backdrop-blur-xl border-r border-sidebar-border/50 flex flex-col py-6 transition-transform duration-300 z-50 w-64 md:hidden shadow-2xl",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between px-4 mb-4">
          <span className="text-lg font-semibold">Menu</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggle ? onToggle() : setInternalIsOpen(false)}
            className="h-9 w-9 hover:bg-sidebar-accent"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation Items */}
        <div className="flex flex-col gap-2 px-2">
          <Button
            variant="ghost"
            onClick={() => {
              onNewConversation();
              onToggle ? onToggle() : setInternalIsOpen(false);
            }}
            className="h-11 hover:bg-sidebar-accent/60 w-full justify-start rounded-xl transition-all duration-200 font-light"
          >
            <MessageSquarePlus className="h-5 w-5" />
            <span className="ml-3">Nouvelle conversation</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => {
              onOpenSearch();
              onToggle ? onToggle() : setInternalIsOpen(false);
            }}
            className="h-11 hover:bg-sidebar-accent/60 w-full justify-start rounded-xl transition-all duration-200 font-light"
          >
            <Search className="h-5 w-5" />
            <span className="ml-3">Rechercher</span>
          </Button>

          <Button
            variant="ghost"
            className="h-11 hover:bg-sidebar-accent/60 w-full justify-start rounded-xl transition-all duration-200 font-light"
          >
            <Clock className="h-5 w-5" />
            <span className="ml-3">Historique</span>
          </Button>
        </div>

        <div className="flex-1" />

        {/* Bottom Actions */}
        <div className="flex flex-col gap-2 px-2">
          <Button
            variant="ghost"
            onClick={() => {
              onOpenSettings();
              onToggle ? onToggle() : setInternalIsOpen(false);
            }}
            className="h-11 hover:bg-sidebar-accent/60 w-full justify-start rounded-xl transition-all duration-200 font-light"
          >
            <Settings className="h-5 w-5" />
            <span className="ml-3">Paramètres</span>
          </Button>

          <Button
            variant="ghost"
            className="h-11 hover:bg-sidebar-accent/60 w-full justify-start rounded-xl transition-all duration-200 font-light"
          >
            <User className="h-5 w-5" />
            <span className="ml-3">Profil</span>
          </Button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
export const SidebarTrigger = ({ onClick }: { onClick: () => void }) => (
  <Button
    id="sidebar-trigger"
    variant="ghost"
    size="icon"
    onClick={onClick}
    className="h-11 w-11 md:hidden fixed top-3 left-3 z-30 hover:bg-accent/60 backdrop-blur-md bg-background/40 rounded-xl shadow-lg transition-all duration-200"
  >
    <Menu className="h-5 w-5" />
  </Button>
);
