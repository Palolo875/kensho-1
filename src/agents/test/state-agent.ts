import { runAgent } from '../../core/agent-system/defineAgent';

interface State {
    bootCount: number;
    lastBoot: number;
}

runAgent({
    init: async (runtime) => {
        runtime.log('info', 'StateAgent starting...');

        // Charger l'état précédent
        let state = await runtime.loadState<State>('boot_info');

        if (!state) {
            runtime.log('info', 'No previous state found. First boot.');
            state = {
                bootCount: 0,
                lastBoot: Date.now()
            };
        } else {
            runtime.log('info', `State loaded. Previous boot count: ${state.bootCount}`);
        }

        // Mettre à jour l'état
        state.bootCount++;
        state.lastBoot = Date.now();

        // Sauvegarder
        await runtime.saveState('boot_info', state);
        runtime.log('info', `State saved. New boot count: ${state.bootCount}`);

        // Exposer une méthode pour lire l'état actuel (pour le test)
        runtime.registerMethod('getBootCount', () => {
            return state!.bootCount;
        });
    }
});
