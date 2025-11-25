import { DeviceStatus, ResourceEvent, EventHandler } from "./KernelTypes";

console.log("📡 Initialisation du ResourceManager v1.0...");

class ResourceManager {
  private currentStatus: DeviceStatus;
  private lastStatusUpdate = 0;
  private statusCacheDuration = 500;
  private memoryHistory: number[] = [];
  
  private hasBatteryAPI = 'getBattery' in navigator;
  private hasMemoryAPI = 'memory' in performance && typeof (performance as any).memory !== 'undefined';
  private hasNetworkAPI = 'connection' in navigator;
  
  private eventHandlers = new Map<ResourceEvent, Set<EventHandler>>();
  private listeners: Array<{ target: any; event: string; handler: any }> = [];

  constructor() {
    this.currentStatus = {
      memory: { usageRatio: 0, jsHeapUsed: 0 },
      battery: null,
      network: { isOnline: navigator.onLine, effectiveType: '4g', downlink: 10 },
      cpu: { hardwareConcurrency: navigator.hardwareConcurrency || 2 },
      powerSaveMode: false
    };

    this.startMonitoring();
    console.log("✅ [ResourceManager] Surveillance système active");
  }

  private addEventListener(target: any, event: string, handler: any) {
    target.addEventListener(event, handler);
    this.listeners.push({ target, event, handler });
  }

  private startMonitoring() {
    if (this.hasNetworkAPI) {
      const connection = (navigator as any).connection;
      const updateNetwork = () => {
        const wasOnline = this.currentStatus.network.isOnline;
        this.currentStatus.network = {
          isOnline: navigator.onLine,
          effectiveType: (connection.effectiveType || '4g'),
          downlink: connection.downlink || 10,
          rtt: connection.rtt
        };
        
        if (wasOnline && !navigator.onLine) {
          this.emit('network-offline');
        }
      };
      updateNetwork();
      this.addEventListener(connection, 'change', updateNetwork);
    }

    if (this.hasBatteryAPI) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBattery = () => {
          const level = battery.level;
          this.currentStatus.battery = {
            level,
            isCharging: battery.charging,
            timeToEmpty: battery.dischargingTime
          };
          
          if (level < 0.15 && !battery.charging) {
            this.emit('battery-low');
          }
        };
        updateBattery();
        this.addEventListener(battery, 'levelchange', updateBattery);
        this.addEventListener(battery, 'chargingchange', updateBattery);
      });
    }

    window.addEventListener('online', () => {
      this.currentStatus.network.isOnline = true;
    });
    window.addEventListener('offline', () => {
      this.currentStatus.network.isOnline = false;
      this.emit('network-offline');
    });
  }

  private updateMemoryTrend(current: number): 'stable' | 'rising' | 'falling' {
    this.memoryHistory.push(current);
    if (this.memoryHistory.length > 10) this.memoryHistory.shift();
    
    if (this.memoryHistory.length < 3) return 'stable';
    
    const recent = this.memoryHistory.slice(-3);
    const avg = recent.reduce((a, b) => a + b) / recent.length;
    
    if (current > avg * 1.1) return 'rising';
    if (current < avg * 0.9) return 'falling';
    return 'stable';
  }

  private checkThresholds() {
    if (this.currentStatus.memory.usageRatio > 0.85) {
      this.emit('memory-critical');
    }

    if (this.currentStatus.battery && 
        this.currentStatus.battery.level < 0.15 && 
        !this.currentStatus.battery.isCharging) {
      this.emit('battery-low');
    }
  }

  public async getStatus(forceRefresh = false): Promise<DeviceStatus> {
    const now = Date.now();
    
    if (!forceRefresh && (now - this.lastStatusUpdate) < this.statusCacheDuration) {
      return this.currentStatus;
    }

    if (this.hasMemoryAPI && 'memory' in performance) {
      const mem = (performance as any).memory;
      const usageRatio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
      const jsHeapUsed = mem.usedJSHeapSize / (1024 * 1024);
      
      this.currentStatus.memory = {
        usageRatio,
        jsHeapUsed,
        trend: this.updateMemoryTrend(usageRatio)
      };
    }

    this.currentStatus.powerSaveMode = this.detectPowerSaveMode();
    this.currentStatus.network.isOnline = navigator.onLine;
    this.lastStatusUpdate = now;

    this.checkThresholds();

    return this.currentStatus;
  }

  private detectPowerSaveMode(): boolean {
    if (!this.currentStatus.battery) return false;
    return this.currentStatus.battery.level < 0.2 && 
           !this.currentStatus.battery.isCharging;
  }

  public on(event: ResourceEvent, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  public off(event: ResourceEvent, handler: EventHandler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(event: ResourceEvent) {
    this.eventHandlers.get(event)?.forEach(h => h(this.currentStatus));
  }

  public destroy() {
    this.listeners.forEach(({ target, event, handler }) => {
      target.removeEventListener(event, handler);
    });
    this.listeners = [];
    this.eventHandlers.clear();
  }
}

export const resourceManager = new ResourceManager();
