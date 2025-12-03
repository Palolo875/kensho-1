import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";

interface ResourceDataPoint {
  timestamp: number;
  memory: number;
  cpu: number;
  network: number;
}

export const ResourceUtilizationChart = () => {
  const { metrics } = useSystemMetrics(3000); // Update every 3 seconds
  const [data, setData] = useState<ResourceDataPoint[]>([]);
  
  // Update chart data when metrics change
  useEffect(() => {
    if (metrics) {
      const newDataPoint: ResourceDataPoint = {
        timestamp: Date.now(),
        memory: metrics.memory.stats.usagePercentage,
        cpu: Math.min(100, metrics.executor.averageExecutionTime / 10),
        network: metrics.resources.network.isOnline ? 100 : 0
      };
      
      setData(prev => {
        const updated = [...prev, newDataPoint];
        // Keep only last 20 data points
        return updated.length > 20 ? updated.slice(-20) : updated;
      });
    }
  }, [metrics]);
  
  // Format time for x-axis
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className="bg-card border border-border/40 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm">Utilisation des Ressources en Temps Réel</CardTitle>
        <CardDescription className="text-xs">Mémoire, CPU et réseau</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatTime}
              tick={{ fontSize: 10 }}
            />
            <YAxis 
              domain={[0, 100]} 
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              formatter={(value) => [`${Number(value).toFixed(1)}%`, '']}
              labelFormatter={(timestamp) => formatTime(timestamp)}
              contentStyle={{ 
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)',
                fontSize: '12px'
              }}
            />
            <Area 
              type="monotone" 
              dataKey="memory" 
              name="Mémoire" 
              stroke="#3b82f6" 
              fill="#3b82f6" 
              fillOpacity={0.2} 
              strokeWidth={2}
            />
            <Area 
              type="monotone" 
              dataKey="cpu" 
              name="CPU" 
              stroke="#8b5cf6" 
              fill="#8b5cf6" 
              fillOpacity={0.2} 
              strokeWidth={2}
            />
            <Area 
              type="monotone" 
              dataKey="network" 
              name="Réseau" 
              stroke="#10b981" 
              fill="#10b981" 
              fillOpacity={0.2} 
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};