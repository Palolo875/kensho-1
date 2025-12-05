// src/core/kernel/PerformanceTracker.ts

console.log("⚡ PerformanceTracker initialisé.");

export type PerformanceMode = 
  | 'ECO'           
  | 'BALANCED'      
  | 'PERFORMANCE'   
  | 'MAXIMUM';      

interface DeviceStatus {
  battery?: {
    level: number;
    isCharging: boolean;
  };
  memory?: {
    usageRatio: number;
  };
}

interface ExecutionRecord {
  prompt: string;
  complexity: string;
  mode: PerformanceMode;
  duration: number;
  tokensGenerated: number;
  batteryUsed: number;
  satisfactionScore?: number; // User feedback
  timestamp: number;
}

export interface PerformanceMetrics {
  // Mode courant
  currentMode: PerformanceMode;
  
  // Complexité
  complexity: {
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    score: number; // 0.0 - 1.0
    factors: Record<string, number>; // Détail des facteurs
  };
  
  // Performance
  tokensPerSecond: number;
  executionDurationMs: number;
  tokensGenerated: number;
  
  // Ressources
  batteryImpact: {
    percentagePerMinute: number;
    level: 'low' | 'medium' | 'high';
  };
  
  // Historique
  recentChanges: Array<{
    timestamp: number;
    fromMode: PerformanceMode;
    toMode: PerformanceMode;
    reason: string;
  }>;
  
  // Device status
  deviceStatus: {
    batteryLevel: number; // 0.0 - 1.0
    isCharging: boolean;
    memoryUsage: number; // 0.0 - 1.0
  };
}

class PerformanceTracker {
  private executions: ExecutionRecord[] = [];
  private modeChanges: Array<{
    timestamp: number;
    from: PerformanceMode;
    to: PerformanceMode;
    reason: string;
  }> = [];

  public trackExecution(
    prompt: string,
    complexity: string,
    mode: PerformanceMode,
    duration: number,
    tokensGenerated: number,
    batteryBefore: number,
    batteryAfter: number
  ): void {
    this.executions.push({
      prompt,
      complexity,
      mode,
      duration,
      tokensGenerated,
      batteryUsed: batteryBefore - batteryAfter,
      timestamp: Date.now()
    });
    
    console.log(`[PerformanceTracker] Execution tracked - Mode: ${mode}, Duration: ${duration}ms, Tokens: ${tokensGenerated}`);
  }

  public trackModeChange(from: PerformanceMode, to: PerformanceMode, reason: string): void {
    this.modeChanges.push({
      timestamp: Date.now(),
      from,
      to,
      reason
    });
    
    console.log(`[PerformanceTracker] Mode changed: ${from} → ${to} (${reason})`);
  }

  public getRecommendation(
    complexity: string,
    deviceStatus: DeviceStatus
  ): PerformanceMode {
    // Analyse historique : quel mode a donné les meilleurs résultats ?
    const similarTasks = this.executions.filter(e => 
      e.complexity === complexity
    );

    if (similarTasks.length < 5) {
      // Pas assez de données, utilise la logique par défaut
      return this.defaultLogic(complexity, deviceStatus);
    }

    // Calcule un score pour chaque mode basé sur l'historique
    const modeScores: Record<string, number> = {};

    for (const mode of ['ECO', 'BALANCED', 'PERFORMANCE', 'MAXIMUM'] as PerformanceMode[]) {
      const tasksWithMode = similarTasks.filter(t => t.mode === mode);
      
      if (tasksWithMode.length === 0) continue;

      const avgDuration = tasksWithMode.reduce((sum, t) => sum + t.duration, 0) / tasksWithMode.length;
      const avgBattery = tasksWithMode.reduce((sum, t) => sum + t.batteryUsed, 0) / tasksWithMode.length;
      const avgSatisfaction = tasksWithMode
        .filter(t => t.satisfactionScore !== undefined)
        .reduce((sum, t) => sum + (t.satisfactionScore || 0), 0) / tasksWithMode.length || 0.5;

      // Score = satisfaction - pénalité(duration) - pénalité(battery)
      modeScores[mode] = 
        avgSatisfaction * 10 - 
        (avgDuration / 1000) * 0.1 - 
        avgBattery * 5;
    }

    // Retourne le mode avec le meilleur score
    const bestMode = Object.entries(modeScores)
      .sort((a, b) => b[1] - a[1])[0][0] as PerformanceMode;

    console.log(`[PerformanceTracker] Mode recommandé basé sur l'historique: ${bestMode}`);
    return bestMode;
  }

  private defaultLogic(
    complexity: string,
    deviceStatus: DeviceStatus
  ): PerformanceMode {
    // Logique par défaut si pas assez de données
    const isBatteryLow = deviceStatus.battery?.level !== undefined && deviceStatus.battery?.level < 0.2;
    const isCharging = deviceStatus.battery?.isCharging === true;
    const hasHighMemory = deviceStatus.memory?.usageRatio !== undefined && deviceStatus.memory?.usageRatio < 0.5;

    if (complexity === 'LOW') {
      if (isBatteryLow && !isCharging) return 'ECO';
      return 'BALANCED';
    }

    if (complexity === 'MEDIUM') {
      if (isBatteryLow) return 'BALANCED';
      if (isCharging && hasHighMemory) return 'PERFORMANCE';
      return 'BALANCED';
    }

    // HIGH complexity
    if (isBatteryLow && !isCharging) {
      console.warn('PerformanceTracker', 'Tâche complexe avec batterie faible, mode BALANCED forcé');
      return 'BALANCED';
    }

    if (isCharging && hasHighMemory) return 'MAXIMUM';
    return 'PERFORMANCE';
  }

  public getStats(): { totalExecutions: number, averageDuration: number } {
    if (this.executions.length === 0) {
      return { totalExecutions: 0, averageDuration: 0 };
    }
    
    const totalDuration = this.executions.reduce((sum, e) => sum + e.duration, 0);
    return {
      totalExecutions: this.executions.length,
      averageDuration: totalDuration / this.executions.length
    };
  }

  public getRecentMetrics(): PerformanceMetrics {
    // Retourne les métriques formatées pour l'UI
    const latestExecution = this.executions.length > 0 
      ? this.executions[this.executions.length - 1]
      : null;
      
    const recentChanges = this.modeChanges.slice(-10).map(change => ({
      timestamp: change.timestamp,
      fromMode: change.from,
      toMode: change.to,
      reason: change.reason
    }));
    
    return {
      currentMode: latestExecution?.mode || 'BALANCED',
      complexity: {
        level: (latestExecution?.complexity as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM',
        score: 0.5, // Would come from Router assessment
        factors: {}
      },
      tokensPerSecond: latestExecution 
        ? latestExecution.tokensGenerated / (latestExecution.duration / 1000)
        : 0,
      executionDurationMs: latestExecution?.duration || 0,
      tokensGenerated: latestExecution?.tokensGenerated || 0,
      batteryImpact: {
        percentagePerMinute: 0, // Would be calculated from device API
        level: 'medium'
      },
      recentChanges,
      deviceStatus: {
        batteryLevel: 0.8, // Would come from device API
        isCharging: true,
        memoryUsage: 0.3 // Would come from memory manager
      }
    };
  }

  public getModeChangeHistory(limit: number = 10): Array<{
    timestamp: number;
    from: PerformanceMode;
    to: PerformanceMode;
    reason: string;
  }> {
    return this.modeChanges.slice(-limit);
  }
}

export const performanceTracker = new PerformanceTracker();