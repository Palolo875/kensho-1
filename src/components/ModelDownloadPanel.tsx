import { useState, useEffect } from 'react';
import { Pause, Play, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { modelManager, type DownloadProgress } from '@/core/kernel/ModelManager';

interface ModelDownloadPanelProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function ModelDownloadPanel({ onComplete, onCancel }: ModelDownloadPanelProps) {
  const [progress, setProgress] = useState<DownloadProgress>({
    percent: 0,
    speed: 0,
    timeRemaining: 0,
    loaded: 0,
    total: 400 * 1024 * 1024, // 400MB
    file: 'Initialisation...'
  });
  const [isPaused, setIsPaused] = useState(false);
  const [isDownloading, setIsDownloading] = useState(true);

  useEffect(() => {
    const startDownload = async () => {
      try {
        await modelManager.downloadAndInitQwen3((prog) => {
          setProgress(prog);
          if (prog.percent === 100) {
            setIsDownloading(false);
            setTimeout(() => onComplete?.(), 500);
          }
        });
      } catch (error) {
        if ((error as any)?.name === 'AbortError' || (error as any)?.message === 'Download cancelled') {
          console.log('Download cancelled by user');
        } else {
          console.error('Download error:', error);
        }
        setIsDownloading(false);
      }
    };

    startDownload();
  }, [onComplete]);

  const handlePause = () => {
    if (!isPaused) {
      modelManager.pauseDownload();
      setIsPaused(true);
    }
  };

  const handleResume = () => {
    // La reprise complète nécessite une refonte - pour maintenant, continuer simplement
    setIsPaused(false);
  };

  const handleCancel = () => {
    modelManager.cancelDownload();
    setIsDownloading(false);
    onCancel?.();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number): string => {
    return formatBytes(bytesPerSec) + '/s';
  };

  const formatTime = (ms: number): string => {
    if (ms <= 0) return '--';
    const seconds = Math.ceil(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  if (!isDownloading) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 border border-border">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Téléchargement Qwen3</h2>
          </div>
          <button
            onClick={handleCancel}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* File info */}
        <p className="text-sm text-muted-foreground mb-4 truncate">
          {progress.file || 'Initialisation...'}
        </p>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {progress.percent}% • {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-secondary/50 rounded p-2">
            <p className="text-xs text-muted-foreground">Vitesse</p>
            <p className="text-sm font-semibold text-foreground">
              {formatSpeed(progress.speed)}
            </p>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <p className="text-xs text-muted-foreground">Temps restant</p>
            <p className="text-sm font-semibold text-foreground">
              {formatTime(progress.timeRemaining)}
            </p>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <p className="text-xs text-muted-foreground">Taille</p>
            <p className="text-sm font-semibold text-foreground">
              {formatBytes(progress.total)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 justify-end">
          {!isPaused ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePause}
              className="flex items-center gap-2"
            >
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResume}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Reprendre
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCancel}
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Arrêter
          </Button>
        </div>

        {/* Info message */}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          Ne fermez pas cette fenêtre pendant le téléchargement
        </p>
      </div>
    </div>
  );
}
