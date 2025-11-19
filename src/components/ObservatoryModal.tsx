// src/components/ObservatoryModal.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Crown, Activity, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface ObservatoryModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workers: WorkerStatus[];
    leader: string | null;
    epoch: number;
    logs: LogEntry[];
    onKillWorker: (name: string) => void;
}

export function ObservatoryModal({
    open,
    onOpenChange,
    workers,
    leader,
    epoch,
    logs,
    onKillWorker
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
            <DialogContent className="max-w-6xl max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Orion Observatory
                        <Badge variant="outline" className="ml-auto">
                            Epoch {epoch}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="constellation" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="constellation">Constellation</TabsTrigger>
                        <TabsTrigger value="logs">Logs</TabsTrigger>
                    </TabsList>

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
