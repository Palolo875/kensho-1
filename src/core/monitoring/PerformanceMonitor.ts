import { globalMetrics } from './MetricsCollector';

/**
 * Moniteur de performance pour suivre les opérations
 */
export class PerformanceMonitor {
    private startTime: number;
    private readonly operationName: string;
    private readonly tags: Record<string, string>;

    constructor(operationName: string, tags: Record<string, string> = {}) {
        this.operationName = operationName;
        this.tags = tags;
        this.startTime = performance.now();
    }

    /**
     * Termine le monitoring et enregistre la durée
     */
    public end(): number {
        const duration = performance.now() - this.startTime;
        globalMetrics.recordTiming(`${this.operationName}_duration_ms`, duration, this.tags);
        return duration;
    }

    /**
     * Créer un checkpoint intermédiaire sans terminer le monitoring
     */
    public checkpoint(label: string): number {
        const duration = performance.now() - this.startTime;
        globalMetrics.recordTiming(
            `${this.operationName}_${label}_ms`,
            duration,
            this.tags
        );
        return duration;
    }

    /**
     * Redémarre le timer
     */
    public restart(): void {
        this.startTime = performance.now();
    }
}

/**
 * Décorateur pour monitorer automatiquement les performances d'une méthode
 */
export function Monitor(metricName?: string) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        const name = metricName || `${target.constructor.name}.${propertyKey}`;

        descriptor.value = async function (...args: any[]) {
            const monitor = new PerformanceMonitor(name);
            try {
                const result = await originalMethod.apply(this, args);
                monitor.end();
                globalMetrics.incrementCounter(`${name}_success`);
                return result;
            } catch (error) {
                monitor.end();
                globalMetrics.incrementCounter(`${name}_error`);
                throw error;
            }
        };

        return descriptor;
    };
}

/**
 * Helper pour monitorer une fonction
 */
export async function monitorAsync<T>(
    operationName: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
): Promise<T> {
    const monitor = new PerformanceMonitor(operationName, tags);
    try {
        const result = await fn();
        monitor.end();
        globalMetrics.incrementCounter(`${operationName}_success`);
        return result;
    } catch (error) {
        monitor.end();
        globalMetrics.incrementCounter(`${operationName}_error`);
        throw error;
    }
}

/**
 * Helper pour monitorer une fonction synchrone
 */
export function monitorSync<T>(
    operationName: string,
    fn: () => T,
    tags?: Record<string, string>
): T {
    const monitor = new PerformanceMonitor(operationName, tags);
    try {
        const result = fn();
        monitor.end();
        globalMetrics.incrementCounter(`${operationName}_success`);
        return result;
    } catch (error) {
        monitor.end();
        globalMetrics.incrementCounter(`${operationName}_error`);
        throw error;
    }
}
