import { DialoguePluginMock } from './plugins/dialogue/DialoguePluginMock';
import { createLogger } from './lib/logger';

const log = createLogger('Kensho');

log.info('Initialisation de Kensho OS (Mode Simulation)...');

export interface KenshoAPI {
  dialogue: DialoguePluginMock;
}

export async function initializeKensho(): Promise<KenshoAPI> {
  try {
    log.info('Initialisation en mode simulation (pas de téléchargement)');
    
    log.info('Système prêt (mode simulation). Vous pouvez maintenant discuter!');

    const api: KenshoAPI = {
      dialogue: new DialoguePluginMock()
    };

    return api;
  } catch (error) {
    log.error('Erreur d\'initialisation:', error as Error);
    throw error;
  }
}

let globalKenshoInstance: KenshoAPI | null = null;

export async function getKensho(): Promise<KenshoAPI> {
  if (!globalKenshoInstance) {
    globalKenshoInstance = await initializeKensho();
  }
  return globalKenshoInstance;
}

export default {
  initializeKensho,
  getKensho
};
