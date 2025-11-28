import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ThemeToggle from "./ThemeToggle";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { useKenshoStore } from "@/stores/useKenshoStore";
import { useNavigate } from "react-router-dom";
import { Download, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenObservatory?: () => void;
  onOpenModelSelector?: () => void;
}

type TabType = "settings" | "usage" | "tasks";

const SettingsModal = ({ open, onOpenChange, onOpenObservatory, onOpenModelSelector }: SettingsModalProps) => {
  const navigate = useNavigate();
  const { firstName, setFirstName, welcomeMessage, setWelcomeMessage } = useUserPreferences();
  const isDebateModeEnabled = useKenshoStore(state => state.isDebateModeEnabled);
  const setDebateModeEnabled = useKenshoStore(state => state.setDebateModeEnabled);
  const [activeTab, setActiveTab] = useState<TabType>("settings");
  const [language, setLanguage] = useState("fr");
  const [theme, setTheme] = useState("system");
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [saveHistory, setSaveHistory] = useState(true);
  const [showThinking, setShowThinking] = useState(true);
  const [exclusiveContent, setExclusiveContent] = useState(false);
  const [tempFirstName, setTempFirstName] = useState(firstName);
  const [tempWelcomeMessage, setTempWelcomeMessage] = useState(welcomeMessage || "");

  const tabs = [
    { id: "settings" as TabType, label: "Paramètres" },
    { id: "usage" as TabType, label: "Utilisation" },
    { id: "tasks" as TabType, label: "Tâches" },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "settings":
        return (
          <div className="space-y-6">
            {/* General Section */}
            <div>
              <h4 className="text-base font-light mb-4 text-foreground">Général</h4>
              <div>
                <Label htmlFor="language" className="text-sm font-light mb-2 block text-foreground">
                  Langue
                </Label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border/50 rounded-lg text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all duration-200"
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>
            </div>

            <Separator className="bg-border/30" />

            {/* Appearance Section */}
            <div>
              <h4 className="text-base font-light mb-4 text-foreground">Apparence</h4>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "light", label: "Clair" },
                  { id: "dark", label: "Sombre" },
                  { id: "system", label: "Système" },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setTheme(option.id)}
                    className={cn(
                      "p-3 rounded-lg border-2 transition-all duration-200",
                      theme === option.id
                        ? "border-primary/60 bg-primary/15"
                        : "border-border/40 bg-card hover:border-border/60"
                    )}
                  >
                    <span className="text-xs font-medium text-foreground">{option.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-card border border-border/30">
                <span className="text-sm text-foreground">Thème automatique</span>
                <ThemeToggle />
              </div>
            </div>

            <Separator className="bg-border/30" />

            {/* Customization Section */}
            <div>
              <h4 className="text-base font-light mb-4 text-foreground">Personnalisation</h4>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="firstName" className="text-sm font-light mb-2 block text-foreground">
                    Votre prénom
                  </Label>
                  <Input
                    id="firstName"
                    value={tempFirstName}
                    onChange={(e) => setTempFirstName(e.target.value)}
                    placeholder="Ex: Jean"
                    className="w-full px-3 py-2 bg-background border border-border/50 rounded-lg text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all duration-200"
                  />
                </div>
                <div>
                  <Label htmlFor="welcomeMessage" className="text-sm font-light mb-2 block text-foreground">
                    Message d'accueil personnalisé
                  </Label>
                  <textarea
                    id="welcomeMessage"
                    value={tempWelcomeMessage}
                    onChange={(e) => setTempWelcomeMessage(e.target.value)}
                    placeholder="Ex: Bonjour, comment puis-je vous aider aujourd'hui ?"
                    rows={3}
                    className="w-full px-3 py-2 bg-background border border-border/50 rounded-lg text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all duration-200 resize-none"
                  />
                </div>
                <Button
                  onClick={() => {
                    setFirstName(tempFirstName);
                    setWelcomeMessage(tempWelcomeMessage);
                  }}
                  className="w-full bg-primary/80 hover:bg-primary text-primary-foreground"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Enregistrer les modifications
                </Button>
                <Separator className="bg-border/30" />
                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/30">
                  <div>
                    <p className="text-sm font-light text-foreground">Contenu exclusif</p>
                    <p className="text-xs text-muted-foreground mt-1">Recevoir du contenu premium</p>
                  </div>
                  <Switch
                    checked={exclusiveContent}
                    onCheckedChange={setExclusiveContent}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/30">
                  <div>
                    <p className="text-sm font-light text-foreground">Historique</p>
                    <p className="text-xs text-muted-foreground mt-1">Sauvegarder l'historique</p>
                  </div>
                  <Switch
                    checked={saveHistory}
                    onCheckedChange={setSaveHistory}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/30">
                  <div>
                    <p className="text-sm font-light text-foreground">Réflexion</p>
                    <p className="text-xs text-muted-foreground mt-1">Afficher le processus de pensée</p>
                  </div>
                  <Switch
                    checked={showThinking}
                    onCheckedChange={setShowThinking}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/30">
                  <div>
                    <p className="text-sm font-light text-foreground">Mode Débat</p>
                    <p className="text-xs text-muted-foreground mt-1">Débat Léo vs Athéna (meilleure qualité)</p>
                  </div>
                  <Switch
                    checked={isDebateModeEnabled}
                    onCheckedChange={setDebateModeEnabled}
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-border/30" />

            {/* Audio Section */}
            <div>
              <h4 className="text-base font-light mb-4 text-foreground">Audio</h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/30">
                  <div>
                    <p className="text-sm font-light text-foreground">Lecture automatique</p>
                    <p className="text-xs text-muted-foreground mt-1">Lire les réponses à haute voix</p>
                  </div>
                  <Switch
                    checked={autoPlayEnabled}
                    onCheckedChange={setAutoPlayEnabled}
                  />
                </div>
                <div>
                  <Label htmlFor="voice" className="text-sm font-light mb-2 block text-foreground">
                    Voix
                  </Label>
                  <select
                    id="voice"
                    className="w-full px-3 py-2 bg-background border border-border/50 rounded-lg text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all duration-200"
                  >
                    <option value="fr-female">Française (Femme)</option>
                    <option value="fr-male">Française (Homme)</option>
                    <option value="en-female">English (Female)</option>
                    <option value="en-male">English (Male)</option>
                  </select>
                </div>
              </div>
            </div>

            <Separator className="bg-border/30" />

            {/* Model Section */}
            <div>
              <h4 className="text-base font-light mb-4 text-foreground">Modèle</h4>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenModelSelector?.();
                  onOpenChange(false);
                }}
                className="w-full justify-center"
              >
                <Download className="h-4 w-4 mr-2" />
                Changer de modèle
              </Button>
            </div>
          </div>
        );

      case "usage":
        return (
          <div className="space-y-6">
            {/* Usage Stats */}
            <div>
              <h4 className="text-base font-light mb-4 text-foreground">Utilisation</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded-lg bg-card border border-border/30">
                  <span className="text-sm text-foreground">Conversations ce mois</span>
                  <span className="text-sm font-semibold text-foreground">42</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-card border border-border/30">
                  <span className="text-sm text-foreground">Tokens utilisés</span>
                  <span className="text-sm font-semibold text-foreground">125,430</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-card border border-border/30">
                  <span className="text-sm text-foreground">Temps moyen de réponse</span>
                  <span className="text-sm font-semibold text-foreground">1.2s</span>
                </div>
              </div>
            </div>

            <Separator className="bg-border/30" />

            {/* Storage */}
            <div>
              <h4 className="text-base font-light mb-4 text-foreground">Stockage</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-foreground">Espace utilisé</span>
                    <span className="text-sm text-muted-foreground">245 MB / 2 GB</span>
                  </div>
                  <div className="w-full h-2 bg-background rounded-full overflow-hidden border border-border/30">
                    <div className="h-full w-1/4 bg-primary/60 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "tasks":
        return (
          <div className="space-y-6">
            {/* Tools Section */}
            <div>
              <h4 className="text-base font-light mb-4 text-foreground">Outils</h4>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    onOpenObservatory?.();
                    onOpenChange(false);
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-lg bg-card border border-border/30 hover:border-border/60 hover:bg-card/60 transition-all duration-200"
                >
                  <div className="text-left">
                    <div className="font-light text-sm text-foreground">Observatory</div>
                    <div className="text-xs text-muted-foreground mt-1">Surveillance des agents en temps réel</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    navigate('/analytics');
                    onOpenChange(false);
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-lg bg-card border border-border/30 hover:border-border/60 hover:bg-card/60 transition-all duration-200"
                >
                  <div className="text-left">
                    <div className="font-light text-sm text-foreground">Analytics</div>
                    <div className="text-xs text-muted-foreground mt-1">Métriques de performance détaillées</div>
                  </div>
                </button>
              </div>
            </div>

          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl backdrop-blur-md bg-background/95 border border-border/40 shadow-xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/30">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Paramètres</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Personnalisez votre expérience
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-2 hover:bg-accent/60 transition-colors duration-200"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>

        {/* Tabs Navigation */}
        <div className="flex gap-0 px-6 pt-4 border-b border-border/30">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-3 text-sm font-light border-b-2 transition-all duration-200",
                activeTab === tab.id
                  ? "border-primary/60 text-foreground"
                  : "border-transparent text-muted-foreground/70 hover:text-muted-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto flex-1 px-6 py-6">
          {renderTabContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
