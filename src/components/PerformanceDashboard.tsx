/**
 * PerformanceDashboard - Priority 5 Feature
 * Displays multi-agent performance metrics and execution statistics
 */

import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Activity, TrendingUp, Clock, Zap, BarChart3 } from 'lucide-react';

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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const PerformanceDashboard = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    responseTime: [],
    successRate: 0.95,
    averageQueueTime: 0,
    peakConcurrency: 0,
    totalRequests: 0
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

  const successCount = 105;
  const failureCount = 3;
  const successRateData = [
    { name: 'Success', value: successCount },
    { name: 'Failed', value: failureCount }
  ];

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
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
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
        <TabsList className="grid w-full grid-cols-3 bg-background border border-border/40 h-auto">
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
                  <Bar dataKey="completed" stackId="a" fill="#10b981" />
                  <Bar dataKey="active" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="pending" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="failed" stackId="a" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Success Rate */}
        <TabsContent value="success-rate" className="space-y-2 sm:space-y-4 mt-3 sm:mt-4">
          <Card className="bg-card border border-border/40 shadow-sm">
            <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
              <CardTitle className="text-sm sm:text-base">Success vs Failure</CardTitle>
              <CardDescription className="text-xs">{successCount + failureCount} total requests</CardDescription>
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
                    {((queue.completed / (queue.completed + queue.failed)) * 100).toFixed(0)}%
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
