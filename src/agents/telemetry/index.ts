// src/agents/telemetry/index.ts
import { runAgent } from '../../core/agent-system/defineAgent';

// État simple en mémoire pour agréger les statistiques du planificateur
const plannerStats = {
    totalPlans: 0,
    validPlans: 0,
    toolPlans: 0,
    totalPlanningTime: 0,
};

// Ce worker est très simple pour l'instant. Son seul rôle est de recevoir
// des lots de logs et de les transmettre au thread principal (l'UI).
runAgent({
    name: 'TelemetryWorker',
    init: (runtime) => {
        runtime.registerMethod('logBatch', (payload: unknown) => {
            const logBatch = payload as any[];
            // Transférer le lot de logs au thread principal pour affichage.
            self.postMessage({ type: 'LOG_BATCH', payload: logBatch });
        });

        // Méthode pour tracker les métriques du planificateur
        runtime.registerMethod('trackPlannerMetric', (payload: unknown) => {
            const metric = payload as {
                planningTime: number;
                wasValid: boolean;
                usedTool: boolean;
            };
            plannerStats.totalPlans++;
            if (metric.wasValid) plannerStats.validPlans++;
            if (metric.usedTool) plannerStats.toolPlans++;
            plannerStats.totalPlanningTime += metric.planningTime;
            
            // Transférer les stats au thread principal pour affichage potentiel
            self.postMessage({ type: 'PLANNER_STATS', payload: {
                ...plannerStats,
                validJSONRate: plannerStats.totalPlans > 0 
                    ? (plannerStats.validPlans / plannerStats.totalPlans) 
                    : 0,
                toolUsageRate: plannerStats.totalPlans > 0 
                    ? (plannerStats.toolPlans / plannerStats.totalPlans) 
                    : 0,
                avgPlanningTime: plannerStats.totalPlans > 0 
                    ? (plannerStats.totalPlanningTime / plannerStats.totalPlans) 
                    : 0,
            }});
        });

        // Méthode pour obtenir les stats du planificateur
        runtime.registerMethod('getPlannerStats', () => {
            return {
                ...plannerStats,
                validJSONRate: plannerStats.totalPlans > 0 
                    ? (plannerStats.validPlans / plannerStats.totalPlans) 
                    : 0,
                toolUsageRate: plannerStats.totalPlans > 0 
                    ? (plannerStats.toolPlans / plannerStats.totalPlans) 
                    : 0,
                avgPlanningTime: plannerStats.totalPlans > 0 
                    ? (plannerStats.totalPlanningTime / plannerStats.totalPlans) 
                    : 0,
            };
        });
    }
});
