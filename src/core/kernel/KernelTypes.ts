export type ResourceConstraints = {
  maxMemoryMB: number;
  minBatteryLevel: number;
  minNetworkSpeed: 'slow-2g' | '2g' | '3g' | '4g';
};

export type ModelLoadDecision = {
  canLoad: boolean;
  reason?: string;
  constraints?: ResourceConstraints;
};

export type ResourceEvent = 'memory-critical' | 'battery-low' | 'network-offline' | 'cpu-throttle';

export type EventHandler = (status: DeviceStatus) => void;

export interface DeviceStatus {
  memory: {
    usageRatio: number;
    jsHeapUsed: number;
    trend?: 'stable' | 'rising' | 'falling';
  };
  battery: {
    level: number;
    isCharging: boolean;
    timeToEmpty?: number;
  } | null;
  network: {
    isOnline: boolean;
    effectiveType: 'slow-2g' | '2g' | '3g' | '4g' | 'offline';
    downlink: number;
    rtt?: number;
  };
  cpu: {
    hardwareConcurrency: number;
    isThrottling?: boolean;
  };
  powerSaveMode: boolean;
}
