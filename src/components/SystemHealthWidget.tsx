import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Cpu, 
  Database, 
  Battery, 
  Wifi, 
  Thermometer,
  AlertTriangle
} from "lucide-react";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";

export const SystemHealthWidget = () => {
  const { metrics, loading, error } = useSystemMetrics(5000); // Update every 5 seconds

  if (loading) {
    return (
      <Card className="bg-card border border-border/40 shadow-sm">
        <CardHeader className="pb-2 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Thermometer className="h-4 w-4 text-primary" />
            Santé Système
          </CardTitle>
          <CardDescription className="text-xs">Chargement...</CardDescription>
        </CardHeader>
        <CardContent className="px-4 py-3">
          <div className="flex items-center justify-center h-16">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Card className="bg-card border border-border/40 shadow-sm">
        <CardHeader className="pb-2 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Santé Système
          </CardTitle>
          <CardDescription className="text-xs">Erreur de chargement</CardDescription>
        </CardHeader>
        <CardContent className="px-4 py-3">
          <div className="flex items-center justify-center h-16">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate health scores
  const memoryHealth = 100 - (metrics.memory.stats.usagePercentage || 0);
  const cpuHealth = Math.max(0, 100 - (metrics.executor.averageExecutionTime / 10 || 0));
  const networkHealth = metrics.resources.network.isOnline ? 100 : 0;
  const batteryHealth = metrics.resources.battery ? metrics.resources.battery.level * 100 : 100;
  
  const overallHealth = Math.round(
    (memoryHealth + cpuHealth + networkHealth + batteryHealth) / 4
  );

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <Card className="bg-card border border-border/40 shadow-sm">
      <CardHeader className="pb-2 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Thermometer className="h-4 w-4 text-primary" />
          Santé Système
        </CardTitle>
        <CardDescription className="text-xs">État en temps réel</CardDescription>
      </CardHeader>
      <CardContent className="px-4 py-3 space-y-3">
        {/* Overall Health */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Santé globale</span>
          <span className={`text-sm font-medium ${getHealthColor(overallHealth)}`}>
            {overallHealth}%
          </span>
        </div>
        <Progress value={overallHealth} className="h-1.5" />

        {/* Individual Metrics */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="flex items-center gap-1.5">
            <Database className="h-3 w-3 text-blue-500" />
            <div className="flex-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Mémoire</span>
                <span className="font-medium">{metrics.memory.stats.usagePercentage.toFixed(0)}%</span>
              </div>
              <Progress 
                value={metrics.memory.stats.usagePercentage} 
                className="h-1 mt-0.5" 
              />
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3 w-3 text-purple-500" />
            <div className="flex-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">CPU</span>
                <span className="font-medium">{Math.round(metrics.executor.averageExecutionTime)}ms</span>
              </div>
              <Progress 
                value={Math.min(100, metrics.executor.averageExecutionTime / 10)} 
                className="h-1 mt-0.5" 
              />
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <Wifi className={`h-3 w-3 ${
              metrics.resources.network.isOnline ? 'text-green-500' : 'text-red-500'
            }`} />
            <div className="flex-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Réseau</span>
                <span className="font-medium">
                  {metrics.resources.network.isOnline ? 'ON' : 'OFF'}
                </span>
              </div>
              <Progress 
                value={metrics.resources.network.isOnline ? 100 : 0} 
                className="h-1 mt-0.5" 
              />
            </div>
          </div>
          
          {metrics.resources.battery && (
            <div className="flex items-center gap-1.5">
              <Battery className="h-3 w-3 text-yellow-500" />
              <div className="flex-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Batterie</span>
                  <span className="font-medium">
                    {Math.round(metrics.resources.battery.level * 100)}%
                  </span>
                </div>
                <Progress 
                  value={metrics.resources.battery.level * 100} 
                  className="h-1 mt-0.5" 
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};