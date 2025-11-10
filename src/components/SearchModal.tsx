import { useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SearchModal = ({ open, onOpenChange }: SearchModalProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] backdrop-blur-2xl bg-background/80 border-border/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-light">Rechercher</DialogTitle>
          <DialogDescription className="text-muted-foreground/80">
            Recherchez dans vos conversations
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
            <Input
              placeholder="Rechercher des messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 text-base bg-background/40 backdrop-blur-md border-border/50 rounded-2xl font-light"
            />
          </div>

          {searchQuery && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <p className="text-sm text-muted-foreground px-2">
                Aucun résultat trouvé pour "{searchQuery}"
              </p>
            </div>
          )}

          {!searchQuery && (
            <div className="text-center py-12">
              <Search className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                Commencez à taper pour rechercher
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchModal;
