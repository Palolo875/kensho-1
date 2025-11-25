/**
 * src/kensho.ts
 * 
 * API publique principale de Kensho.
 * C'est le seul point d'entrée que l'interface utilisateur devrait importer.
 * 
 * MODE SIMULATION: Version "Usine Vide" - Pas de téléchargement de modèles
 */

import { DialoguePluginMock } from './plugins/dialogue/DialoguePluginMock';

console.log("🚀 Initialisation de Kensho OS (Mode Simulation)...");

/**
 * L'interface publique de Kensho.
 * Expose les plugins disponibles et les méthodes d'utilisation.
 */
export interface KenshoAPI {
  /** Plugin de dialogue - point d'entrée principal */
  dialogue: DialoguePluginMock;
  
  // Futurs plugins
  // code?: CodePlugin;
  // vision?: VisionPlugin;
}

/**
 * Initialise le moteur Kensho et retourne l'API publique.
 * 
 * MODE SIMULATION: Pas de téléchargement de modèles, utilise des mocks.
 * 
 * @returns Une promesse qui résout avec l'API Kensho
 * 
 * @example
 * ```typescript
 * const kensho = await initializeKensho();
 * for await (const event of kensho.dialogue.startConversation("Bonjour!")) {
 *   if (event.type === 'token') {
 *     console.log(event.data); // Afficher le token
 *   }
 * }
 * ```
 */
export async function initializeKensho(): Promise<KenshoAPI> {
  try {
    console.log(`🔧 [Kensho] Initialisation en mode simulation (pas de téléchargement)`);
    
    console.log("✅ [Kensho] Système prêt (mode simulation). Vous pouvez maintenant discuter!");

    const api: KenshoAPI = {
      dialogue: new DialoguePluginMock()
    };

    return api;
  } catch (error) {
    console.error("❌ [Kensho] Erreur d'initialisation:", error);
    throw error;
  }
}

/**
 * Fonction helper pour obtenir l'API sans appeler init à nouveau
 * (utile si vous voulez réutiliser une instance existante)
 */
let globalKenshoInstance: KenshoAPI | null = null;

export async function getKensho(): Promise<KenshoAPI> {
  if (!globalKenshoInstance) {
    globalKenshoInstance = await initializeKensho();
  }
  return globalKenshoInstance;
}

/**
 * Export par défaut pour faciliter les imports
 */
export default {
  initializeKensho,
  getKensho
};
