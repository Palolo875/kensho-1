import React from 'react';
import { useKenshoStore } from '@/stores/useKenshoStore';
import { Progress } from '@/components/ui/progress';
import { Loader2, Download, Settings, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Composant affichant l'état de chargement du modèle LLM
 * S'affiche tant que le modèle n'est pas prêt
 * Disparaît automatiquement quand phase === 'ready'
 */
export function ModelLoadingView() {
    const modelProgress = useKenshoStore(state => state.modelProgress);

    // Ne rien afficher si le modèle est prêt
    if (modelProgress.phase === 'ready') {
        return null;
    }

    // Déterminer l'icône et le style selon la phase
    const getIcon = () => {
        switch (modelProgress.phase) {
            case 'downloading':
                return <Download className="h-8 w-8 animate-bounce" />;
            case 'compiling':
            case 'checking_gpu':
                return <Settings className="h-8 w-8 animate-spin" />;
            case 'error':
                return <XCircle className="h-8 w-8 text-destructive" />;
            case 'idle':
            default:
                return <Loader2 className="h-8 w-8 animate-spin" />;
        }
    };

    const getTitle = () => {
        switch (modelProgress.phase) {
            case 'downloading':
                return '📥 Téléchargement du Modèle...';
            case 'compiling':
                return '⚙️ Compilation du Modèle...';
            case 'checking_gpu':
                return '🔍 Vérification GPU...';
            case 'error':
                return '❌ Erreur';
            case 'idle':
            default:
                return '🚀 Initialisation...';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8 shadow-2xl">
                {/* Icône animée */}
                <div className="flex justify-center">
                    <div className={cn(
                        "rounded-full p-4",
                        modelProgress.phase === 'error' 
                            ? "bg-destructive/10" 
                            : "bg-primary/10"
                    )}>
                        {getIcon()}
                    </div>
                </div>

                {/* Titre */}
                <h2 className="text-center text-2xl font-semibold">
                    {getTitle()}
                </h2>

                {/* Message de progression */}
                <p className="text-center text-sm text-muted-foreground">
                    {modelProgress.text}
                </p>

                {/* Barre de progression */}
                {modelProgress.phase !== 'error' && (
                    <div className="space-y-2">
                        <Progress 
                            value={modelProgress.progress * 100} 
                            className="h-2"
                        />
                        <p className="text-center text-xs text-muted-foreground">
                            {Math.round(modelProgress.progress * 100)}%
                        </p>
                    </div>
                )}

                {/* Hints spécifiques */}
                {modelProgress.phase === 'downloading' && (
                    <p className="text-center text-xs text-muted-foreground/80 italic">
                        💡 Ce téléchargement ne se fera qu'une fois. Le modèle sera mis en cache localement.
                    </p>
                )}

                {modelProgress.phase === 'checking_gpu' && (
                    <p className="text-center text-xs text-muted-foreground/80 italic">
                        💡 Vérification de la disponibilité de WebGPU pour l'accélération...
                    </p>
                )}

                {modelProgress.phase === 'error' && (
                    <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-4">
                        <p className="text-sm font-medium text-destructive">
                            Une erreur s'est produite
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Veuillez rafraîchir la page ou vérifier votre connexion internet.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
