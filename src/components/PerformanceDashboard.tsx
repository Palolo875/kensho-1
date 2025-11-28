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
    <div className="w-full space-y-6">
      {/* Header - MASTERPROMPT Style */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <h2 className="text-3xl font-semibold text-foreground">Performance Dashboard</h2>
        </div>
        <p className="text-sm text-muted-foreground">Real-time multi-agent execution metrics</p>
      </div>

      {/* Key Metrics - MASTERPROMPT Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border border-border/40 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="text-xs font-light text-muted-foreground uppercase tracking-wider">Total Requests</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-bold text-foreground">{successCount + failureCount}</div>
            <p className="text-xs text-muted-foreground mt-2">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="text-xs font-light text-muted-foreground uppercase tracking-wider">Success Rate</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-bold text-foreground">
              {((successCount / (successCount + failureCount)) * 100).toFixed(1)}%
            </div>
            <Badge variant="outline" className="mt-3 text-xs">✓ Excellent</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="text-xs font-light text-muted-foreground uppercase tracking-wider">Avg Response</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-bold text-foreground">
              {metrics.responseTime.length > 0
                ? Math.round(metrics.responseTime.reduce((sum, d) => sum + d.duration, 0) / metrics.responseTime.length)
                : 0
              }ms
            </div>
            <p className="text-xs text-muted-foreground mt-2">Last 12 requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="text-xs font-light text-muted-foreground uppercase tracking-wider">Active Tasks</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-bold text-foreground">
              {queueStats.reduce((sum, q) => sum + q.active, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Across all queues</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs - MASTERPROMPT Style */}
      <Tabs defaultValue="response-time" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-background border border-border/40">
          <TabsTrigger value="response-time" className="flex items-center gap-2 text-sm font-light">
            <Clock className="h-4 w-4" />
            Response Time
          </TabsTrigger>
          <TabsTrigger value="queue-stats" className="flex items-center gap-2 text-sm font-light">
            <BarChart3 className="h-4 w-4" />
            Queue Stats
          </TabsTrigger>
          <TabsTrigger value="success-rate" className="flex items-center gap-2 text-sm font-light">
            <TrendingUp className="h-4 w-4" />
            Success Rate
          </TabsTrigger>
        </TabsList>

        {/* Response Time Chart */}
        <TabsContent value="response-time" className="space-y-4 mt-4">
          <Card className="bg-card border border-border/40 shadow-sm">
            <CardHeader>
              <CardTitle>Response Time Trend</CardTitle>
              <CardDescription>Last 12 requests milliseconds</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
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
        <TabsContent value="queue-stats" className="space-y-4 mt-4">
          <Card className="bg-card border border-border/40 shadow-sm">
            <CardHeader>
              <CardTitle>Queue Performance</CardTitle>
              <CardDescription>Status by execution strategy</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
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
        <TabsContent value="success-rate" className="space-y-4 mt-4">
          <Card className="bg-card border border-border/40 shadow-sm">
            <CardHeader>
              <CardTitle>Success vs Failure</CardTitle>
              <CardDescription>{successCount + failureCount} total requests</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <ResponsiveContainer width="100%" height={300}>
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Queue Details
          </CardTitle>
          <CardDescription>Individual queue status summary</CardDescription>
        </CardHeader>
        <CardContent>
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
