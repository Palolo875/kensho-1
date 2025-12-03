/**
 * PerformanceDashboard - Priority 5 Feature
 * Displays multi-agent performance metrics and execution statistics
 */

import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Activity, TrendingUp, Clock, Zap, BarChart3, Cpu, Database, AlertTriangle } from 'lucide-react';
import { runtimeManager } from '@/core/kernel/RuntimeManager';
import { taskExecutor } from '@/core/kernel/TaskExecutor';
import { memoryManager } from '@/core/kernel/MemoryManager';

interface QueueStats {
  queueName: string;
  pending: number;
  active: number;
  completed: number;
  failed: number;
}

interface PerformanceMetrics {
  responseTime: { timestamp: number; duration: number }[];
  successRate: number;
  averageQueueTime: number;
  peakConcurrency: number;
  totalRequests: number;
}

interface DetailedMetrics {
  runtime: any;
  executor: any;
  memory: any;
  queue: any;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const PerformanceDashboard = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    responseTime: [],
    successRate: 0.95,
    averageQueueTime: 0,
    peakConcurrency: 0,
    totalRequests: 0
  });
  
  const [detailedMetrics, setDetailedMetrics] = useState<DetailedMetrics>({
    runtime: null,
    executor: null,
    memory: null,
    queue: null
  });

  const [queueStats] = useState<QueueStats[]>([
    { queueName: 'SERIAL', pending: 2, active: 1, completed: 45, failed: 1 },
    { queueName: 'PARALLEL_LIMITED', pending: 1, active: 2, completed: 32, failed: 0 },
    { queueName: 'PARALLEL_FULL', pending: 0, active: 3, completed: 28, failed: 2 }
  ]);

  // Generate mock response time data
  useEffect(() => {
    const data = Array.from({ length: 12 }, (_, i) => ({
      timestamp: Date.now() - (12 - i) * 60000,
      duration: Math.floor(Math.random() * 5000) + 1000
    }));
    setMetrics(prev => ({ ...prev, responseTime: data }));
  }, []);
  
  // Fetch detailed metrics
  useEffect(() => {
    const interval = setInterval(() => {
      const runtimeMetrics = runtimeManager.getPerformanceMetrics();
      const executorStats = taskExecutor.getStats();
      const queueStatus = taskExecutor.getQueueStatus();
      const memoryReport = memoryManager.getMemoryReport();
      
      setDetailedMetrics({
        runtime: runtimeMetrics,
        executor: executorStats,
        memory: memoryReport,
        queue: queueStatus
      });
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const successCount = 105;
  const failureCount = 3;
  const successRateData = [
    { name: 'Success', value: successCount },
    { name: 'Failed', value: failureCount }
  ];
  
  // Prepare memory usage data for chart
  const memoryData = detailedMetrics.memory ? [
    { name: 'Utilisée', value: detailedMetrics.memory.stats.usedVRAM },
    { name: 'Disponible', value: detailedMetrics.memory.stats.totalVRAM - detailedMetrics.memory.stats.usedVRAM }
  ] : [];

  // Prepare resource utilization data
  const resourceData = detailedMetrics.memory && detailedMetrics.executor ? [
    { name: 'Mémoire', value: detailedMetrics.memory.stats.usagePercentage },
    { name: 'CPU', value: detailedMetrics.executor.averageExecutionTime > 0 ? Math.min(100, detailedMetrics.executor.averageExecutionTime / 100) : 0 },
    { name: 'Disque', value: 0 }, // Placeholder for disk usage
    { name: 'Réseau', value: 0 }  // Placeholder for network usage
  ] : [];

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Header - MASTERPROMPT Style - Responsive */}
      <div className="space-y-1 sm:space-y-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <Activity className="h-4 sm:h-5 w-4 sm:w-5 text-primary" />
          <h2 className="text-lg sm:text-2xl md:text-3xl font-semibold text-foreground">Performance Dashboard</h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">Real-time multi-agent execution metrics</p>
      </div>

      {/* Key Metrics - MASTERPROMPT Cards - Responsive */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <Card className="bg-card border border-border/40 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/30">
            <CardTitle className="text-[10px] sm:text-xs font-light text-muted-foreground uppercase tracking-wider">Total</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 sm:pt-4 px-3 sm:px-4 py-3 sm:py-4">
            <div className="text-2xl sm:text-3xl font-bold text-foreground">{successCount + failureCount}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/30">
            <CardTitle className="text-[10px] sm:text-xs font-light text-muted-foreground uppercase tracking-wider">Success</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 sm:pt-4 px-3 sm:px-4 py-3 sm:py-4">
            <div className="text-2xl sm:text-3xl font-bold text-foreground">
              {((successCount / (successCount + failureCount)) * 100).toFixed(0)}%
            </div>
            <Badge variant="outline" className="mt-1 sm:mt-3 text-[8px] sm:text-xs">✓ Good</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/30">
            <CardTitle className="text-[10px] sm:text-xs font-light text-muted-foreground uppercase tracking-wider">Avg Response</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 sm:pt-4 px-3 sm:px-4 py-3 sm:py-4">
            <div className="text-2xl sm:text-3xl font-bold text-foreground">
              {metrics.responseTime.length > 0
                ? Math.round(metrics.responseTime.reduce((sum, d) => sum + d.duration, 0) / metrics.responseTime.length)
                : 0
              }ms
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Latest</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/30">
            <CardTitle className="text-[10px] sm:text-xs font-light text-muted-foreground uppercase tracking-wider">Active</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 sm:pt-4 px-3 sm:px-4 py-3 sm:py-4">
            <div className="text-2xl sm:text-3xl font-bold text-foreground">
              {queueStats.reduce((sum, q) => sum + q.active, 0)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs - MASTERPROMPT Style - Responsive */}
      <Tabs defaultValue="response-time" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-background border border-border/40 h-auto">
          <TabsTrigger value="response-time" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-light py-2 sm:py-3">
            <Clock className="h-3 sm:h-4 w-3 sm:w-4" />
            <span className="hidden sm:inline">Response Time</span>
            <span className="sm:hidden">Response</span>
          </TabsTrigger>
          <TabsTrigger value="queue-stats" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-light py-2 sm:py-3">
            <BarChart3 className="h-3 sm:h-4 w-3 sm:w-4" />
            <span className="hidden sm:inline">Queue Stats</span>
            <span className="sm:hidden">Queue</span>
          </TabsTrigger>
          <TabsTrigger value="success-rate" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-light py-2 sm:py-3">
            <TrendingUp className="h-3 sm:h-4 w-3 sm:w-4" />
            <span className="hidden sm:inline">Success Rate</span>
            <span className="sm:hidden">Success</span>
          </TabsTrigger>
          <TabsTrigger value="system-health" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-light py-2 sm:py-3">
            <Cpu className="h-3 sm:h-4 w-3 sm:w-4" />
            <span className="hidden sm:inline">System Health</span>
            <span className="sm:hidden">Health</span>
          </TabsTrigger>
          <TabsTrigger value="resource-utilization" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-light py-2 sm:py-3">
            <Database className="h-3 sm:h-4 w-3 sm:w-4" />
            <span className="hidden sm:inline">Resources</span>
            <span className="sm:hidden">Res</span>
          </TabsTrigger>
        </TabsList>

        {/* Response Time Chart */}
        <TabsContent value="response-time" className="space-y-2 sm:space-y-4 mt-3 sm:mt-4">
          <Card className="bg-card border border-border/40 shadow-sm">
            <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
              <CardTitle className="text-sm sm:text-base">Response Time Trend</CardTitle>
              <CardDescription className="text-xs">Last 12 requests</CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-6 py-2 sm:py-4">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={metrics.responseTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts).toLocaleTimeString()} />
                  <YAxis />
                  <Tooltip formatter={(value) => `${value}ms`} />
                  <Line
                    type="monotone"
                    dataKey="duration"
                    stroke="#3b82f6"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Queue Stats */}
        <TabsContent value="queue-stats" className="space-y-2 sm:space-y-4 mt-3 sm:mt-4">
          <Card className="bg-card border border-border/40 shadow-sm">
            <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
              <CardTitle className="text-sm sm:text-base">Queue Performance</CardTitle>
              <CardDescription className="text-xs">By execution strategy</CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-6 py-2 sm:py-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={queueStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="queueName" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="pending" fill="#f59e0b" name="Pending" />
                  <Bar dataKey="active" fill="#3b82f6" name="Active" />
                  <Bar dataKey="completed" fill="#10b981" name="Completed" />
                  <Bar dataKey="failed" fill="#ef4444" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Success Rate */}
        <TabsContent value="success-rate" className="space-y-2 sm:space-y-4 mt-3 sm:mt-4">
          <Card className="bg-card border border-border/40 shadow-sm">
            <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
              <CardTitle className="text-sm sm:text-base">Success Rate Distribution</CardTitle>
              <CardDescription className="text-xs">Success vs failed requests</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center px-2 sm:px-6 py-2 sm:py-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={successRateData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {successRateData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Health */}
        <TabsContent value="system-health" className="space-y-2 sm:space-y-4 mt-3 sm:mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Runtime Metrics */}
            {detailedMetrics.runtime && (
              <Card className="bg-card border border-border/40 shadow-sm">
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Cpu className="h-4 w-4 text-blue-500" />
                    Runtime Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Successful Inferences:</span>
                      <span className="font-medium">{detailedMetrics.runtime.successfulInferences}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Error Rate:</span>
                      <span className="font-medium">{(detailedMetrics.runtime.errorRate * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Latency:</span>
                      <span className="font-medium">{detailedMetrics.runtime.averageLatencyMs.toFixed(0)}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tokens/sec:</span>
                      <span className="font-medium">{detailedMetrics.runtime.averageTokensPerSecond}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Retries:</span>
                      <span className="font-medium">{detailedMetrics.runtime.totalRetries}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fallbacks:</span>
                      <span className="font-medium">{detailedMetrics.runtime.fallbacksTriggered}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Memory Usage */}
            {detailedMetrics.memory && (
              <Card className="bg-card border border-border/40 shadow-sm">
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Database className="h-4 w-4 text-green-500" />
                    Memory Usage
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">VRAM Used:</span>
                      <span className="font-medium">{detailedMetrics.memory.stats.usedVRAM.toFixed(2)}GB / {detailedMetrics.memory.stats.totalVRAM.toFixed(2)}GB</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2.5">
                      <div 
                        className="bg-green-600 h-2.5 rounded-full" 
                        style={{ width: `${detailedMetrics.memory.stats.usagePercentage}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {detailedMetrics.memory.stats.loadedModelsCount} models loaded ({detailedMetrics.memory.stats.pinnedModelsCount} pinned)
                    </div>
                  </div>
                  
                  {memoryData.length > 0 && (
                    <div className="mt-4 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={memoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={30}
                            outerRadius={50}
                            fill="#8884d8"
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            <Cell key="used" fill="#10b981" />
                            <Cell key="available" fill="#94a3b8" />
                          </Pie>
                          <Tooltip formatter={(value) => `${value}GB`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Task Executor Stats */}
            {detailedMetrics.executor && (
              <Card className="bg-card border border-border/40 shadow-sm">
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Zap className="h-4 w-4 text-purple-500" />
                    Task Executor
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Successful Executions:</span>
                      <span className="font-medium">{detailedMetrics.executor.successfulExecutions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Failed Executions:</span>
                      <span className="font-medium">{detailedMetrics.executor.failedExecutions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Execution Time:</span>
                      <span className="font-medium">{detailedMetrics.executor.averageExecutionTime.toFixed(0)}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cache Hits:</span>
                      <span className="font-medium">{detailedMetrics.executor.cacheHits}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cache Misses:</span>
                      <span className="font-medium">{detailedMetrics.executor.cacheMisses}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Retries:</span>
                      <span className="font-medium">{detailedMetrics.executor.totalRetries}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Queue Status */}
            {detailedMetrics.queue && (
              <Card className="bg-card border border-border/40 shadow-sm">
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Activity className="h-4 w-4 text-orange-500" />
                    Queue Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Serial Queue</span>
                        <span className="font-medium">{detailedMetrics.queue.serial.pending} pending</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full" 
                          style={{ width: `${Math.min(100, detailedMetrics.queue.serial.pending * 20)}%` }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Parallel Limited</span>
                        <span className="font-medium">{detailedMetrics.queue.limited.pending} pending</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-purple-500 h-2 rounded-full" 
                          style={{ width: `${Math.min(100, detailedMetrics.queue.limited.pending * 10)}%` }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Parallel Full</span>
                        <span className="font-medium">{detailedMetrics.queue.full.pending} pending</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${Math.min(100, detailedMetrics.queue.full.pending * 5)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Resource Utilization */}
        <TabsContent value="resource-utilization" className="space-y-2 sm:space-y-4 mt-3 sm:mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Resource Utilization Chart */}
            <Card className="bg-card border border-border/40 shadow-sm">
              <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <BarChart3 className="h-4 w-4 text-blue-500" />
                  Resource Utilization
                </CardTitle>
                <CardDescription className="text-xs">Percentage of resource usage</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6 py-2 sm:py-4">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={resourceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Bar dataKey="value" name="Utilization %">
                      {resourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Detailed Resource Metrics */}
            {detailedMetrics.memory && detailedMetrics.executor && (
              <Card className="bg-card border border-border/40 shadow-sm">
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Activity className="h-4 w-4 text-green-500" />
                    Detailed Resource Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Memory Usage:</span>
                      <span className="font-medium">{detailedMetrics.memory.stats.usagePercentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${detailedMetrics.memory.stats.usagePercentage}%` }}
                      ></div>
                    </div>
                    
                    <div className="flex justify-between text-sm mt-3">
                      <span className="text-muted-foreground">Execution Load:</span>
                      <span className="font-medium">
                        {detailedMetrics.executor.averageExecutionTime > 0 
                          ? Math.min(100, (detailedMetrics.executor.averageExecutionTime / 100)).toFixed(1) 
                          : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ 
                          width: `${Math.min(100, detailedMetrics.executor.averageExecutionTime > 0 ? detailedMetrics.executor.averageExecutionTime / 100 : 0)}%` 
                        }}
                      ></div>
                    </div>
                    
                    <div className="flex justify-between text-sm mt-3">
                      <span className="text-muted-foreground">Cache Efficiency:</span>
                      <span className="font-medium">
                        {detailedMetrics.executor.cacheHits + detailedMetrics.executor.cacheMisses > 0
                          ? ((detailedMetrics.executor.cacheHits / (detailedMetrics.executor.cacheHits + detailedMetrics.executor.cacheMisses)) * 100).toFixed(1)
                          : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full" 
                        style={{ 
                          width: `${
                            detailedMetrics.executor.cacheHits + detailedMetrics.executor.cacheMisses > 0
                              ? (detailedMetrics.executor.cacheHits / (detailedMetrics.executor.cacheHits + detailedMetrics.executor.cacheMisses)) * 100
                              : 0
                          }%` 
                        }}
                      ></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Model Loading Status */}
            {detailedMetrics.memory && detailedMetrics.memory.models.length > 0 && (
              <Card className="bg-card border border-border/40 shadow-sm md:col-span-2">
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Database className="h-4 w-4 text-orange-500" />
                    Loaded Models
                  </CardTitle>
                  <CardDescription className="text-xs">Currently loaded AI models and their VRAM usage</CardDescription>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {detailedMetrics.memory.models.map((model: any) => (
                      <div key={model.key} className="p-3 border rounded-lg bg-secondary/30">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium text-sm truncate">{model.key}</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {model.vram.toFixed(2)}GB VRAM
                            </p>
                          </div>
                          <Badge 
                            variant={model.pinned ? "default" : "secondary"} 
                            className="text-[8px]"
                          >
                            {model.pinned ? "Pinned" : "Loaded"}
                          </Badge>
                        </div>
                        <div className="mt-2 w-full bg-secondary rounded-full h-1.5">
                          <div 
                            className="bg-blue-500 h-1.5 rounded-full" 
                            style={{ width: `${Math.min(100, (model.vram / detailedMetrics.memory.stats.totalVRAM) * 100)}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                          <span>Utilization</span>
                          <span>{((model.vram / detailedMetrics.memory.stats.totalVRAM) * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Queue Details */}
      <Card className="bg-card border border-border/40 shadow-sm">
        <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Zap className="h-4 sm:h-5 w-4 sm:w-5" />
            Queue Details
          </CardTitle>
          <CardDescription className="text-xs">Individual queue status summary</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 py-3 sm:py-4">
          <div className="space-y-4">
            {queueStats.map((queue) => (
              <div key={queue.queueName} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-semibold">{queue.queueName}</h4>
                  <div className="text-sm text-muted-foreground mt-1">
                    <span className="inline-block mr-4">✓ {queue.completed} completed</span>
                    <span className="inline-block mr-4">▶ {queue.active} active</span>
                    <span className="inline-block mr-4">⏳ {queue.pending} pending</span>
                    <span className="inline-block text-red-600">✗ {queue.failed} failed</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {queue.completed + queue.failed > 0 
                      ? ((queue.completed / (queue.completed + queue.failed)) * 100).toFixed(0)
                      : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">success</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};