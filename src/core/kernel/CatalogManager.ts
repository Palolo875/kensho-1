import { z } from 'zod';
import { eventBus } from '../eventbus/EventBus';
import { storageManager } from './StorageManager';

console.log("📚 CatalogManager (Production) initialisé.");

// Schéma de validation avec Zod
const FeatureFlagSchema = z.object({
  enabled: z.boolean().default(true),
  rollout: z.number().min(0).max(100).default(100),
  reason: z.string().optional(),
  userGroup: z.string().optional(),
  userSegment: z.string().optional(),
  overrides: z.record(z.string(), z.boolean()).optional()
});

const ModelSpecSchema = z.object({
  specialty: z.string().min(1),
  virtual_vram_gb: z.number().positive().max(32), // Max 32GB VRAM
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  deprecated: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  contextWindow: z.number().positive().default(2048),
  licenseType: z.string().optional(),
  downloadUrl: z.string().url().optional(),
  enabled: z.boolean().default(true),
  featureFlag: z.string().optional(),
  rollout: z.number().min(0).max(100).default(100).optional()
});

const CatalogSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/), // Semver
  updatedAt: z.string().datetime(),
  minClientVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  featureFlags: z.record(z.string(), FeatureFlagSchema).default({}),
  models: z.record(z.string(), ModelSpecSchema),
  signature: z.string().optional()
});

type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
type ModelSpec = z.infer<typeof ModelSpecSchema>;
type Catalog = z.infer<typeof CatalogSchema>;

class CatalogManager {
  private catalog: Record<string, ModelSpec> = {};
  private featureFlags: Record<string, FeatureFlag> = {};
  private version: string = "0.0.0";
  private updatedAt: Date = new Date();
  public isReady: Promise<void>;
  private resolveReady!: () => void;
  private cachedCatalog: Catalog | null = null;
  private cachedETag: string | null = null;
  private updateTimer: number | null = null;
  private updateCheckInterval: number = 5 * 60 * 1000; // 5 minutes
  private userId: string = "anonymous";

  constructor() {
    this.isReady = new Promise(resolve => {
      this.resolveReady = resolve;
    });
  }

