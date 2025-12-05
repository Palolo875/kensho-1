# 🔧 Spécifications Techniques - Ensemble 5

## 🎯 Tâche #23 : Plugin Discovery & Dynamic Loading

### Objectif
Transformer notre ModelCatalog statique en un système de découverte de plugins dynamique. Le Kernel doit maintenant télécharger un catalog.json depuis une source externe au démarrage, et le Router doit utiliser ce catalogue dynamique pour planifier ses exécutions.

### Philosophie "Usine Vide"
Nous allons créer un vrai fichier catalog.json dans notre dossier public, simulant un CDN externe. Notre Kernel va réellement le fetch. Nous allons modifier le Router pour qu'il ne dépende plus d'une importation statique, mais d'un catalogue qui lui est fourni, le rendant beaucoup plus flexible.

### Spécifications Techniques Détaillées

#### 1. Structure du catalog.json externe avec feature flags
Ce fichier contient la liste de nos "plugins" disponibles avec des feature flags pour le déploiement progressif. Il peut être mis à jour à tout moment sur le serveur.

```json
// public/catalog.json (Nouveau fichier)
{
  "version": "1.0.0",
  "updatedAt": "2025-12-04T10:00:00Z",
  "minClientVersion": "5.0.0",
  "featureFlags": {
    "enableCodeExpert": { 
      "enabled": true, 
      "rollout": 100 
    },
    "enableNewPhi3": { 
      "enabled": false, 
      "rollout": 0, 
      "reason": "buggy" 
    },
    "enableExperimentalMath": { 
      "enabled": true, 
      "rollout": 10, 
      "userGroup": "beta" 
    },
    "premiumFeatures": {
      "enabled": true,
      "userSegment": "premium",
      "overrides": {
        "user-abc123": false
      }
    }
  },
  "models": {
    "dialogue-gemma3-270m-mock": { 
      "specialty": "DIALOGUE_FAST", 
      "virtual_vram_gb": 0.3,
      "version": "1.2.0",
      "deprecated": false,
      "tags": ["lightweight", "multilingual"],
      "contextWindow": 2048,
      "licenseType": "apache-2.0",
      "downloadUrl": "https://cdn.kensho.ai/models/gemma3-270m.bin"
    },
    "dialogue-danube2-1.8b-mock": { 
      "specialty": "DIALOGUE_DEEP", 
      "virtual_vram_gb": 1.4,
      "version": "1.0.0",
      "deprecated": false,
      "tags": ["deep", "reasoning"],
      "contextWindow": 4096,
      "licenseType": "mit",
      "downloadUrl": "https://cdn.kensho.ai/models/danube2-1.8b.bin"
    },
    "code-qwen2.5-coder-1.5b-mock": { 
      "specialty": "CODE_EXPERT", 
      "virtual_vram_gb": 1.0,
      "version": "1.1.0",
      "deprecated": false,
      "tags": ["coding", "python", "javascript"],
      "contextWindow": 8192,
      "licenseType": "apache-2.0",
      "downloadUrl": "https://cdn.kensho.ai/models/qwen2.5-coder-1.5b.bin",
      "enabled": true,
      "featureFlag": "enableCodeExpert"
    },
    "math-bitnet-1.58b-mock": { 
      "specialty": "MATH_CALCULATION", 
      "virtual_vram_gb": 0.4,
      "version": "1.0.0",
      "deprecated": false,
      "tags": ["math", "calculation"],
      "contextWindow": 1024,
      "licenseType": "bsd-3-clause",
      "downloadUrl": "https://cdn.kensho.ai/models/bitnet-1.58b.bin",
      "enabled": true,
      "featureFlag": "enableExperimentalMath"
    },
    "buggy-expert-v2": {
      "specialty": "CODE_EXPERT",
      "enabled": false,
      "featureFlag": "code-v2-experimental",
      "rollout": 0.1
    }
  },
  "signature": "base64-encoded-signature"
}
```

#### 2. CatalogManager avec validation, cache et feature flags
Ce service amélioré sera responsable du chargement, de la validation, du cache et de la gestion des feature flags du catalogue.

