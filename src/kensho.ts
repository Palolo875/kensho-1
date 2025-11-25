/**
 * src/kensho.ts
 * 
 * API publique principale de Kensho.
 * C'est le seul point d'entrée que l'interface utilisateur devrait importer.
 */

import { modelManager } from './core/kernel/ModelManager';
import { DialoguePlugin } from './plugins/dialogue/DialoguePlugin';
import type { InitProgressReport } from '@mlc-ai/web-llm';

console.log("🚀 Initialisation de Kensho OS...");

/**
 * L'interface publique de Kensho.
 * Expose les plugins disponibles et les méthodes d'utilisation.
 */
export interface KenshoAPI {
  /** Plugin de dialogue - point d'entrée principal */
  dialogue: DialoguePlugin;
  
  // Futurs plugins
  // code?: CodePlugin;
  // vision?: VisionPlugin;
}

/**
 * Initialise le moteur Kensho et retourne l'API publique.
 * 
 * C'est la SEULE fonction que l'UI doit appeler au démarrage.
 * 
 * @param defaultModelKey - Modèle à pré-charger (défaut: 'gemma-3-270m')
 * @param onProgress - Callback optionnel pour voir la progression du téléchargement
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
export async function initializeKensho(
  defaultModelKey = 'gemma-2-2b',
  onProgress?: (progress: InitProgressReport) => void
): Promise<KenshoAPI> {
  try {
    console.log(`🔧 [Kensho] Initialisation avec modèle: ${defaultModelKey}`);
    
    // Initialiser le ModelManager
    // Cela va:
    // 1. Télécharger le modèle (peut prendre du temps)
    // 2. Initialiser le moteur WebLLM
    // 3. Charger le modèle en VRAM
    // 4. Préparer tous les composants (Cache, MemoryManager, etc.)
    await modelManager.init(defaultModelKey, (progress) => {
      if (onProgress) {
        onProgress(progress);
      }
      // Afficher la progression en console aussi
      if (progress.text) {
        console.log(`⏳ [Download] ${progress.text}`);
      }
    });

    console.log("✅ [Kensho] Système prêt. Vous pouvez maintenant discuter!");

    // Retourner l'API publique
    const api: KenshoAPI = {
      dialogue: new DialoguePlugin()
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
