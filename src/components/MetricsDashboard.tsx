import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { globalMetrics } from '@/core/monitoring';
import type { MetricStats } from '@/core/monitoring';

interface DashboardMetrics {
    websocket: {
        state: number;
        connections: number;
        disconnections: number;
        errors: number;
        messagesSent: number;
        messagesReceived: number;
        bytesSent: number;
        bytesReceived: number;
        queueSize: number;
        messagesDropped: number;
        circuitBreakerOpen: number;
        parseErrors: number;
        sendErrors: number;
    };
    latency: {
        sendTime?: MetricStats;
        processTime?: MetricStats;
        parseTime?: MetricStats;
        heartbeatRtt?: MetricStats;
    };
}

export function MetricsDashboard() {
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [refreshInterval, setRefreshInterval] = useState(1000);

    useEffect(() => {
        const updateMetrics = () => {
            const allMetrics = globalMetrics.getAllMetrics();
            
            const dashboardMetrics: DashboardMetrics = {
                websocket: {
                    state: allMetrics['websocket.state'] || 0,
                    connections: allMetrics['websocket.connections'] || 0,
                    disconnections: allMetrics['websocket.disconnections'] || 0,
                    errors: allMetrics['websocket.errors'] || 0,
                    messagesSent: allMetrics['websocket.messages_sent'] || 0,
                    messagesReceived: allMetrics['websocket.messages_received'] || 0,
                    bytesSent: allMetrics['websocket.bytes_sent'] || 0,
                    bytesReceived: allMetrics['websocket.bytes_received'] || 0,
                    queueSize: allMetrics['websocket.queue_size'] || 0,
                    messagesDropped: allMetrics['websocket.messages_dropped'] || 0,
                    circuitBreakerOpen: allMetrics['websocket.circuit_breaker_open'] || 0,
                    parseErrors: allMetrics['websocket.parse_errors'] || 0,
                    sendErrors: allMetrics['websocket.send_errors'] || 0,
                },
                latency: {
                    sendTime: allMetrics['websocket.message.send_time_ms_stats'],
                    processTime: allMetrics['websocket.message.process_time_ms_stats'],
                    parseTime: allMetrics['websocket.message.parse_time_ms_stats'],
                    heartbeatRtt: allMetrics['websocket.heartbeat.rtt_ms_stats'],
                }
            };
            
            setMetrics(dashboardMetrics);
        };

        updateMetrics();
        const interval = setInterval(updateMetrics, refreshInterval);
        
        return () => clearInterval(interval);
    }, [refreshInterval]);

    if (!metrics) {
        return <div>Chargement des métriques...</div>;
    }

    const getStateLabel = (state: number) => {
        switch (state) {
            case 1: return { label: 'Connecté', variant: 'default' as const };
            case 0: return { label: 'Déconnecté', variant: 'destructive' as const };
            case -1: return { label: 'Circuit Ouvert', variant: 'destructive' as const };
            default: return { label: 'Inconnu', variant: 'secondary' as const };
        }
    };

    const stateInfo = getStateLabel(metrics.websocket.state);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    const formatLatency = (stats?: MetricStats) => {
        if (!stats) return 'N/A';
        return `${stats.avg.toFixed(2)}ms (p95: ${stats.p95.toFixed(2)}ms)`;
    };

    return (
        <div className="space-y-4 p-4">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Dashboard Métriques</h2>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rafraîchissement:</span>
                    <select 
                        value={refreshInterval} 
                        onChange={(e) => setRefreshInterval(Number(e.target.value))}
                        className="text-sm border rounded px-2 py-1"
                    >
                        <option value={500}>500ms</option>
                        <option value={1000}>1s</option>
                        <option value={2000}>2s</option>
                        <option value={5000}>5s</option>
                    </select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">État WebSocket</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Badge variant={stateInfo.variant}>{stateInfo.label}</Badge>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Messages Envoyés</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.websocket.messagesSent}</div>
                        <p className="text-xs text-muted-foreground">
                            {formatBytes(metrics.websocket.bytesSent)} total
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Messages Reçus</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.websocket.messagesReceived}</div>
                        <p className="text-xs text-muted-foreground">
                            {formatBytes(metrics.websocket.bytesReceived)} total
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">File d'Attente</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.websocket.queueSize}</div>
                        <p className="text-xs text-muted-foreground">
                            {metrics.websocket.messagesDropped} abandonnés
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Latence</CardTitle>
                        <CardDescription>Temps de traitement des messages</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-sm">Envoi:</span>
                            <span className="text-sm font-mono">{formatLatency(metrics.latency.sendTime)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Traitement:</span>
                            <span className="text-sm font-mono">{formatLatency(metrics.latency.processTime)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Parsing:</span>
                            <span className="text-sm font-mono">{formatLatency(metrics.latency.parseTime)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Heartbeat RTT:</span>
                            <span className="text-sm font-mono">{formatLatency(metrics.latency.heartbeatRtt)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Fiabilité</CardTitle>
                        <CardDescription>Erreurs et reconnexions</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-sm">Connexions:</span>
                            <span className="text-sm font-mono">{metrics.websocket.connections}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Déconnexions:</span>
                            <span className="text-sm font-mono">{metrics.websocket.disconnections}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Erreurs WebSocket:</span>
                            <span className="text-sm font-mono">{metrics.websocket.errors}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Erreurs d'envoi:</span>
                            <span className="text-sm font-mono">{metrics.websocket.sendErrors}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Erreurs de parsing:</span>
                            <span className="text-sm font-mono">{metrics.websocket.parseErrors}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Circuit breaker ouvert:</span>
                            <span className="text-sm font-mono">{metrics.websocket.circuitBreakerOpen}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
