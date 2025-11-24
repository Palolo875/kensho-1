import React, { useEffect, useState } from 'react';
import { useKenshoStore } from '@/stores/useKenshoStore';
import { Progress } from '@/components/ui/progress';
import { X, Minimize2, Maximize2, Pause, Play, HardDrive, Database, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { appConfig } from '@/config/app.config';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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
 * Hook pour récupérer les statistiques de stockage
 */
function useStorageStats() {
    const [stats, setStats] = useState<{
        used?: number;
        quota?: number;
        isPersisted?: boolean;
        hasWebGPU?: boolean;
    }>({});
    const [hasWebGPUCached, setHasWebGPUCached] = useState<boolean | null>(null);

    useEffect(() => {
        // Vérifier WebGPU une seule fois au montage
        const checkWebGPU = async () => {
            if (hasWebGPUCached !== null) return;
            
            const nav = navigator as any;
            let hasWebGPU = false;
            if (nav.gpu) {
                try {
                    const adapter = await nav.gpu.requestAdapter();
                    hasWebGPU = !!adapter;
                } catch {
                    hasWebGPU = false;
                }
            }
            setHasWebGPUCached(hasWebGPU);
        };

        checkWebGPU();
    }, [hasWebGPUCached]);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Vérifier le stockage
                if (navigator.storage && navigator.storage.estimate) {
                    const estimate = await navigator.storage.estimate();
                    const isPersisted = await navigator.storage.persisted?.();
                    
                    setStats({
                        used: estimate.usage,
                        quota: estimate.quota,
                        isPersisted: isPersisted || false,
                        hasWebGPU: hasWebGPUCached ?? false,
                    });
                }
            } catch (error) {
                console.warn('[StorageStats] Erreur lors de la récupération des stats:', error);
            }
        };

        fetchStats();
        // Rafraîchir toutes les 5 secondes pendant le téléchargement
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, [hasWebGPUCached]);

    return stats;
}

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
    const startModelDownload = useKenshoStore(state => state.startModelDownload);
    const pauseModelDownload = useKenshoStore(state => state.pauseModelDownload);
    const resumeModelDownload = useKenshoStore(state => state.resumeModelDownload);
    const cancelModelDownload = useKenshoStore(state => state.cancelModelDownload);
    const [showDetails, setShowDetails] = useState(false);
    const storageStats = useStorageStats();

    // Contrôler la pause/reprise du téléchargement
    const handlePauseToggle = () => {
        if (isPaused) {
            resumeModelDownload();
        } else {
            pauseModelDownload();
        }
    };

    // Formater les métriques
    const formatSpeed = (mbps?: number) => {
        if (!mbps) return '';
        if (mbps < 1) return `${(mbps * 1000).toFixed(0)} KB/s`;
        return `${mbps.toFixed(2)} MB/s`;
    };

    const formatETA = (seconds?: number) => {
        if (!seconds || seconds <= 0) return '';
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const minutes = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        if (minutes < 60) return `${minutes}m ${secs}s`;
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return `${hours}h ${mins}m`;
    };

    const formatSize = (mb?: number) => {
        if (!mb) return '';
        if (mb < 1024) return `${mb.toFixed(1)} MB`;
        return `${(mb / 1024).toFixed(2)} GB`;
    };

    // Ne rien afficher si pas en cours de chargement
    if (!modelProgress.phase) {
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
    const handleCloseDialog = () => {
        if (modelProgress.phase === 'idle' || modelProgress.phase === 'error') {
            setMinimized(true);
        }
    };

    return (
        <Dialog open={true} onOpenChange={(open) => {
            if (!open) {
                setMinimized(true);
            }
        }}>
            <DialogContent 
                className="sm:max-w-md"
                onPointerDownOutside={(e) => {
                    if (modelProgress.phase === 'idle' || modelProgress.phase === 'error') {
                        e.preventDefault();
                    }
                }}
                onEscapeKeyDown={(e) => {
                    if (modelProgress.phase === 'downloading' || modelProgress.phase === 'compiling' || modelProgress.phase === 'checking_gpu') {
                        e.preventDefault();
                    }
                }}
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
                                <>
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
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={cancelModelDownload}
                                        title="Annuler le téléchargement"
                                    >
                                        <X className="h-4 w-4" />
                                        <span className="sr-only">Annuler</span>
                                    </Button>
                                </>
                            )}
                            {!modelProgress.phase && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setMinimized(true)}
                                    title="Fermer"
                                >
                                    <X className="h-4 w-4" />
                                    <span className="sr-only">Fermer</span>
                                </Button>
                            )}
                            {modelProgress.phase !== 'error' && modelProgress.phase !== 'downloading' && modelProgress.phase && (
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

                    {/* Bouton de démarrage pour lazy loading */}
                    {!modelProgress.phase && appConfig.llm.enabled && (
                        <div className="space-y-4">
                            <div className="text-center text-sm text-muted-foreground">
                                Le modèle IA n'est pas encore chargé. Taille du téléchargement : ~2 GB
                            </div>
                            <Button 
                                onClick={startModelDownload}
                                className="w-full gap-2"
                                size="lg"
                            >
                                <Sparkles className="w-4 h-4" />
                                Démarrer le téléchargement
                            </Button>
                            <div className="text-xs text-muted-foreground text-center">
                                Le modèle sera téléchargé une seule fois et mis en cache pour les prochaines utilisations.
                                Vous pouvez mettre en pause ou reprendre à tout moment.
                            </div>
                        </div>
                    )}

                    {/* Barre de progression */}
                    {modelProgress.phase !== 'error' && modelProgress.phase && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Progress 
                                    value={modelProgress.progress * 100} 
                                    className="h-3"
                                />
                                <div className="flex items-center justify-between text-xs md:text-sm">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-bold text-base">
                                            {Math.round(modelProgress.progress * 100)}%
                                        </span>
                                        <span className="text-muted-foreground">
                                            {modelProgress.phase === 'downloading' ? '📥 Téléchargement' : modelProgress.phase === 'compiling' ? '⚙️ Compilation' : '🔄 Initialisation'}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        {modelProgress.speedMBps && !isPaused && (
                                            <div className="text-muted-foreground">
                                                ⚡ {formatSpeed(modelProgress.speedMBps)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Affichage détaillé des métriques */}
                            {modelProgress.downloadedMB && modelProgress.totalMB && (
                                <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>Taille:</span>
                                        <span className="font-mono">
                                            {formatSize(modelProgress.downloadedMB)} / {formatSize(modelProgress.totalMB)}
                                        </span>
                                    </div>
                                    {modelProgress.etaSeconds && !isPaused && (
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>Temps estimé:</span>
                                            <span className="font-mono">
                                                ⏱️ {formatETA(modelProgress.etaSeconds)}
                                            </span>
                                        </div>
                                    )}
                                    {isPaused && (
                                        <div className="text-xs text-amber-600 font-medium">
                                            ⏸️ Téléchargement en pause
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Messages contextuels et statistiques détaillées */}
                    {modelProgress.phase === 'downloading' && (
                        <div className="space-y-3">
                            {/* Statut du cache */}
                            <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
                                <div className="flex items-center gap-2">
                                    <Database className="w-4 h-4 text-primary" />
                                    <p className="text-sm font-medium">
                                        {modelProgress.isCached ? (
                                            <>✓ Modèle trouvé en cache - chargement accéléré</>
                                        ) : (
                                            <>Premier téléchargement en cours</>
                                        )}
                                    </p>
                                </div>
                                
                                <p className="text-xs text-muted-foreground">
                                    {storageStats.isPersisted ? (
                                        <>💾 Stockage persistant actif - Le modèle ne sera jamais supprimé automatiquement</>
                                    ) : (
                                        <>📦 IndexedDB actif - Le modèle est conservé en cache entre les sessions (dev/tests/production)</>
                                    )}
                                </p>
                                
                                {isPaused && (
                                    <p className="text-sm font-medium text-primary mt-2">
                                        ⏸️ Téléchargement en pause - cliquez sur ▶ pour reprendre
                                    </p>
                                )}
                            </div>

                            {/* Statistiques de stockage détaillées */}
                            <Collapsible open={showDetails} onOpenChange={setShowDetails}>
                                <div className="rounded-lg border border-border bg-muted/50 p-4">
                                    <CollapsibleTrigger className="w-full">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <HardDrive className="w-4 h-4 text-primary" />
                                                <span className="text-sm font-medium">Statistiques de stockage</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {showDetails ? '▼ Masquer' : '▶ Afficher'}
                                            </span>
                                        </div>
                                    </CollapsibleTrigger>
                                    
                                    <CollapsibleContent className="mt-3 space-y-2">
                                        {storageStats.used !== undefined && storageStats.quota !== undefined && storageStats.quota > 0 ? (
                                            <>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-muted-foreground">Espace utilisé:</span>
                                                    <span className="font-mono">{formatSize(storageStats.used / (1024 * 1024))}</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-muted-foreground">Espace disponible:</span>
                                                    <span className="font-mono">{formatSize(storageStats.quota / (1024 * 1024))}</span>
                                                </div>
                                                <Progress 
                                                    value={(storageStats.used / storageStats.quota) * 100} 
                                                    className="h-1 mt-2"
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {((storageStats.used / storageStats.quota) * 100).toFixed(1)}% utilisé
                                                </p>
                                            </>
                                        ) : (
                                            <div className="text-xs text-muted-foreground">
                                                <p>Informations de stockage indisponibles</p>
                                                <p className="text-xs mt-1">(mode privé ou non supporté par le navigateur)</p>
                                            </div>
                                        )}
                                        
                                        <div className="flex justify-between text-xs mt-3 pt-3 border-t">
                                            <span className="text-muted-foreground">Stockage persistant:</span>
                                            <span className={storageStats.isPersisted ? "text-green-600" : "text-orange-600"}>
                                                {storageStats.isPersisted ? '✓ Actif' : '⚠ Non actif'}
                                            </span>
                                        </div>
                                        
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Accélération WebGPU:</span>
                                            <span className={storageStats.hasWebGPU ? "text-green-600" : "text-orange-600"}>
                                                {storageStats.hasWebGPU ? '✓ Disponible' : '⚠ CPU uniquement'}
                                            </span>
                                        </div>

                                        <div className="mt-3 p-2 bg-background/50 rounded text-xs text-muted-foreground">
                                            <p className="font-medium mb-1">ℹ️ À propos du cache:</p>
                                            <p>
                                                Les modèles sont stockés localement dans IndexedDB. 
                                                Une fois téléchargés, ils sont réutilisés automatiquement en dev, 
                                                tests et production, éliminant les téléchargements répétés.
                                            </p>
                                        </div>
                                    </CollapsibleContent>
                                </div>
                            </Collapsible>
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