```typescript
// src/core/kernel/CatalogManager.ts (Nouveau fichier)

import { z } from 'zod';
import { sseStreamer } from './streaming/SSEStreamer';
import { storageManager } from './storage/StorageManager';

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
      const cached = await storageManager.getFile('catalog.json');
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
        sseStreamer.streamStatus(`Catalogue mis à jour : v${data.version}`);
      }

      // Sauvegarde dans OPFS
      this.cachedETag = response.headers.get('ETag') || null;
      await storageManager.saveFile('catalog.json', JSON.stringify(data));

      this.catalog = data.models;
      this.featureFlags = data.featureFlags;
      this.version = data.version;
      this.updatedAt = new Date(data.updatedAt);
      this.cachedCatalog = data;

      if (!this.resolveReady) return; // Déjà résolu avec le cache
      this.resolveReady();
      
      console.log(`[CatalogManager] ✅ Catalogue v${data.version} validé et chargé.`);
      sseStreamer.streamStatus("Catalogue de plugins chargé.");

      // ✅ Démarre le polling
      this.startUpdateCheck(url);
    } catch (error) {
      console.error("[CatalogManager] Échec du chargement du catalogue:", error);
      
      if (this.cachedCatalog) {
        // On a un cache, on continue avec
        console.warn('[CatalogManager] Utilisation du catalogue en cache');
        this.resolveReady();
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
        licenseType: 'mit'
      }
    };
    this.version = "1.0.0-fallback";
    this.resolveReady();
    sseStreamer.streamStatus("⚠️ Mode dégradé : catalogue minimal chargé");
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
        sseStreamer.streamStatus(
          `🆕 Nouvelles capacités disponibles : ${changes.join(', ')}`
        );
      }
      
      if (flagChanges.length > 0) {
        console.log('[CatalogManager] 🚩 Changements de flags détectés:', flagChanges);
        
        // Notifie l'utilisateur
        sseStreamer.streamStatus(
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
```

#### 3. Mise à jour du Kernel et du Router
Le Kernel doit initialiser le CatalogManager. Le Router doit l'utiliser avec des fallbacks gracieux et la prise en compte des feature flags.

```typescript
// src/core/kernel.ts (Mise à jour)
import { catalogManager } from './kernel/CatalogManager';
import { updateService } from './kernel/UpdateService';
// ...

export async function initializeKernel(port: MessagePort) {
  // ...
  try {
    await storageManager.initializeAndVerify();
    // NOUVEAU : Initialise le catalogue dynamique
    await catalogManager.initialize();
    
    // NOUVEAU : Démarre le service de mise à jour en arrière-plan
    updateService.start();
  } catch (error) {
    // ...
  }
  // ...
}
```

