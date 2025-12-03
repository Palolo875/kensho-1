import { useState, useEffect } from 'react';
import { runtimeManager } from '@/core/kernel/RuntimeManager';
import { taskExecutor } from '@/core/kernel/TaskExecutor';
import { memoryManager } from '@/core/kernel/MemoryManager';
import { resourceManager } from '@/core/kernel/ResourceManager';
import { monitoringService } from '@/core/kernel/monitoring/MonitoringService';

interface SimpleSystemMetrics {
  memory: {
    usagePercentage: number;
    usedVRAM: number;
    totalVRAM: number;
  };
  cpu: {
    averageExecutionTime: number;
  };
  resources: {
    network: {
      isOnline: boolean;
      effectiveType: string;
    };
    battery?: {
      level: number;
      isCharging: boolean;
    };
    powerSaveMode: boolean;
  };
  monitoring: {
    avgTtft: number;
    avgTotalTime: number;
    errorRate: number;
    cacheHitRate: number;
  };
}

export const useSimpleSystemMetrics = (pollingInterval: number = 3000) => {
  const [metrics, setMetrics] = useState<SimpleSystemMetrics | null>(null);
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

        const simpleMetrics: SimpleSystemMetrics = {
          memory: {
            usagePercentage: memoryReport.stats.usagePercentage,
            usedVRAM: memoryReport.stats.usedVRAM,
            totalVRAM: memoryReport.stats.totalVRAM
          },
          cpu: {
            averageExecutionTime: executorStats.averageExecutionTime
          },
          resources: {
            network: {
              isOnline: resourceStatus.network.isOnline,
              effectiveType: resourceStatus.network.effectiveType
            },
            battery: resourceStatus.battery ? {
              level: resourceStatus.battery.level,
              isCharging: resourceStatus.battery.isCharging
            } : undefined,
            powerSaveMode: resourceStatus.powerSaveMode
          },
          monitoring: {
            avgTtft: monitoringStats.avgTtft,
            avgTotalTime: monitoringStats.avgTotalTime,
            errorRate: monitoringStats.errorRate,
            cacheHitRate: monitoringStats.cacheHitRate
          }
        };

        setMetrics(simpleMetrics);

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