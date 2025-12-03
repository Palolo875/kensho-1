import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Cpu, 
  Database, 
  Battery, 
  Wifi, 
  Zap, 
  BarChart3, 
  AlertTriangle,
  HardDrive,
  Thermometer
} from "lucide-react";
import { runtimeManager } from "@/core/kernel/RuntimeManager";
import { taskExecutor } from "@/core/kernel/TaskExecutor";
import { memoryManager } from "@/core/kernel/MemoryManager";
import { resourceManager } from "@/core/kernel/ResourceManager";
import { monitoringService } from "@/core/kernel/monitoring/MonitoringService";

interface SystemMetrics {
  runtime: any;
  executor: any;
  memory: any;
  resources: any;
  monitoring: any;
}

export const SystemDiagnosticsPanel = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const runtimeMetrics = runtimeManager.getPerformanceMetrics();
        const executorStats = taskExecutor.getStats();
        const memoryReport = memoryManager.getMemoryReport();
        const resourceStatus = await resourceManager.getStatus();
        const monitoringStats = monitoringService.getAggregatedStats();
        
        setMetrics({
          runtime: runtimeMetrics,
          executor: executorStats,
          memory: memoryReport,
          resources: resourceStatus,
          monitoring: monitoringStats
        });
      } catch (error) {
        console.error("Error fetching system metrics:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
    
    // Poll for updates every 2 seconds
    const interval = setInterval(fetchMetrics, 2000);
    
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Chargement des diagnostics...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto" />
          <p className="mt-2 text-sm text-muted-foreground">Impossible de charger les diagnostics</p>
        </div>
      </div>
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

  const getHealthBg = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Thermometer className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-bold">Diagnostics Système</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Vue d'ensemble en temps réel de la santé du système Kensho
        </p>
      </div>

      {/* Overall Health Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Santé Globale du Système</span>
            <Badge 
              className={`${getHealthBg(overallHealth)} text-white`}
            >
              {overallHealth}%
            </Badge>
          </CardTitle>
          <CardDescription>
            Note composite basée sur l'utilisation mémoire, la charge CPU, l'état réseau et la batterie
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Progress value={overallHealth} className="h-3" />
              </div>
              <span className={`text-lg font-bold ${getHealthColor(overallHealth)}`}>
                {overallHealth}%
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-card border">
                <Database className="h-5 w-5 text-blue-500 mx-auto mb-2" />
                <div className="text-2xl font-bold">
                  {metrics.memory.stats.usagePercentage.toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">Mémoire</div>
              </div>
              
              <div className="text-center p-3 rounded-lg bg-card border">
                <Cpu className="h-5 w-5 text-purple-500 mx-auto mb-2" />
                <div className="text-2xl font-bold">
                  {Math.round(metrics.executor.averageExecutionTime)}ms
                </div>
                <div className="text-xs text-muted-foreground">Charge CPU</div>
              </div>
              
              <div className="text-center p-3 rounded-lg bg-card border">
                <Wifi className={`h-5 w-5 mx-auto mb-2 ${
                  metrics.resources.network.isOnline ? 'text-green-500' : 'text-red-500'
                }`} />
                <div className="text-2xl font-bold">
                  {metrics.resources.network.isOnline ? 'ON' : 'OFF'}
                </div>
                <div className="text-xs text-muted-foreground">Réseau</div>
              </div>
              
              <div className="text-center p-3 rounded-lg bg-card border">
                <Battery className="h-5 w-5 text-yellow-500 mx-auto mb-2" />
                <div className="text-2xl font-bold">
                  {metrics.resources.battery ? Math.round(metrics.resources.battery.level * 100) : '100'}%
                </div>
                <div className="text-xs text-muted-foreground">Batterie</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Runtime Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              Performance du Runtime
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Inférences réussies</span>
              <span className="font-medium">{metrics.runtime.successfulInferences}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Taux d'erreur</span>
              <span className="font-medium">{(metrics.runtime.errorRate * 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Latence moyenne</span>
              <span className="font-medium">{metrics.runtime.averageLatencyMs.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Tokens par seconde</span>
              <span className="font-medium">{metrics.runtime.averageTokensPerSecond}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Retries</span>
              <span className="font-medium">{metrics.runtime.totalRetries}</span>
            </div>
          </CardContent>
        </Card>

        {/* Task Execution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-500" />
              Exécution des Tâches
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Exécutions réussies</span>
              <span className="font-medium">{metrics.executor.successfulExecutions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Exécutions échouées</span>
              <span className="font-medium">{metrics.executor.failedExecutions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Temps moyen</span>
              <span className="font-medium">{metrics.executor.averageExecutionTime.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Cache hits</span>
              <span className="font-medium">{metrics.executor.cacheHits}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Tentatives</span>
              <span className="font-medium">{metrics.executor.totalRetries}</span>
            </div>
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-green-500" />
              Utilisation Mémoire
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VRAM Utilisée</span>
                <span className="font-medium">
                  {metrics.memory.stats.usedVRAM.toFixed(2)}GB / {metrics.memory.stats.totalVRAM.toFixed(2)}GB
                </span>
              </div>
              <Progress 
                value={metrics.memory.stats.usagePercentage} 
                className="h-2"
              />
              <div className="text-xs text-muted-foreground">
                {metrics.memory.stats.usagePercentage.toFixed(1)}% utilisé
              </div>
            </div>
            
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Modèles chargés</span>
              <span className="font-medium">{metrics.memory.stats.loadedModelsCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Modèles épinglés</span>
              <span className="font-medium">{metrics.memory.stats.pinnedModelsCount}</span>
            </div>
            
            {metrics.memory.models.length > 0 && (
              <div className="pt-2 border-t border-border/30">
                <p className="text-xs text-muted-foreground mb-2">Modèles chargés:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {metrics.memory.models.map((model: any) => (
                    <div key={model.key} className="flex justify-between text-xs">
                      <span className="text-foreground truncate mr-2">{model.key}</span>
                      <span className="text-muted-foreground">{model.vram.toFixed(2)}GB</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Resources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Thermometer className="h-5 w-5 text-orange-500" />
              Ressources Système
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Mémoire JS Heap</span>
              <span className="font-medium">{metrics.resources.memory.jsHeapUsed.toFixed(2)}MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Tendance mémoire</span>
              <span className="font-medium capitalize">{metrics.resources.memory.trend || 'stable'}</span>
            </div>
            
            {metrics.resources.battery && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Niveau batterie</span>
                  <span className="font-medium">{(metrics.resources.battery.level * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">En charge</span>
                  <span className="font-medium">
                    {metrics.resources.battery.isCharging ? 'Oui' : 'Non'}
                  </span>
                </div>
              </>
            )}
            
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Connexion réseau</span>
              <span className={`font-medium ${
                metrics.resources.network.isOnline ? 'text-green-500' : 'text-red-500'
              }`}>
                {metrics.resources.network.isOnline ? 'En Ligne' : 'Hors Ligne'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Type de connexion</span>
              <span className="font-medium">{metrics.resources.network.effectiveType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Mode économie</span>
              <span className="font-medium">
                {metrics.resources.powerSaveMode ? 'Activé' : 'Désactivé'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Monitoring Stats */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-500" />
              Statistiques de Surveillance
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="text-2xl font-bold text-blue-500">
                {metrics.monitoring.totalExecutions}
              </div>
              <div className="text-xs text-muted-foreground">Exécutions totales</div>
            </div>
            
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="text-2xl font-bold text-green-500">
                {metrics.monitoring.avgTtft}ms
              </div>
              <div className="text-xs text-muted-foreground">TTFT moyen</div>
            </div>
            
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="text-2xl font-bold text-purple-500">
                {metrics.monitoring.avgTokensPerSecond}
              </div>
              <div className="text-xs text-muted-foreground">Tokens/sec</div>
            </div>
            
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-2xl font-bold text-red-500">
                {(metrics.monitoring.errorRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Taux d'erreur</div>
            </div>
            
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="text-2xl font-bold text-yellow-500">
                {(metrics.monitoring.timeoutRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Taux timeout</div>
            </div>
            
            <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <div className="text-2xl font-bold text-indigo-500">
                {(metrics.monitoring.cacheHitRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Cache hit</div>
            </div>
            
            <div className="p-3 rounded-lg bg-pink-500/10 border border-pink-500/20 md:col-span-2">
              <div className="text-sm text-muted-foreground mb-1">Experts utilisés</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(metrics.monitoring.expertUsage).length > 0 ? (
                  Object.entries(metrics.monitoring.expertUsage).map(([expert, count]) => (
                    <Badge key={expert} variant="secondary" className="text-xs">
                      {expert}: {count}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">Aucun expert utilisé</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};