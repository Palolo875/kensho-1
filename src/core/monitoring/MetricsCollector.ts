/**
 * Collecteur de métriques pour le monitoring temps réel
 * Permet de suivre les performances du système (latence, throughput, etc.)
 */

export interface Metric {
    name: string;
    value: number;
    timestamp: number;
    tags?: Record<string, string>;
}

export interface MetricStats {
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
}

interface MetricWindow {
    values: number[];
    timestamps: number[];
    maxSize: number;
}

/**
 * Collecteur de métriques avec agrégation en temps réel
 */
export class MetricsCollector {
    private metrics: Map<string, MetricWindow> = new Map();
    private counters: Map<string, number> = new Map();
    private readonly windowSize: number;
    private readonly windowDuration: number; // en ms

    constructor(config: { windowSize?: number; windowDuration?: number } = {}) {
        this.windowSize = config.windowSize || 1000;
        this.windowDuration = config.windowDuration || 60000; // 1 minute par défaut
    }

    /**
     * Enregistre une métrique de temps (latence, durée)
     */
    public recordTiming(name: string, value: number, tags?: Record<string, string>): void {
        const key = this.buildKey(name, tags);
        this.recordValue(key, value);
    }

    /**
     * Incrémente un compteur
     */
    public incrementCounter(name: string, delta: number = 1, tags?: Record<string, string>): void {
        const key = this.buildKey(name, tags);
        const current = this.counters.get(key) || 0;
        this.counters.set(key, current + delta);
    }

    /**
     * Enregistre une valeur de gauge (valeur instantanée)
     */
    public recordGauge(name: string, value: number, tags?: Record<string, string>): void {
        const key = this.buildKey(name, tags);
        this.counters.set(key, value);
    }

    /**
     * Calcule les statistiques pour une métrique donnée
     */
    public getStats(name: string, tags?: Record<string, string>): MetricStats | null {
        const key = this.buildKey(name, tags);
        const window = this.metrics.get(key);
        
        if (!window || window.values.length === 0) {
            return null;
        }

        // Nettoyer les valeurs expirées
        this.cleanExpiredValues(window);

        const values = window.values;
        if (values.length === 0) {
            return null;
        }

        const sorted = [...values].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        const count = sorted.length;

        return {
            count,
            sum,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sum / count,
            p50: this.percentile(sorted, 50),
            p95: this.percentile(sorted, 95),
            p99: this.percentile(sorted, 99)
        };
    }

    /**
     * Récupère la valeur d'un compteur
     */
    public getCounter(name: string, tags?: Record<string, string>): number {
        const key = this.buildKey(name, tags);
        return this.counters.get(key) || 0;
    }

    /**
     * Récupère toutes les métriques
     */
    public getAllMetrics(): Record<string, any> {
        const result: Record<string, any> = {};

        // Compteurs
        for (const [key, value] of this.counters.entries()) {
            result[key] = value;
        }

        // Statistiques des timings
        for (const [key] of this.metrics.entries()) {
            const stats = this.getStats(key);
            if (stats) {
                result[`${key}_stats`] = stats;
            }
        }

        return result;
    }

    /**
     * Réinitialise toutes les métriques
     */
    public reset(): void {
        this.metrics.clear();
        this.counters.clear();
    }

    /**
     * Enregistre une valeur dans la fenêtre glissante
     */
    private recordValue(key: string, value: number): void {
        let window = this.metrics.get(key);
        
        if (!window) {
            window = {
                values: [],
                timestamps: [],
                maxSize: this.windowSize
            };
            this.metrics.set(key, window);
        }

        window.values.push(value);
        window.timestamps.push(Date.now());

        // Limiter la taille de la fenêtre
        if (window.values.length > window.maxSize) {
            window.values.shift();
            window.timestamps.shift();
        }
    }

    /**
     * Nettoie les valeurs expirées de la fenêtre
     */
    private cleanExpiredValues(window: MetricWindow): void {
        const now = Date.now();
        const cutoff = now - this.windowDuration;

        let firstValidIndex = 0;
        while (firstValidIndex < window.timestamps.length && 
               window.timestamps[firstValidIndex] < cutoff) {
            firstValidIndex++;
        }

        if (firstValidIndex > 0) {
            window.values.splice(0, firstValidIndex);
            window.timestamps.splice(0, firstValidIndex);
        }
    }

    /**
     * Calcule le percentile d'un tableau trié
     */
    private percentile(sortedValues: number[], p: number): number {
        if (sortedValues.length === 0) return 0;
        if (sortedValues.length === 1) return sortedValues[0];

        const index = (p / 100) * (sortedValues.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;

        return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
    }

    /**
     * Construit une clé unique pour une métrique avec ses tags
     */
    private buildKey(name: string, tags?: Record<string, string>): string {
        if (!tags || Object.keys(tags).length === 0) {
            return name;
        }

        const tagString = Object.entries(tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${v}`)
            .join(',');

        return `${name}{${tagString}}`;
    }
}

/**
 * Instance globale du collecteur de métriques
 */
export const globalMetrics = new MetricsCollector({
    windowSize: 1000,
    windowDuration: 60000 // 1 minute
});