```typescript
// src/core/kernel/Router.ts (Mise à jour)
import { catalogManager, ModelSpec } from './CatalogManager'; // Nouvel import
import { logger } from './monitoring/LoggerService';
import { v4 as uuidv4 } from 'uuid';
// Supprimer l'import statique de MOCK_MODEL_CATALOG

class Router {
  public async createPlan(prompt: string): Promise<ExecutionPlan> {
    await catalogManager.isReady; // S'assure que le catalogue est chargé
    const catalog = catalogManager.getCatalog();
    
    // Détecte l'intent
    const intent = this.detectIntent(prompt);
    
    // Trouve le plugin approprié avec fallback
    const expertKey = this.selectExpert(catalog, intent);
    
    if (!expertKey) {
      logger.warn('Router', `Aucun plugin pour l'intent ${intent}, utilisation du dialogue générique`);
      // Fallback vers un dialogue générique
      return this.createFallbackPlan(prompt);
    }
    
    // ... (continue normalement)
  }

  private selectExpert(
    catalog: Record<string, ModelSpec>,
    intent: string
  ): string | null {
    // Mapping intent → specialty avec fallbacks
    const specialtyMap: Record<string, string[]> = {
      'CODE': ['CODE_EXPERT', 'DIALOGUE_DEEP', 'DIALOGUE_FAST'],
      'MATH': ['MATH_CALCULATION', 'CODE_EXPERT', 'DIALOGUE_DEEP'],
      'DIALOGUE': ['DIALOGUE_FAST', 'DIALOGUE_DEEP']
    };

    const preferredSpecialties = specialtyMap[intent] || ['DIALOGUE_FAST'];

    // Essaie chaque specialty dans l'ordre de préférence
    for (const specialty of preferredSpecialties) {
      // Filtrer les experts disponibles selon les feature flags
      const availableExperts = Object.entries(catalog)
        .filter(([key, spec]) => spec.specialty === specialty && !spec.deprecated)
        .filter(([key, spec]) => {
          // Vérifie si le modèle est activé
          if (spec.enabled === false) return false;
          
          // Vérifie le feature flag spécifique au modèle
          if (spec.featureFlag) {
            return catalogManager.isFeatureEnabled(spec.featureFlag);
          }
          
          return true;
        });
      
      // Retourne le premier expert disponible
      if (availableExperts.length > 0) {
        return availableExperts[0][0];
      }
    }

    return null; // Aucun plugin disponible
  }

  private createFallbackPlan(prompt: string): ExecutionPlan {
    return {
      id: uuidv4(),
      tasks: [{
        expert: 'fallback',
        prompt: `Mode dégradé : ${prompt}`,
        priority: 'NORMAL'
      }],
      strategy: 'SERIAL',
      estimatedTokens: 100
    };
  }
  
  private detectIntent(prompt: string): string {
    // Logique de détection d'intent simplifiée
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('code') || lowerPrompt.includes('function') || lowerPrompt.includes('program')) {
      return 'CODE';
    }
    
    if (lowerPrompt.includes('calculate') || lowerPrompt.includes('math') || lowerPrompt.includes('equation')) {
      return 'MATH';
    }
    
    return 'DIALOGUE';
  }
}

export const router = new Router();
```

### Résultats Attendus
1. Création du fichier catalog.json dans le dossier public avec métadonnées riches et feature flags
2. Implémentation du CatalogManager avec validation Zod, cache OPFS, ETag, signature cryptographique et gestion des feature flags
3. Mise à jour du Kernel pour initialiser le CatalogManager et le UpdateService
4. Mise à jour du Router pour utiliser le catalogue dynamique avec fallbacks gracieux et prise en compte des feature flags
5. Découplage complet de la logique d'application et de la liste des modèles
6. Extensibilité facilitée pour ajouter de nouveaux plugins
7. Hot-reload du catalogue avec détection automatique des mises à jour
8. Validation stricte du format du catalogue pour prévenir les erreurs
9. Sécurité renforcée avec vérification de signature
10. Gestion des déploiements progressifs avec feature flags

## 🎯 Tâche #24 : Background Sync & Update

### Objectif
Créer un UpdateService qui, périodiquement et en arrière-plan, vérifie si une nouvelle version du catalog.json ou des fichiers de modèles est disponible. S'il détecte une mise à jour, il la télécharge silencieusement dans l'OPFS et notifie l'utilisateur qu'une nouvelle version est prête à être activée.

### Philosophie "Usine Vide"
Nous implémentons le vrai service de mise à jour. Il va réellement fetch le catalogue à intervalles réguliers, réellement comparer les versions, et réellement simuler le téléchargement de nouveaux fichiers en arrière-plan.

### Spécifications Techniques Détaillées

#### 1. Création de l'UpdateService
Ce service vivra dans notre SharedWorker et tournera en continu.

```typescript
// src/core/kernel/UpdateService.ts (Nouveau fichier)

import { catalogManager } from './CatalogManager';
import { storageManager } from './storage/StorageManager';
import { sseStreamer } from './streaming/SSEStreamer';

console.log("🔄 UpdateService (Production) initialisé.");

const CHECK_INTERVAL = 15 * 60 * 1000; // Toutes les 15 minutes

