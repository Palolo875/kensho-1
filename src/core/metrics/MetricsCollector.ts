/**
 * MetricsCollector - Collecte et agrège les métriques du système
 * 
 * Métriques collectées:
 * - Latence des requêtes (min, max, moyenne, p50, p95, p99)
 * - Throughput (messages/sec)
 * - Taux d'erreur
 * - Nombre de requêtes en attente
 * - Taille de la queue offline
 */

export interface Metric {
    timestamp: number;
    name: string;
    value: number;
    tags?: Record<string, string>;
}

export interface LatencyStats {
    count: number;
    min: number;
    max: number;
    sum: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
}

export interface ThroughputStats {
    messagesPerSecond: number;
    totalMessages: number;
    windowStart: number;
    windowEnd: number;
}

export interface ErrorStats {
    totalErrors: number;
    errorRate: number; // Pourcentage d'erreurs
    errorsByType: Record<string, number>;
}

export interface SystemStats {
    latency: LatencyStats;
    throughput: ThroughputStats;
    errors: ErrorStats;
    pendingRequests: number;
    offlineQueueSize: number;
    transportState?: {
        state: string;
        reconnectAttempts: number;
        isHealthy: boolean;
    };
}

export class MetricsCollector {
    private metrics: Metric[] = [];
    private latencies: { timestamp: number; value: number }[] = [];
    private messageCount = 0;
    private errorCount = 0;
    private errorsByType = new Map<string, number>();
    private windowStart = Date.now();
    private readonly maxMetricsHistory = 10000; // Garder max 10k métriques en mémoire
    private readonly windowDuration = 60000; // Fenêtre de 1 minute pour le throughput
    private cleanupInterval?: NodeJS.Timeout;

    constructor() {
        // Nettoyer les entrées anciennes toutes les 30 secondes
        this.cleanupInterval = setInterval(() => this.evictOldEntries(), 30000);
    }

    /**
     * Supprime les entrées plus vieilles que 5 minutes
     */
    private evictOldEntries(): void {
        const cutoff = Date.now() - (5 * 60 * 1000); // 5 minutes
        
        // Éviction basée sur le temps pour latencies
        this.latencies = this.latencies.filter(entry => entry.timestamp > cutoff);
        
        // Éviction basée sur le temps pour metrics
        this.metrics = this.metrics.filter(metric => metric.timestamp > cutoff);
    }

    /**
     * Nettoie les ressources
     */
    public dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
    }

    /**
     * Enregistre la latence d'une requête
     */
    public recordLatency(latencyMs: number, tags?: Record<string, string>): void {
        const now = Date.now();
        this.latencies.push({ timestamp: now, value: latencyMs });
        this.recordMetric('request.latency', latencyMs, tags);
        
        // Limiter la taille de l'historique (double protection)
        if (this.latencies.length > this.maxMetricsHistory) {
            this.latencies.shift();
        }
    }

    /**
     * Enregistre un message traité
     */
    public recordMessage(tags?: Record<string, string>): void {
        this.messageCount++;
        this.recordMetric('message.count', 1, tags);
    }

    /**
     * Enregistre une erreur
     */
    public recordError(errorType: string, tags?: Record<string, string>): void {
        this.errorCount++;
        this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1);
        this.recordMetric('error.count', 1, { ...tags, errorType });
    }

    /**
     * Enregistre une métrique générique
     */
    private recordMetric(name: string, value: number, tags?: Record<string, string>): void {
        const metric: Metric = {
            timestamp: Date.now(),
            name,
            value,
            tags
        };
        
        this.metrics.push(metric);
        
        // Limiter la taille de l'historique
        if (this.metrics.length > this.maxMetricsHistory) {
            this.metrics.shift();
        }
    }

    /**
     * Calcule les statistiques de latence
     */
    public getLatencyStats(): LatencyStats {
        if (this.latencies.length === 0) {
            return {
                count: 0,
                min: 0,
                max: 0,
                sum: 0,
                avg: 0,
                p50: 0,
                p95: 0,
                p99: 0
            };
        }

        const values = this.latencies.map(entry => entry.value);
        const sorted = [...values].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((acc, val) => acc + val, 0);

        return {
            count,
            min: sorted[0],
            max: sorted[count - 1],
            sum,
            avg: sum / count,
            p50: this.percentile(sorted, 0.50),
            p95: this.percentile(sorted, 0.95),
            p99: this.percentile(sorted, 0.99)
        };
    }

    /**
     * Calcule un percentile
     */
    private percentile(sorted: number[], p: number): number {
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Calcule les statistiques de throughput
     */
    public getThroughputStats(): ThroughputStats {
        const now = Date.now();
        const windowDuration = now - this.windowStart;
        const messagesPerSecond = windowDuration > 0 
            ? (this.messageCount / windowDuration) * 1000 
            : 0;

        return {
            messagesPerSecond,
            totalMessages: this.messageCount,
            windowStart: this.windowStart,
            windowEnd: now
        };
    }

    /**
     * Calcule les statistiques d'erreurs
     */
    public getErrorStats(): ErrorStats {
        const totalRequests = this.messageCount;
        const errorRate = totalRequests > 0 
            ? (this.errorCount / totalRequests) * 100 
            : 0;

        const errorsByType: Record<string, number> = {};
        this.errorsByType.forEach((count, type) => {
            errorsByType[type] = count;
        });

        return {
            totalErrors: this.errorCount,
            errorRate,
            errorsByType
        };
    }

    /**
     * Retourne toutes les statistiques du système
     */
    public getSystemStats(pendingRequests: number, offlineQueueSize: number, transportState?: any): SystemStats {
        return {
            latency: this.getLatencyStats(),
            throughput: this.getThroughputStats(),
            errors: this.getErrorStats(),
            pendingRequests,
            offlineQueueSize,
            transportState
        };
    }

    /**
     * Réinitialise les métriques de la fenêtre actuelle
     */
    public resetWindow(): void {
        this.windowStart = Date.now();
        this.messageCount = 0;
        this.errorCount = 0;
        this.errorsByType.clear();
    }

    /**
     * Nettoie toutes les métriques
     */
    public reset(): void {
        this.metrics = [];
        this.latencies = [];
        this.resetWindow();
    }

    /**
     * Exporte les métriques brutes
     */
    public exportMetrics(): Metric[] {
        return [...this.metrics];
    }

    /**
     * Génère un rapport formaté
     */
    public generateReport(): string {
        const latency = this.getLatencyStats();
        const throughput = this.getThroughputStats();
        const errors = this.getErrorStats();

        return `
📊 KENSHO METRICS REPORT
========================

📈 Latency Statistics:
  - Count: ${latency.count}
  - Min: ${latency.min.toFixed(2)}ms
  - Max: ${latency.max.toFixed(2)}ms
  - Avg: ${latency.avg.toFixed(2)}ms
  - P50: ${latency.p50.toFixed(2)}ms
  - P95: ${latency.p95.toFixed(2)}ms
  - P99: ${latency.p99.toFixed(2)}ms

🚀 Throughput:
  - Messages/sec: ${throughput.messagesPerSecond.toFixed(2)}
  - Total messages: ${throughput.totalMessages}
  - Window duration: ${((throughput.windowEnd - throughput.windowStart) / 1000).toFixed(1)}s

❌ Errors:
  - Total errors: ${errors.totalErrors}
  - Error rate: ${errors.errorRate.toFixed(2)}%
  - Errors by type: ${JSON.stringify(errors.errorsByType, null, 2)}

========================
        `.trim();
    }
}
