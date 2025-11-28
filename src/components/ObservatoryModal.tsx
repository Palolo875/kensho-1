// src/components/ObservatoryModal.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Crown, Activity, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SAMPLE_JOURNAL } from "@/utils/sampleJournal";

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
            case 'warn': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
            default: return <Info className="h-4 w-4 text-blue-500" />;
        }
    };

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'error': return 'border-destructive';
            case 'warn': return 'border-yellow-500';
            default: return 'border-blue-500';
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full max-w-2xl sm:max-w-4xl lg:max-w-6xl max-h-[85vh] sm:max-h-[90vh] bg-background/95 border border-border/40 backdrop-blur-md p-3 sm:p-6">
                <DialogHeader className="pb-3 sm:pb-4 border-b border-border/30">
                    <DialogTitle className="flex items-center gap-2 text-lg sm:text-2xl font-semibold">
                        <Activity className="h-4 sm:h-6 w-4 sm:w-6 text-primary" />
                        <span className="text-base sm:text-2xl">Orion Observatory</span>
                        <Badge variant="outline" className="ml-auto text-[10px] sm:text-xs">
                            Epoch {epoch}
                        </Badge>
                    </DialogTitle>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">Surveillance en temps réel des agents et du journal cognitif</p>
                </DialogHeader>

                <Tabs defaultValue="journal" className="w-full mt-3 sm:mt-6">
                    <TabsList className="grid w-full grid-cols-3 bg-background border border-border/40 h-auto">
                        <TabsTrigger value="journal" className="text-xs sm:text-sm font-light py-2 sm:py-3">Journal</TabsTrigger>
                        <TabsTrigger value="constellation" className="text-xs sm:text-sm font-light py-2 sm:py-3">Agents</TabsTrigger>
                        <TabsTrigger value="logs" className="text-xs sm:text-sm font-light py-2 sm:py-3">Logs</TabsTrigger>
                    </TabsList>

                    <TabsContent value="journal" className="space-y-2 sm:space-y-4 mt-3 sm:mt-4">
                        {journal || SAMPLE_JOURNAL ? (
                            <div className="space-y-2 sm:space-y-4">
                                <Card className="bg-card border border-border/40 shadow-sm">
                                    <CardHeader className="pb-2 sm:pb-4 px-3 sm:px-6 py-3 sm:py-4 border-b border-border/30">
                                        <CardTitle className="flex items-center gap-2 text-sm sm:text-lg font-semibold flex-wrap">
                                            📊 Journal Cognitif
                                            {(journal || SAMPLE_JOURNAL)?.degradationApplied && (
                                                <Badge variant="destructive" className="text-[8px] sm:text-xs">Graceful Degradation</Badge>
                                            )}
                                            {!journal && (
                                                <Badge variant="outline" className="ml-auto text-[8px] sm:text-xs">Exemple</Badge>
                                            )}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2 sm:space-y-4 px-3 sm:px-6 py-3 sm:py-4">
                                        {!journal && (
                                            <div className="bg-blue-500/10 border border-blue-500 rounded p-2 sm:p-3 mb-2 sm:mb-4">
                                                <p className="text-[9px] sm:text-xs text-blue-600"><strong>💡 Exemple:</strong> Voici à quoi ressemble un débat complet.</p>
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
                                                <CardContent className="pt-4">
                                                    <p className="text-sm"><strong>⚠️ Dégradation:</strong> {(journal || SAMPLE_JOURNAL)?.degradationReason}</p>
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

                    <TabsContent value="constellation" className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {workers.map((worker) => (
                                <Card
                                    key={worker.name}
                                    className={cn(
                                        "transition-all",
                                        worker.name === leader && "ring-2 ring-yellow-500/50 bg-yellow-500/5"
                                    )}
                                >
                                    <CardHeader className="pb-3">
                                        <CardTitle className="flex items-center gap-2">
                                            {worker.name === leader && (
                                                <Crown className="h-5 w-5 text-yellow-500" />
                                            )}
                                            <span className="text-base">{worker.name}</span>
                                        </CardTitle>
                                        <CardDescription className="flex items-center gap-2">
                                            <div className={cn(
                                                "h-2 w-2 rounded-full",
                                                worker.active ? "bg-green-500" : "bg-red-500"
                                            )} />
                                            {worker.active ? 'Active' : 'Inactive'}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="w-full"
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

                    <TabsContent value="logs">
                        <Card>
                            <CardHeader>
                                <CardTitle>Log Stream</CardTitle>
                                <CardDescription>
                                    Real-time logs from all agents (last 100 entries)
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                                    <div className="space-y-2">
                                        {logs.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-8">
                                                No logs yet. Logs will appear here as agents communicate.
                                            </p>
                                        ) : (
                                            logs.map((log, index) => (
                                                <div
                                                    key={`${log.timestamp}-${index}`}
                                                    className={cn(
                                                        "flex gap-2 p-2 rounded-md border-l-2",
                                                        getLevelColor(log.level),
                                                        "bg-muted/50"
                                                    )}
                                                >
                                                    {getLevelIcon(log.level)}
                                                    <div className="flex-1 space-y-1">
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-xs text-muted-foreground font-mono">
                                                                {new Date(log.timestamp).toLocaleTimeString()}
                                                            </span>
                                                            <Badge variant="secondary" className="text-xs">
                                                                {log.agent}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm">{log.message}</p>
                                                        {log.data && (
                                                            <pre className="text-xs bg-background p-2 rounded mt-1 overflow-x-auto">
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
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
