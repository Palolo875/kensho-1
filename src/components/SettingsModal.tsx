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
import ThemeToggle from "./ThemeToggle";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingsModal = ({ open, onOpenChange }: SettingsModalProps) => {
  const { firstName, lastName, setFirstName, setLastName } = useUserPreferences();

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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
