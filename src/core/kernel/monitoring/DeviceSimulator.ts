import { resourceManager, DeviceStatus } from '../ResourceManager';

export type DeviceProfile = 'LOW_END_MOBILE' | 'MID_RANGE_TABLET' | 'HIGH_END_DESKTOP';

const PROFILES: Record<DeviceProfile, Partial<DeviceStatus>> = {
  'LOW_END_MOBILE': {
    cpu: { hardwareConcurrency: 2 },
    memory: { jsHeapSizeLimit: 2 * 1024**3, usageRatio: 0.8 },
    network: { effectiveType: '3g' },
    battery: { level: 0.4, isCharging: false }
  },
  'MID_RANGE_TABLET': {
    cpu: { hardwareConcurrency: 4 },
    memory: { jsHeapSizeLimit: 4 * 1024**3, usageRatio: 0.6 },
    network: { effectiveType: '4g' },
    battery: { level: 0.7, isCharging: false }
  },
  'HIGH_END_DESKTOP': {
    cpu: { hardwareConcurrency: 16 },
    memory: { jsHeapSizeLimit: 16 * 1024**3, usageRatio: 0.3 },
    network: { effectiveType: '4g' },
    battery: { isCharging: true, level: 1 }
  }
};

export function simulateDevice(profile: DeviceProfile): void {
  const status = PROFILES[profile];
  // "Monkey-patch" la méthode getStatus pour qu'elle retourne notre profil simulé
  resourceManager.getStatus = async () => {
    return { ...resourceManager.getInitialStatus(), ...status } as DeviceStatus;
  };
  console.log(`\n[Benchmark] 📱 Simulation du device: ${profile}`);
}