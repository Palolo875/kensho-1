import { resourceManager } from '../kernel/ResourceManager';
import { CapacityMetrics, ExecutionStrategy } from './RouterTypes';

export class CapacityEvaluator {
  
  public async evaluate(): Promise<CapacityMetrics> {
    const status = await resourceManager.getStatus();
    
    if (!status.cpu) {
      console.warn('[CapacityEvaluator] Télémétrie CPU manquante, utilisation de 4 cores par défaut');
    }
    const cpuScore = this.evaluateCPU(status.cpu?.hardwareConcurrency ?? 4);
    
    const usageRatio = status.memory?.usageRatio ?? 0.5;
    if (status.memory?.usageRatio === undefined) {
      console.warn('[CapacityEvaluator] Télémétrie mémoire manquante, utilisation de 0.5 par défaut');
    }
    const memoryScore = this.evaluateMemory(usageRatio);
    
    const batteryScore = this.evaluateBattery(
      status.battery?.level ?? 1.0,
      status.battery?.isCharging ?? false,
      status.powerSaveMode ?? false
    );
    
    const effectiveType = status.network?.effectiveType ?? '4g';
    if (status.network?.effectiveType === undefined) {
      console.warn('[CapacityEvaluator] Télémétrie réseau manquante, utilisation de 4g par défaut');
    }
    const networkScore = this.evaluateNetwork(
      status.network?.isOnline ?? true,
      effectiveType
    );
    
    const overallScore = (cpuScore + memoryScore + batteryScore + networkScore) / 4;
    
    return {
      cpuScore,
      memoryScore,
      batteryScore,
      networkScore,
      overallScore: Math.round(overallScore * 10) / 10
    };
  }
  
  private evaluateCPU(cores: number): number {
    if (cores >= 8) return 10;
    if (cores >= 4) return 7;
    if (cores >= 2) return 5;
    return 3;
  }
  
  private evaluateMemory(usageRatio: number): number {
    if (usageRatio < 0.3) return 10;
    if (usageRatio < 0.5) return 8;
    if (usageRatio < 0.7) return 6;
    if (usageRatio < 0.85) return 4;
    return 2;
  }
  
  private evaluateBattery(level: number, isCharging: boolean, powerSaveMode: boolean): number {
    if (isCharging) return 10;
    
    if (powerSaveMode) return 3;
    
    if (level > 0.5) return 10;
    if (level > 0.3) return 7;
    if (level > 0.15) return 4;
    return 2;
  }
  
  private evaluateNetwork(isOnline: boolean, effectiveType: string): number {
    if (!isOnline) return 5;
    
    if (effectiveType === '4g' || effectiveType === '5g') return 10;
    if (effectiveType === '3g') return 7;
    if (effectiveType === '2g') return 4;
    if (effectiveType === 'slow-2g') return 2;
    
    return 8;
  }
  
  public determineStrategy(capacityScore: number, priority: 'HIGH' | 'MEDIUM' | 'LOW'): ExecutionStrategy {
    // Priorité HIGH: parallélisation maximale si possible
    if (priority === 'HIGH') {
      if (capacityScore >= 8) return 'PARALLEL_FULL';
      if (capacityScore >= 6) return 'PARALLEL_LIMITED';
      return 'SERIAL';
    }
    
    // Priorité MEDIUM: parallélisation limitée
    if (priority === 'MEDIUM') {
      if (capacityScore >= 7) return 'PARALLEL_LIMITED';
      return 'SERIAL';
    }
    
    // Priorité LOW: seulement si ressources excellentes
    if (capacityScore >= 9) return 'PARALLEL_LIMITED';
    return 'SERIAL';
  }
}
