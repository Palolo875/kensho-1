import { useState, useEffect } from 'react';
import { kenshoBridge } from '@/core/bridge/ui-bridge';
import { opfsPersistence } from '@/core/kernel/OPFSPersistence';
import { createLogger } from '@/lib/logger';

const log = createLogger('Dashboard');

interface WorkerMetrics {
  activeConnections: number;
  uptime: number;
  memoryUsage: number;
  totalRequests: number;
  isInitialized: boolean;
}

interface KenshoStats {
  totalRequests: number;
  totalUptime: number;
  sessionCount: number;
}

export default function Dashboard() {
  const [workerMetrics, setWorkerMetrics] = useState<WorkerMetrics | null>(null);
  const [kenshoStats, setKenshoStats] = useState<KenshoStats | null>(null);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await kenshoBridge.connect({
          onStateChange: (state, details) => {
            setConnectionState(state);
            log.info(`Bridge state: ${state}`, details);
          },
          onMessage: () => {
            updateMetrics();
          },
        });

        updateMetrics();

        const interval = setInterval(() => {
          updateMetrics();
        }, 2000);

        return () => clearInterval(interval);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        log.error('Dashboard init error:', message);
      }
    };

    init();
  }, []);

  const updateMetrics = async () => {
    try {
      const status = await kenshoBridge.getStatus();
      setWorkerMetrics({
        activeConnections: status?.activeConnections || 0,
        uptime: status?.uptime || 0,
        memoryUsage: 0,
        totalRequests: 0,
        isInitialized: true,
      });

      const stats = opfsPersistence.getHistoricalStats();
      setKenshoStats(stats);
    } catch (err) {
      log.error('Error updating metrics:', err);
    }
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-slate-900 dark:text-slate-50">
          Kensho Dashboard
        </h1>

        {/* Connection Status */}
        <div className="mb-8 p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">
                Connection Status
              </h2>
              <p className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                connectionState === 'ready' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : connectionState === 'connecting' 
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}>
                {connectionState.toUpperCase()}
              </p>
            </div>
          </div>
        </div>

        {/* Worker Metrics */}
        {workerMetrics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              {
                label: 'Active Connections',
                value: workerMetrics.activeConnections,
                icon: '🔌',
              },
              {
                label: 'Uptime',
                value: formatUptime(workerMetrics.uptime),
                icon: '⏱️',
              },
              {
                label: 'Memory Usage',
                value: formatBytes(workerMetrics.memoryUsage),
                icon: '💾',
              },
              {
                label: 'Total Requests',
                value: workerMetrics.totalRequests,
                icon: '📊',
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700"
              >
                <div className="text-2xl mb-2">{metric.icon}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  {metric.label}
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Historical Stats */}
        {kenshoStats && (
          <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md mb-8">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
              Historical Statistics
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Total Requests
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  {kenshoStats.totalRequests}
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Total Uptime
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  {formatUptime(kenshoStats.totalUptime)}
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Sessions
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  {kenshoStats.sessionCount}
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
