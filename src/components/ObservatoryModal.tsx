// src/components/ObservatoryModal.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, AlertCircle, Cpu, Database, BarChart3 } from "lucide-react";
import { CustomCrownIcon, JournalIcon, LightbulbIcon, WarningIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { SAMPLE_JOURNAL } from "@/utils/sampleJournal";
import { runtimeManager } from "@/core/kernel/RuntimeManager";
import { taskExecutor } from "@/core/kernel/TaskExecutor";
import { memoryManager } from "@/core/kernel/MemoryManager";

export interface WorkerStatus {
    name: string;
    isLeader: boolean;
    active: boolean;
}

export interface LogEntry {
    timestamp: number;
    agent: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    data?: any;
}

interface SerializedJournal {
    type: 'debate' | 'simple';
    queryId: string;
    userQuery: string;
    startTime: number;
    endTime?: number;
    totalDuration?: number;
    steps: any[];
    finalResponse?: string;
    degradationApplied?: boolean;
    degradationReason?: string;
}

interface ObservatoryModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workers: WorkerStatus[];
    leader: string | null;
    epoch: number;
    logs: LogEntry[];
    onKillWorker: (name: string) => void;
    journal?: SerializedJournal | null;
}

export function ObservatoryModal({
    open,
    onOpenChange,
    workers,
    leader,
    epoch,
    logs,
    onKillWorker,
    journal
}: ObservatoryModalProps) {
    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'error': return <AlertCircle className="h-4 w-4 text-destructive" />;
            case 'warn': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
            default: return <AlertCircle className="h-4 w-4 text-blue-500" />;
        }
    };

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'error': return 'border-destructive';
            case 'warn': return 'border-yellow-500';
            default: return 'border-blue-500';
        }
    };

    // Get performance metrics
    const performanceMetrics = runtimeManager.getPerformanceMetrics();
    const executorStats = taskExecutor.getStats();
    const queueStatus = taskExecutor.getQueueStatus();
    const memoryReport = memoryManager.getMemoryReport();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full max-w-2xl sm:max-w-4xl lg:max-w-6xl max-h-[85vh] sm:max-h-[90vh] bg-background/95 border border-border/40 backdrop-blur-md p-3 sm:p-6 flex flex-col">
                <DialogHeader className="pb-3 sm:pb-4 border-b border-border/30 text-center">
                    <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center justify-center gap-2">
                            <Activity className="h-4 sm:h-6 w-4 sm:w-6 text-primary" />
                            <DialogTitle className="text-lg sm:text-2xl font-semibold">Orion Observatory</DialogTitle>
                        </div>
                        <Badge variant="outline" className="text-[10px] sm:text-xs">
                            Epoch {epoch}
                        </Badge>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-2">Surveillance en temps réel des agents et du journal cognitif</p>
                </DialogHeader>

                <Tabs defaultValue="journal" className="w-full mt-3 sm:mt-6">
                    <TabsList className="grid w-full grid-cols-4 bg-background border border-border/40 h-auto">
                        <TabsTrigger value="journal" className="text-xs sm:text-sm font-light py-2 sm:py-3">Journal</TabsTrigger>
                        <TabsTrigger value="constellation" className="text-xs sm:text-sm font-light py-2 sm:py-3">Agents</TabsTrigger>
                        <TabsTrigger value="logs" className="text-xs sm:text-sm font-light py-2 sm:py-3">Logs</TabsTrigger>
                        <TabsTrigger value="metrics" className="text-xs sm:text-sm font-light py-2 sm:py-3">Métriques</TabsTrigger>
                    </TabsList>

                    <TabsContent value="journal" className="space-y-2 sm:space-y-4 mt-3 sm:mt-4">
                        {journal || SAMPLE_JOURNAL ? (
                            <div className="space-y-2 sm:space-y-4">
                                <Card className="bg-card border border-border/40 shadow-sm">
                                    <CardHeader className="pb-2 sm:pb-4 px-3 sm:px-6 py-3 sm:py-4 border-b border-border/30">
                                        <CardTitle className="flex items-center gap-2 text-sm sm:text-lg font-semibold flex-wrap">
                                            <JournalIcon className="h-4 sm:h-5 w-4 sm:w-5" />
                                            Journal Cognitif
                                            {(journal || SAMPLE_JOURNAL)?.degradationApplied && (
                                                <Badge variant="destructive" className="text-[8px] sm:text-xs">Graceful Degradation</Badge>
                                            )}
                                            {!journal && (
                                                <Badge variant="outline" className="text-[8px] sm:text-xs">Exemple</Badge>
                                            )}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2 sm:space-y-4 px-3 sm:px-6 py-3 sm:py-4">
                                        {!journal && (
                                            <div className="bg-blue-500/10 border border-blue-500 rounded p-2 sm:p-3 mb-2 sm:mb-4">
                                                <div className="flex items-start gap-2">
                                                    <LightbulbIcon className="h-3 sm:h-4 w-3 sm:w-4 mt-1 flex-shrink-0 text-blue-600" />
                                                    <p className="text-[9px] sm:text-xs text-blue-600"><strong>Exemple:</strong> Voici à quoi ressemble un débat complet.</p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                                            <div>
                                                <p className="text-[9px] sm:text-xs text-muted-foreground">Requête</p>
                                                <p className="font-mono text-xs sm:text-sm truncate">{(journal || SAMPLE_JOURNAL)?.userQuery}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] sm:text-xs text-muted-foreground">Durée</p>
                                                <p className="font-mono text-xs sm:text-sm">{(journal || SAMPLE_JOURNAL)?.totalDuration?.toFixed(0)}ms</p>
                                            </div>
                                        </div>
                                        
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-2">Étapes</p>
                                            <div className="space-y-2">
                                                {(journal || SAMPLE_JOURNAL)?.steps.map((step: any, idx: number) => (
                                                    <div key={idx} className="border-l-2 border-blue-500 pl-2 text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="secondary">{step.status}</Badge>
                                                            <span className="font-semibold">{step.agent}</span>
                                                            <span className="text-xs text-muted-foreground">({step.duration?.toFixed(0)}ms)</span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1">{step.label}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {(journal || SAMPLE_JOURNAL)?.degradationApplied && (
                                            <Card className="bg-yellow-500/10 border-yellow-500">
                                                <CardContent className="pt-3 sm:pt-4">
                                                    <div className="flex items-start gap-2">
                                                        <WarningIcon className="h-4 sm:h-5 w-4 sm:w-5 mt-0.5 flex-shrink-0 text-yellow-600" />
                                                        <p className="text-xs sm:text-sm"><strong>Dégradation:</strong> {(journal || SAMPLE_JOURNAL)?.degradationReason}</p>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}

                                        {(journal || SAMPLE_JOURNAL)?.finalResponse && (
                                            <div>
                                                <p className="text-xs text-muted-foreground mb-2">Réponse Finale</p>
                                                <pre className="text-xs bg-muted p-2 rounded max-h-[200px] overflow-auto">
                                                    {(journal || SAMPLE_JOURNAL)?.finalResponse}
                                                </pre>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        ) : null}
                    </TabsContent>

                    <TabsContent value="constellation" className="space-y-2 sm:space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                            {workers.map((worker) => (
                                <Card
                                    key={worker.name}
                                    className={cn(
                                        "transition-all",
                                        worker.name === leader && "ring-2 ring-yellow-500/50 bg-yellow-500/5"
                                    )}
                                >
                                    <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 py-3 sm:py-4">
                                        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                                            {worker.name === leader && (
                                                <CustomCrownIcon className="h-4 sm:h-5 w-4 sm:w-5 text-yellow-500" />
                                            )}
                                            <span className="truncate">{worker.name}</span>
                                        </CardTitle>
                                        <CardDescription className="flex items-center gap-2 text-xs sm:text-sm mt-1">
                                            <div className={cn(
                                                "h-2 w-2 rounded-full flex-shrink-0",
                                                worker.active ? "bg-green-500" : "bg-red-500"
                                            )} />
                                            {worker.active ? 'Active' : 'Inactive'}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="w-full text-xs sm:text-sm"
                                            onClick={() => onKillWorker(worker.name)}
                                            disabled={!worker.active}
                                        >
                                            Terminate Worker
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="logs" className="space-y-2 sm:space-y-4">
                        <Card className="bg-card border border-border/40 shadow-sm">
                            <CardHeader className="pb-2 sm:pb-4 px-3 sm:px-6 py-3 sm:py-4 border-b border-border/30">
                                <CardTitle className="text-sm sm:text-base">Log Stream</CardTitle>
                                <CardDescription className="text-xs sm:text-sm">
                                    Real-time logs from all agents (last 100 entries)
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                                <ScrollArea className="h-[300px] sm:h-[400px] w-full rounded-md border p-2 sm:p-4">
                                    <div className="space-y-1 sm:space-y-2">
                                        {logs.length === 0 ? (
                                            <p className="text-xs sm:text-sm text-muted-foreground text-center py-6 sm:py-8">
                                                No logs yet. Logs will appear here as agents communicate.
                                            </p>
                                        ) : (
                                            logs.map((log, index) => (
                                                <div
                                                    key={`${log.timestamp}-${index}`}
                                                    className={cn(
                                                        "flex gap-2 p-1.5 sm:p-2 rounded-md border-l-2 text-xs sm:text-sm",
                                                        getLevelColor(log.level),
                                                        "bg-muted/50"
                                                    )}
                                                >
                                                    <div className="flex-shrink-0 mt-0.5">
                                                        {getLevelIcon(log.level)}
                                                    </div>
                                                    <div className="flex-1 space-y-1 min-w-0">
                                                        <div className="flex items-baseline gap-1 sm:gap-2 flex-wrap">
                                                            <span className="text-[10px] sm:text-xs text-muted-foreground font-mono">
                                                                {new Date(log.timestamp).toLocaleTimeString()}
                                                            </span>
                                                            <Badge variant="secondary" className="text-[8px] sm:text-xs px-1.5 py-0.5">
                                                                {log.agent}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs sm:text-sm break-words">{log.message}</p>
                                                        {log.data && (
                                                            <pre className="text-[9px] sm:text-xs bg-background p-1 sm:p-2 rounded mt-1 overflow-x-auto max-h-[100px]">
                                                                {JSON.stringify(log.data, null, 2)}
                                                            </pre>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="metrics" className="space-y-2 sm:space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Performance Metrics */}
                            <Card className="bg-card border border-border/40 shadow-sm">
                                <CardHeader className="pb-2 sm:pb-4 px-3 sm:px-6 py-3 sm:py-4 border-b border-border/30">
                                    <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                                        <BarChart3 className="h-4 w-4 text-blue-500" />
                                        Performance du Runtime
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Inférences réussies:</span>
                                            <span className="font-medium">{performanceMetrics.successfulInferences}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Inférences échouées:</span>
                                            <span className="font-medium">{performanceMetrics.failedInferences}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Taux d'erreur:</span>
                                            <span className="font-medium">{(performanceMetrics.errorRate * 100).toFixed(2)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Latence moyenne:</span>
                                            <span className="font-medium">{performanceMetrics.averageLatencyMs.toFixed(0)}ms</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Tokens par seconde:</span>
                                            <span className="font-medium">{performanceMetrics.averageTokensPerSecond}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Retries:</span>
                                            <span className="font-medium">{performanceMetrics.totalRetries}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Task Executor Stats */}
                            <Card className="bg-card border border-border/40 shadow-sm">
                                <CardHeader className="pb-2 sm:pb-4 px-3 sm:px-6 py-3 sm:py-4 border-b border-border/30">
                                    <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                                        <Cpu className="h-4 w-4 text-purple-500" />
                                        Statistiques d'Exécution
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Exécutions réussies:</span>
                                            <span className="font-medium">{executorStats.successfulExecutions}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Exécutions échouées:</span>
                                            <span className="font-medium">{executorStats.failedExecutions}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Temps moyen:</span>
                                            <span className="font-medium">{executorStats.averageExecutionTime.toFixed(0)}ms</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Cache hits:</span>
                                            <span className="font-medium">{executorStats.cacheHits}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Tentatives:</span>
                                            <span className="font-medium">{executorStats.totalRetries}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Queue Status */}
                            <Card className="bg-card border border-border/40 shadow-sm">
                                <CardHeader className="pb-2 sm:pb-4 px-3 sm:px-6 py-3 sm:py-4 border-b border-border/30">
                                    <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                                        <Activity className="h-4 w-4 text-green-500" />
                                        Statut des Queues
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                                    <div className="space-y-3">
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-muted-foreground">Série (1)</span>
                                                <span className="font-medium">{queueStatus.serial.pending} en attente</span>
                                            </div>
                                            <div className="w-full bg-secondary rounded-full h-2">
                                                <div 
                                                    className="bg-blue-500 h-2 rounded-full" 
                                                    style={{ width: `${Math.min(100, queueStatus.serial.pending * 20)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-muted-foreground">Parallèle limité (2)</span>
                                                <span className="font-medium">{queueStatus.limited.pending} en attente</span>
                                            </div>
                                            <div className="w-full bg-secondary rounded-full h-2">
                                                <div 
                                                    className="bg-purple-500 h-2 rounded-full" 
                                                    style={{ width: `${Math.min(100, queueStatus.limited.pending * 10)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-muted-foreground">Parallèle complet (4)</span>
                                                <span className="font-medium">{queueStatus.full.pending} en attente</span>
                                            </div>
                                            <div className="w-full bg-secondary rounded-full h-2">
                                                <div 
                                                    className="bg-green-500 h-2 rounded-full" 
                                                    style={{ width: `${Math.min(100, queueStatus.full.pending * 5)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Memory Report */}
                            <Card className="bg-card border border-border/40 shadow-sm">
                                <CardHeader className="pb-2 sm:pb-4 px-3 sm:px-6 py-3 sm:py-4 border-b border-border/30">
                                    <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                                        <Database className="h-4 w-4 text-orange-500" />
                                        Utilisation Mémoire
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">VRAM Totale:</span>
                                            <span className="font-medium">{memoryReport.stats.totalVRAM.toFixed(2)}GB</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">VRAM Utilisée:</span>
                                            <span className="font-medium">{memoryReport.stats.usedVRAM.toFixed(2)}GB</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Pourcentage:</span>
                                            <span className="font-medium">{memoryReport.stats.usagePercentage.toFixed(1)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Modèles chargés:</span>
                                            <span className="font-medium">{memoryReport.stats.loadedModelsCount}</span>
                                        </div>
                                    </div>
                                    
                                    {memoryReport.models.length > 0 && (
                                        <div className="mt-3 pt-2 border-t border-border/30">
                                            <p className="text-xs text-muted-foreground mb-1">Modèles chargés:</p>
                                            <div className="max-h-24 overflow-y-auto">
                                                {memoryReport.models.map((model: any) => (
                                                    <div key={model.key} className="flex justify-between text-xs py-1">
                                                        <span className="text-foreground truncate mr-2">{model.key}</span>
                                                        <span className="text-muted-foreground">{model.vram.toFixed(2)}GB</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}