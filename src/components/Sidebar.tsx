import { Menu, MessageSquarePlus, Clock, Search, Settings, User, ChevronLeft, ChevronRight, X, Activity, FolderOpen, Plus, BarChart3, ChevronDown, Zap, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProjects } from "@/hooks/useProjects";
import { useKenshoStore } from "@/stores/useKenshoStore";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { useNavigate } from "react-router-dom";

interface SidebarProps {
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenObservatory: () => void;
  onNewConversation: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

const Sidebar = ({ onOpenSettings, onOpenSearch, onOpenObservatory, onNewConversation, isOpen: externalIsOpen, onToggle }: SidebarProps) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const sendMessage = useKenshoStore(state => state.sendMessage);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [factCheckingExpanded, setFactCheckingExpanded] = useState(false);
  const { projects, activeProjectId, setActiveProjectId } = useProjects();

  // Fact-checking examples
  const factCheckingExamples = [
    'Paris est la capitale de la France',
    'La Terre est plate',
    'L\'eau bout à 100°C',
    'La gravité attire les objets',
  ];

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(projectSearchTerm.toLowerCase())
  );

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

        {/* Sprint 7: Projects Section */}
        {!isCollapsed && (
          <div className="px-2 my-4 flex-1 overflow-hidden flex flex-col">
            <div className="mb-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold px-2 text-muted-foreground">Projets</h3>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => setShowCreateProject(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Input
                type="text"
                placeholder="Rechercher..."
                value={projectSearchTerm}
                onChange={(e) => setProjectSearchTerm(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <nav className="flex-1 overflow-y-auto">
              <div className="space-y-1">
                {filteredProjects.map(project => (
                  <button
                    key={project.id}
                    onClick={() => setActiveProjectId(project.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                      project.id === activeProjectId
                        ? "bg-primary/20 text-primary font-medium"
                        : "hover:bg-sidebar-accent/60"
                    )}
                  >
                    <FolderOpen className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}
                {filteredProjects.length === 0 && (
                  <p className="text-xs text-muted-foreground italic px-3 py-2">
                    Aucun projet trouvé
                  </p>
                )}
              </div>
            </nav>
          </div>
        )}

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

        {/* Create Project Dialog */}
        <CreateProjectDialog open={showCreateProject} onOpenChange={setShowCreateProject} />
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
