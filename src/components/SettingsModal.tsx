import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ThemeToggle from "./ThemeToggle";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { useKenshoStore } from "@/stores/useKenshoStore";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenObservatory?: () => void;
  onOpenModelSelector?: () => void;
}

const SettingsModal = ({ open, onOpenChange, onOpenObservatory, onOpenModelSelector }: SettingsModalProps) => {
  const navigate = useNavigate();
  const { firstName, lastName, setFirstName, setLastName } = useUserPreferences();
  const isDebateModeEnabled = useKenshoStore(state => state.isDebateModeEnabled);
  const setDebateModeEnabled = useKenshoStore(state => state.setDebateModeEnabled);
  const sendMessage = useKenshoStore(state => state.sendMessage);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md backdrop-blur-2xl bg-background/95 border-border/50 shadow-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-light">Paramètres</DialogTitle>
          <DialogDescription className="text-muted-foreground/80">
            Personnalisez votre expérience
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Profil */}
          <div className="space-y-4">
            <h3 className="text-lg font-light">Profil</h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm">
                  Prénom
                </Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Votre prénom"
                  className="bg-background/40 backdrop-blur-md border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm">
                  Nom
                </Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Votre nom"
                  className="bg-background/40 backdrop-blur-md border-border/50"
                />
              </div>
            </div>
          </div>

          <Separator />
          {/* Apparence */}
          <div className="space-y-4">
            <h3 className="text-lg font-light">Apparence</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="dark-mode" className="flex flex-col space-y-1">
                <span>Mode sombre</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Basculer entre les thèmes clair et sombre
                </span>
              </Label>
              <ThemeToggle />
            </div>
          </div>

          <Separator />

          {/* Conversation */}
          <div className="space-y-4">
            <h3 className="text-lg font-light">Conversation</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="save-history" className="flex flex-col space-y-1">
                <span>Sauvegarder l'historique</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Enregistrer vos conversations
                </span>
              </Label>
              <Switch id="save-history" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show-thinking" className="flex flex-col space-y-1">
                <span>Afficher la réflexion</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Voir le processus de pensée de l'IA
                </span>
              </Label>
              <Switch id="show-thinking" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="debate-mode" className="flex flex-col space-y-1">
                <span>Activer le mode Débat</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Débat interne entre Léo et Athéna (plus lent, meilleure qualité)
                </span>
              </Label>
              <Switch 
                id="debate-mode" 
                checked={isDebateModeEnabled}
                onCheckedChange={setDebateModeEnabled}
              />
            </div>
          </div>

          <Separator />

          {/* Audio */}
          <div className="space-y-4">
            <h3 className="text-lg font-light">Audio</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-play" className="flex flex-col space-y-1">
                <span>Lecture automatique</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Lire les réponses à haute voix
                </span>
              </Label>
              <Switch id="auto-play" />
            </div>
          </div>

          <Separator />

          {/* Modèle */}
          <div className="space-y-4">
            <h3 className="text-lg font-light">Modèle</h3>
            <Button
              variant="outline"
              onClick={() => {
                onOpenModelSelector?.();
                onOpenChange(false);
              }}
              className="w-full justify-start"
            >
              <Download className="h-4 w-4 mr-2" />
              Changer de modèle
            </Button>
          </div>

          <Separator />

          {/* Outils */}
          <div className="space-y-4">
            <h3 className="text-lg font-light">Outils</h3>
            <div className="space-y-3">
              {/* Observatory */}
              <button
                onClick={() => {
                  onOpenObservatory?.();
                  onOpenChange(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-sidebar-accent/60 transition-colors border border-border/30"
              >
                <div className="text-left">
                  <div className="font-medium text-sm">Observatory</div>
                  <div className="text-xs text-muted-foreground">Surveillance des agents</div>
                </div>
              </button>

              {/* Analytics */}
              <button
                onClick={() => {
                  navigate('/analytics');
                  onOpenChange(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-sidebar-accent/60 transition-colors border border-border/30"
              >
                <div className="text-left">
                  <div className="font-medium text-sm">Analytics</div>
                  <div className="text-xs text-muted-foreground">Métriques de performance</div>
                </div>
              </button>

              {/* Fact-Checking Examples */}
              <div className="space-y-2">
                <div className="font-medium text-sm">Fact-Checking Rapide</div>
                <div className="space-y-1">
                  {[
                    'Paris est la capitale de la France',
                    'La Terre est plate',
                    'L\'eau bout à 100°C',
                    'La gravité attire les objets',
                  ].map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        sendMessage(`Vérifie: ${example}`);
                        onOpenChange(false);
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-primary/10 transition-colors truncate"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
