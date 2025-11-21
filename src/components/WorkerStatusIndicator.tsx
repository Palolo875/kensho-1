import { useKenshoStore } from '@/stores/useKenshoStore';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

/**
 * Indicateur de statut des workers pour le débogage
 * Affiche l'état de connexion de chaque worker
 */
export function WorkerStatusIndicator() {
  const { workersReady, modelProgress, workerErrors } = useKenshoStore();
  
  const getStatusIcon = (ready: boolean, loading: boolean = false) => {
    if (loading) return <Loader2 className="w-3 h-3 animate-spin" />;
    return ready ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />;
  };
  
  const getStatusVariant = (ready: boolean, loading: boolean = false): "default" | "secondary" | "destructive" | "outline" => {
    if (loading) return 'secondary';
    return ready ? 'default' : 'destructive';
  };
  
  const isModelLoading = modelProgress.phase !== 'ready' && modelProgress.phase !== 'idle' && modelProgress.phase !== 'error';
  const isModelReady = modelProgress.phase === 'ready';
  const hasError = modelProgress.phase === 'error' || workerErrors.length > 0;
  
  return (
    <div className="fixed bottom-4 left-4 z-50 bg-background/95 backdrop-blur border rounded-lg p-3 shadow-lg text-xs space-y-2">
      <div className="font-semibold text-foreground mb-1">État du système</div>
      
      <div className="flex items-center gap-2">
        <Badge variant={getStatusVariant(workersReady.llm, isModelLoading)} className="gap-1">
          {getStatusIcon(workersReady.llm, isModelLoading)}
          LLM Worker
        </Badge>
        {isModelLoading && (
          <span className="text-muted-foreground text-[10px]">
            {modelProgress.text}
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        <Badge variant={getStatusVariant(workersReady.oie)} className="gap-1">
          {getStatusIcon(workersReady.oie)}
          OIE Worker
        </Badge>
      </div>
      
      <div className="flex items-center gap-2">
        <Badge variant={getStatusVariant(workersReady.telemetry)} className="gap-1">
          {getStatusIcon(workersReady.telemetry)}
          Telemetry
        </Badge>
      </div>
      
      {hasError && (
        <div className="mt-2 p-2 bg-destructive/10 rounded border border-destructive/20 text-[10px]">
          <div className="font-semibold text-destructive">Erreurs détectées:</div>
          {modelProgress.phase === 'error' && (
            <div className="text-destructive/80 mt-1">{modelProgress.text}</div>
          )}
          {workerErrors.map((err, i) => (
            <div key={i} className="text-destructive/80 mt-1">
              {err.worker}: {err.message}
            </div>
          ))}
        </div>
      )}
      
      {isModelReady && workersReady.llm && workersReady.oie && (
        <div className="mt-2 p-2 bg-primary/10 rounded border border-primary/20 text-[10px] text-primary">
          ✅ Système prêt à répondre
        </div>
      )}
    </div>
  );
}
