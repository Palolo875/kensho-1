import { catalogManager } from './CatalogManager';
import { storageManager } from './StorageManager';
import { eventBus } from '../eventbus/EventBus';

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
        eventBus.streamStatus(`Nouvelle version ${remoteCatalog.version} disponible. Téléchargement en arrière-plan...`);
        
        // Simule le téléchargement des nouveaux fichiers/modèles
        await this.downloadNewFiles(remoteCatalog);

        this.currentVersion = remoteCatalog.version;
        
        // Notifie l'UI qu'une mise à jour est prête
        eventBus.streamUpdateReady(remoteCatalog.version, "Une mise à jour est prête. Redémarrez pour l'appliquer.");
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
    await storageManager.simulateDownloadFile(newFile);
    
    console.log(`[UpdateService] Téléchargement en arrière-plan terminé.`);
  }
}

export const updateService = new UpdateService();