class UpdateService {
  private currentVersion: string = "0.0.0";
  private timer: any = null;

  /**
   * Démarre le service de vérification des mises à jour.
   */
  public start(): void {
    if (this.timer) {
      console.log("[UpdateService] Le service est déjà en cours.");
      return;
    }
    
    console.log(`[UpdateService] Démarrage du service. Vérification toutes les ${CHECK_INTERVAL / 60000} minutes.`);
    
    // Fait une première vérification au démarrage
    this.checkForUpdates(); 
    
    // Puis lance le minuteur pour les vérifications périodiques
    this.timer = setInterval(() => this.checkForUpdates(), CHECK_INTERVAL);
  }

  /**
   * Arrête le service.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[UpdateService] Service arrêté.");
    }
  }

  /**
   * Vérifie la disponibilité de mises à jour.
   */
  private async checkForUpdates(): Promise<void> {
    console.log("[UpdateService] Recherche de mises à jour...");
    
    try {
      const response = await fetch('/catalog.json');
      const remoteCatalog = await response.json();

      if (this.currentVersion === "0.0.0") {
        // Première initialisation
        this.currentVersion = remoteCatalog.version;
        return;
      }

      if (remoteCatalog.version !== this.currentVersion) {
        console.log(`[UpdateService] 🚀 Nouvelle version détectée ! Local: ${this.currentVersion}, Distant: ${remoteCatalog.version}`);
        sseStreamer.streamStatus(`Nouvelle version ${remoteCatalog.version} disponible. Téléchargement en arrière-plan...`);
        
        // Simule le téléchargement des nouveaux fichiers/modèles
        await this.downloadNewFiles(remoteCatalog);

        this.currentVersion = remoteCatalog.version;
        
        // Notifie l'UI qu'une mise à jour est prête
        sseStreamer.streamEvent('UPDATE_READY', {
          version: remoteCatalog.version,
          message: "Une mise à jour est prête. Redémarrez pour l'appliquer."
        });
      } else {
        console.log("[UpdateService] Aucune nouvelle mise à jour.");
      }
    } catch (error) {
      console.error("[UpdateService] Erreur lors de la vérification des mises à jour:", error);
    }
  }

  /**
   * Simule le téléchargement en arrière-plan des nouveaux fichiers.
   */
  private async downloadNewFiles(remoteCatalog: any): Promise<void> {
    // En réalité, on comparerait les manifestes pour ne télécharger que les deltas.
    // Ici, on simule juste le téléchargement d'un nouveau fichier.
    const newFile = {
      path: `models/new-plugin-v${remoteCatalog.version}-mock.bin`,
      size: 100_000_000, // 100MB
      hash: `sha256-simule-new-${remoteCatalog.version}`
    };
    
    // Utilise la méthode de téléchargement de notre StorageManager
    // @ts-ignore - Accès à une méthode privée pour la démo
    await storageManager.downloadFile(newFile);
    
    console.log(`[UpdateService] Téléchargement en arrière-plan terminé.`);
  }
}

export const updateService = new UpdateService();
```

#### 2. Mise à jour du Kernel pour démarrer le service

```typescript
// src/core/kernel.ts (Mise à jour)
import { catalogManager } from './kernel/CatalogManager';
import { updateService } from './kernel/UpdateService';
// ...

export async function initializeKernel(port: MessagePort) {
  // ...
  try {
    await storageManager.initializeAndVerify();
    await catalogManager.initialize();
    
    // NOUVEAU : Démarre le service de mise à jour en arrière-plan
    updateService.start();

  } catch (error) {
    // ...
  }
  // ...
}
```

### Résultats Attendus
1. Création de l'UpdateService pour la vérification périodique des mises à jour
2. Intégration du service dans le Kernel pour le démarrage automatique
3. Téléchargement silencieux des mises à jour dans l'OPFS
4. Notification de l'utilisateur via SSE quand une mise à jour est prête
5. Système proactif qui recherche les mises à jour sans intervention utilisateur
6. Processus transparent qui ne perturbe pas l'expérience utilisateur