  public async initialize(url: string = '/catalog.json'): Promise<void> {
    try {
      // Charge le catalogue depuis OPFS si disponible
      const cached = await storageManager.readFileAsText('catalog.json');
      if (cached) {
        const parsedCached = JSON.parse(cached);
        const validationResult = CatalogSchema.safeParse(parsedCached);
        
        if (validationResult.success) {
          this.cachedCatalog = validationResult.data;
          this.catalog = this.cachedCatalog.models;
          this.featureFlags = this.cachedCatalog.featureFlags;
          this.version = this.cachedCatalog.version;
          this.updatedAt = new Date(this.cachedCatalog.updatedAt);
          this.resolveReady(); // Prêt immédiatement
          console.log('[CatalogManager] Catalogue chargé depuis le cache');
        }
      }

      // Vérifie si une mise à jour est disponible (en arrière-plan)
      const headers: HeadersInit = {};
      if (this.cachedETag) {
        headers['If-None-Match'] = this.cachedETag;
      }

      const response = await fetch(url, { headers });

      if (response.status === 304) {
        // Pas de changement
        console.log('[CatalogManager] Catalogue à jour (304 Not Modified)');
        return;
      }

      if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);

      const rawData = await response.json();
      
      // ✅ Validation stricte
      const validationResult = CatalogSchema.safeParse(rawData);
      
      if (!validationResult.success) {
        console.error('[CatalogManager] Catalogue invalide:', validationResult.error);
        throw new Error(`Catalogue malformé: ${validationResult.error.issues[0].message}`);
      }
      
      const data: Catalog = validationResult.data;
      
      // ✅ Vérifie la signature
      if (data.signature && !await this.verifySignature(data, data.signature)) {
        throw new Error('⚠️ SIGNATURE INVALIDE - Catalogue potentiellement corrompu');
      }

      // Compare les versions
      if (this.cachedCatalog && this.isNewerVersion(data.version, this.cachedCatalog.version)) {
        console.log(`[CatalogManager] 🆕 Mise à jour : v${this.cachedCatalog.version} → v${data.version}`);
        eventBus.streamStatus(`Catalogue mis à jour : v${data.version}`);
      }

      // Sauvegarde dans OPFS
      this.cachedETag = response.headers.get('ETag') || null;
      await storageManager.writeFile('catalog.json', JSON.stringify(data));

      this.catalog = data.models;
      this.featureFlags = data.featureFlags;
      this.version = data.version;
      this.updatedAt = new Date(data.updatedAt);
      this.cachedCatalog = data;

      // Résout la promesse de readiness
      if (this.resolveReady) {
        this.resolveReady();
        // @ts-ignore
        this.resolveReady = null;
      }
      
      console.log(`[CatalogManager] ✅ Catalogue v${data.version} validé et chargé.`);
      eventBus.streamStatus("Catalogue de plugins chargé.");

      // ✅ Démarre le polling
      this.startUpdateCheck(url);
    } catch (error) {
      console.error("[CatalogManager] Échec du chargement du catalogue:", error);
      
      if (this.cachedCatalog) {
        // On a un cache, on continue avec
        console.warn('[CatalogManager] Utilisation du catalogue en cache');
        if (this.resolveReady) {
          this.resolveReady();
          // @ts-ignore
          this.resolveReady = null;
        }
      } else {
        // Aucun cache, on charge le fallback
        await this.loadFallbackCatalog();
      }
    }
  }

  private async loadFallbackCatalog(): Promise<void> {
    // Catalogue minimal hardcodé pour ne jamais être bloqué
    this.catalog = {
      'dialogue-gemma3-270m-mock': { 
        specialty: 'DIALOGUE_FAST', 
        virtual_vram_gb: 0.3,
        version: '1.0.0',
        deprecated: false,
        tags: ['fallback'],
        contextWindow: 2048,
        licenseType: 'mit',
        enabled: true
      }
    };
    this.version = "1.0.0-fallback";
    if (this.resolveReady) {
      this.resolveReady();
      // @ts-ignore
      this.resolveReady = null;
    }
    eventBus.streamStatus("⚠️ Mode dégradé : catalogue minimal chargé");
  }

  private isNewerVersion(v1: string, v2: string): boolean {
    const [major1, minor1, patch1] = v1.split('.').map(Number);
    const [major2, minor2, patch2] = v2.split('.').map(Number);
    
    if (major1 !== major2) return major1 > major2;
    if (minor1 !== minor2) return minor1 > minor2;
    return patch1 > patch2;
  }

  private startUpdateCheck(url: string): void {
    // Arrête le timer précédent s'il existe
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    this.updateTimer = window.setInterval(async () => {
      console.log('[CatalogManager] Vérification des mises à jour...');
      
      const oldCatalog = { ...this.catalog };
      const oldFlags = { ...this.featureFlags };
      await this.initialize(url);
      
      // Détecte les changements
      const changes = this.detectChanges(oldCatalog, this.catalog);
      const flagChanges = this.detectFlagChanges(oldFlags, this.featureFlags);
      
      if (changes.length > 0) {
        console.log('[CatalogManager] 🔄 Changements de modèles détectés:', changes);
        
        // Notifie l'utilisateur
        eventBus.streamStatus(
          `🆕 Nouvelles capacités disponibles : ${changes.join(', ')}`
        );
      }
      
      if (flagChanges.length > 0) {
        console.log('[CatalogManager] 🚩 Changements de flags détectés:', flagChanges);
        
        // Notifie l'utilisateur
        eventBus.streamStatus(
          `🚩 Changements de configuration : ${flagChanges.join(', ')}`
        );
        
        // Émet un événement pour les services intéressés
        this.emit('flags-changed', { changes: flagChanges });
      }
    }, this.updateCheckInterval);
  }

  private detectChanges(
    oldCatalog: Record<string, ModelSpec>,
    newCatalog: Record<string, ModelSpec>
  ): string[] {
    const changes: string[] = [];
    
    // Nouveaux modèles
    for (const key of Object.keys(newCatalog)) {
      if (!oldCatalog[key]) {
        changes.push(`+ ${key}`);
      }
    }
    
    // Modèles supprimés
    for (const key of Object.keys(oldCatalog)) {
      if (!newCatalog[key]) {
        changes.push(`- ${key}`);
      }
    }
    
    return changes;
  }

  private detectFlagChanges(
    oldFlags: Record<string, FeatureFlag>,
    newFlags: Record<string, FeatureFlag>
  ): string[] {
    const changes: string[] = [];
    
    // Flags modifiés
    for (const [key, newFlag] of Object.entries(newFlags)) {
      const oldFlag = oldFlags[key];
      if (!oldFlag || JSON.stringify(oldFlag) !== JSON.stringify(newFlag)) {
        changes.push(`🚩 ${key} ${newFlag.enabled ? 'activé' : 'désactivé'}`);
      }
    }
    
    // Flags supprimés
    for (const key of Object.keys(oldFlags)) {
      if (!newFlags[key]) {
        changes.push(`🚩 ${key} supprimé`);
      }
    }
    
    return changes;
  }

  public stopUpdateCheck(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  private async verifySignature(
    data: any,
    signature: string
  ): Promise<boolean> {
    try {
      // Clé publique pour la vérification (dans un vrai système, elle serait stockée de manière sécurisée)
      const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----`;

      // Import la clé publique
      const publicKey = await crypto.subtle.importKey(
        'spki',
        this.pemToArrayBuffer(PUBLIC_KEY),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );

      // Vérifie la signature
      const dataToVerify = JSON.stringify({ 
        version: data.version, 
        models: data.models,
        updatedAt: data.updatedAt,
        minClientVersion: data.minClientVersion,
        featureFlags: data.featureFlags
      });
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(dataToVerify);
      const signatureBuffer = this.base64ToArrayBuffer(signature);

      const isValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        signatureBuffer,
        dataBuffer
      );

      return isValid;
    } catch (error) {
      console.error('[CatalogManager] Échec de vérification:', error);
      return false;
    }
  }

  private pemToArrayBuffer(pem: string): ArrayBuffer {
    // Convertit PEM en ArrayBuffer
    const base64 = pem.replace(/-----BEGIN.*?-----/g, '')
                     .replace(/-----END.*?-----/g, '')
                     .replace(/\s/g, '');
    return this.base64ToArrayBuffer(base64);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  public getModelSpec(modelKey: string): ModelSpec | undefined {
    return this.catalog[modelKey];
  }

  public getCatalog(): Record<string, ModelSpec> {
    return this.catalog;
  }
  
  public getFeatureFlag(flagName: string): FeatureFlag | undefined {
    return this.featureFlags[flagName];
  }
  
  public getFeatureFlags(): Record<string, FeatureFlag> {
    return this.featureFlags;
  }
  
  public getVersion(): string {
    return this.version;
  }
  
  public getUpdatedAt(): Date {
    return this.updatedAt;
  }
  
  public setUserId(userId: string): void {
    this.userId = userId;
  }
  
  public getUserId(): string {
    return this.userId;
  }
  
  public isFeatureEnabled(flagName: string): boolean {
    const flag = this.featureFlags[flagName];
    if (!flag) return true; // Par défaut, activé si le flag n'existe pas
    
    // Vérifie si l'utilisateur est dans les overrides
    if (flag.overrides && flag.overrides[this.userId] !== undefined) {
      return flag.overrides[this.userId];
    }
    
    // Vérifie le segment utilisateur
    if (flag.userSegment) {
      // Logique de vérification du segment utilisateur
      // Dans un vrai système, cela dépendrait du contexte utilisateur
    }
    
    // Vérifie le rollout
    if (flag.rollout < 100) {
      const userHash = this.hashString(this.userId || 'anonymous');
      return (userHash % 100) < flag.rollout;
    }
    
    return flag.enabled;
  }
  
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertit en entier 32-bit
    }
    return Math.abs(hash);
  }
  
  private emit(event: string, data: any): void {
    // Méthode simplifiée pour émettre des événements
    // Dans un vrai système, cela utiliserait un EventTarget ou un système d'événements plus complet
    console.log(`[CatalogManager] Événement émis: ${event}`, data);
  }
}

export const catalogManager = new CatalogManager();