import { useState, useEffect } from 'react';
import { runtimeManager } from '@/core/kernel/RuntimeManager';
import { taskExecutor } from '@/core/kernel/TaskExecutor';
import { memoryManager } from '@/core/kernel/MemoryManager';
import { resourceManager } from '@/core/kernel/ResourceManager';
import { monitoringService } from '@/core/kernel/monitoring/MonitoringService';

interface SystemMetrics {
  runtime: ReturnType<typeof runtimeManager.getPerformanceMetrics>;
  executor: ReturnType<typeof taskExecutor.getStats>;
  memory: ReturnType<typeof memoryManager.getMemoryReport>;
  resources: Awaited<ReturnType<typeof resourceManager.getStatus>>;
  monitoring: ReturnType<typeof monitoringService.getAggregatedStats>;
}

export const useSystemMetrics = (pollingInterval: number = 2000) => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout;

    const fetchMetrics = async () => {
      try {
        if (!isMounted) return;

        const runtimeMetrics = runtimeManager.getPerformanceMetrics();
        const executorStats = taskExecutor.getStats();
        const memoryReport = memoryManager.getMemoryReport();
        const resourceStatus = await resourceManager.getStatus();
        const monitoringStats = monitoringService.getAggregatedStats();

        if (!isMounted) return;

        setMetrics({
          runtime: runtimeMetrics,
          executor: executorStats,
          memory: memoryReport,
          resources: resourceStatus,
          monitoring: monitoringStats
        });

        if (loading) {
          setLoading(false);
        }
      } catch (err) {
        if (!isMounted) return;
        
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setLoading(false);
      }
    };

    // Fetch immediately
    fetchMetrics();

    // Set up polling
    if (pollingInterval > 0) {
      intervalId = setInterval(fetchMetrics, pollingInterval);
    }

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [pollingInterval, loading]);

  return { metrics, loading, error, refresh: () => {
    setLoading(true);
    setError(null);
  } };
};