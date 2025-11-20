import React from 'react';
import { useKenshoStore } from '@/stores/useKenshoStore';
import { Progress } from '@/components/ui/progress';
import { X, Minimize2, Maximize2, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Icône SVG personnalisée pour le téléchargement
 */
const DownloadIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M50 20 L50 65 M35 50 L50 65 L65 50"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-bounce"
    />
    <path
      d="M25 70 L25 75 Q25 80 30 80 L70 80 Q75 80 75 75 L75 70"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Icône SVG personnalisée pour la compilation
 */
const CompileIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle
      cx="50"
      cy="50"
      r="30"
      stroke="currentColor"
      strokeWidth="4"
      strokeDasharray="10 5"
      className="animate-spin"
      style={{ transformOrigin: 'center' }}
    />
    <path
      d="M50 35 L50 50 L60 60"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Icône SVG personnalisée pour la vérification GPU
 */
const GPUIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="20"
      y="30"
      width="60"
      height="40"
      rx="5"
      stroke="currentColor"
      strokeWidth="3"
    />
    <line x1="30" y1="45" x2="50" y2="45" stroke="currentColor" strokeWidth="2" />
    <line x1="30" y1="55" x2="70" y2="55" stroke="currentColor" strokeWidth="2" />
    <circle cx="65" cy="45" r="3" fill="currentColor" className="animate-pulse" />
  </svg>
);

/**
 * Icône SVG personnalisée pour l'initialisation
 */
const InitIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle
      cx="50"
      cy="50"
      r="25"
      stroke="currentColor"
      strokeWidth="4"
      opacity="0.3"
    />
    <path
      d="M50 25 A25 25 0 0 1 75 50"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      className="animate-spin"
      style={{ transformOrigin: 'center' }}
    />
  </svg>
);

/**
 * Composant affichant l'état de chargement du modèle LLM
 * Peut être minimisé pour ne pas bloquer l'utilisation
 */
export function ModelLoadingView() {
    const modelProgress = useKenshoStore(state => state.modelProgress);
    const isMinimized = useKenshoStore(state => state.isLoadingMinimized);
    const isPaused = useKenshoStore(state => state.isLoadingPaused);
    const setMinimized = useKenshoStore(state => state.setLoadingMinimized);
    const setPaused = useKenshoStore(state => state.setLoadingPaused);

    // Référence au worker LLM pour contrôler la pause
    const handlePauseToggle = () => {
        setPaused(!isPaused);
        // Envoyer un message au worker pour pause/reprise
        const workers = (window as any).__kensho_workers || {};
        const llmWorker = workers['MainLLMAgent'];
        if (llmWorker) {
            llmWorker.postMessage({
                type: isPaused ? 'RESUME_DOWNLOAD' : 'PAUSE_DOWNLOAD'
            });
        }
    };

    // Formater les métriques
    const formatSpeed = (mbps?: number) => {
        if (!mbps) return '';
        return `${mbps.toFixed(2)} MB/s`;
    };

    const formatETA = (seconds?: number) => {
        if (!seconds) return '';
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const minutes = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${minutes}m ${secs}s`;
    };

    const formatSize = (mb?: number) => {
        if (!mb) return '';
        if (mb < 1024) return `${mb.toFixed(1)} MB`;
        return `${(mb / 1024).toFixed(2)} GB`;
    };

    // Ne rien afficher si le modèle est prêt
    if (modelProgress.phase === 'ready') {
        return null;
    }

    // Déterminer l'icône selon la phase
    const getIcon = () => {
        switch (modelProgress.phase) {
            case 'downloading':
                return <DownloadIcon className="w-16 h-16" />;
            case 'compiling':
                return <CompileIcon className="w-16 h-16" />;
            case 'checking_gpu':
                return <GPUIcon className="w-16 h-16" />;
            case 'idle':
            default:
                return <InitIcon className="w-16 h-16" />;
        }
    };

    const getTitle = () => {
        switch (modelProgress.phase) {
            case 'downloading':
                return 'Téléchargement en cours';
            case 'compiling':
                return 'Compilation du modèle';
            case 'checking_gpu':
                return 'Vérification GPU';
            case 'error':
                return 'Erreur de chargement';
            case 'idle':
            default:
                return 'Initialisation';
        }
    };

    // Version minimisée (petit badge en bas à droite)
    if (isMinimized) {
        return (
            <div className="fixed bottom-4 right-4 z-50 flex gap-2">
                {modelProgress.phase === 'downloading' && (
                    <Button
                        variant="secondary"
                        size="icon"
                        className="shadow-lg"
                        onClick={handlePauseToggle}
                    >
                        {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </Button>
                )}
                <Button
                    variant="secondary"
                    size="lg"
                    className="shadow-lg gap-3 pr-4"
                    onClick={() => setMinimized(false)}
                >
                    <div className={cn("w-6 h-6", !isPaused && "animate-spin")}>
                        {getIcon()}
                    </div>
                    <div className="flex flex-col items-start text-sm">
                        <span className="font-medium">{getTitle()}</span>
                        <span className="text-xs text-muted-foreground">
                            {Math.round(modelProgress.progress * 100)}%
                            {modelProgress.speedMBps && ` • ${formatSpeed(modelProgress.speedMBps)}`}
                        </span>
                    </div>
                    <Maximize2 className="w-4 h-4 ml-2" />
                </Button>
            </div>
        );
    }

    // Version complète (dialog)
    return (
        <Dialog open={true}>
            <DialogContent 
                className="sm:max-w-md"
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <DialogTitle className="text-xl">{getTitle()}</DialogTitle>
                            <DialogDescription className="mt-2">
                                {modelProgress.text}
                            </DialogDescription>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            {modelProgress.phase === 'downloading' && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={handlePauseToggle}
                                    title={isPaused ? "Reprendre" : "Mettre en pause"}
                                >
                                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                    <span className="sr-only">{isPaused ? "Reprendre" : "Pause"}</span>
                                </Button>
                            )}
                            {modelProgress.phase !== 'error' && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setMinimized(true)}
                                >
                                    <Minimize2 className="h-4 w-4" />
                                    <span className="sr-only">Minimiser</span>
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Icône animée */}
                    <div className="flex justify-center">
                        <div className={cn(
                            "rounded-full p-6 transition-colors",
                            modelProgress.phase === 'error' 
                                ? "bg-destructive/10 text-destructive" 
                                : "bg-primary/10 text-primary"
                        )}>
                            {getIcon()}
                        </div>
                    </div>

                    {/* Barre de progression */}
                    {modelProgress.phase !== 'error' && (
                        <div className="space-y-3">
                            <Progress 
                                value={modelProgress.progress * 100} 
                                className="h-2"
                            />
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-medium tabular-nums">
                                    {Math.round(modelProgress.progress * 100)}%
                                </span>
                                <div className="flex gap-3 text-muted-foreground tabular-nums">
                                    {modelProgress.downloadedMB && modelProgress.totalMB && (
                                        <span>
                                            {formatSize(modelProgress.downloadedMB)} / {formatSize(modelProgress.totalMB)}
                                        </span>
                                    )}
                                    {modelProgress.speedMBps && (
                                        <span>⚡ {formatSpeed(modelProgress.speedMBps)}</span>
                                    )}
                                    {modelProgress.etaSeconds && !isPaused && (
                                        <span>⏱️ {formatETA(modelProgress.etaSeconds)}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Messages contextuels */}
                    {modelProgress.phase === 'downloading' && (
                        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
                            <p className="text-sm text-muted-foreground">
                                {modelProgress.isCached ? (
                                    <>✓ Modèle trouvé en cache - chargement rapide</>
                                ) : (
                                    <>💾 Premier téléchargement - le modèle sera conservé en cache</>
                                )}
                            </p>
                            {!modelProgress.isCached && (
                                <p className="text-xs text-muted-foreground">
                                    Le stockage persistant est activé. Le modèle ne sera plus téléchargé 
                                    même après un redémarrage du navigateur ou en développement.
                                </p>
                            )}
                            {isPaused && (
                                <p className="text-sm font-medium text-primary">
                                    ⏸️ Téléchargement en pause - cliquez sur ▶ pour reprendre
                                </p>
                            )}
                        </div>
                    )}

                    {modelProgress.phase === 'checking_gpu' && (
                        <div className="rounded-lg border border-border bg-muted/50 p-4">
                            <p className="text-sm text-muted-foreground">
                                💡 Recherche d'accélération matérielle WebGPU 
                                pour des performances optimales.
                            </p>
                        </div>
                    )}

                    {modelProgress.phase === 'error' && (
                        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
                            <p className="text-sm font-medium text-destructive">
                                Une erreur s'est produite lors du chargement
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Veuillez rafraîchir la page ou vérifier votre connexion internet. 
                                Si le problème persiste, votre navigateur ne supporte peut-être pas WebGPU.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.location.reload()}
                                className="w-full"
                            >
                                Rafraîchir la page
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
