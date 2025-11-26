/**
 * GraphWorker Agent - Worker wrapper pour le système de graphe de connaissances
 * 
 * Ce fichier expose GraphWorker comme un agent MessageBus, permettant à l'UI et
 * aux autres agents de communiquer avec le système de persistence.
 */

import { runAgent } from '../../core/agent-system/defineAgent';
import { AgentRuntime } from '../../core/agent-system/AgentRuntime';
import { GraphWorker } from './index';

runAgent({
    name: 'GraphWorker',
    init: async (runtime: AgentRuntime) => {
        
        const graphWorker = new GraphWorker();
        
        // Attendre que le GraphWorker soit prêt avant d'enregistrer les méthodes
        await graphWorker.ensureReady();
        
        runtime.log('info', '[GraphWorker] ✅ Système de graphe prêt');

        // ========================================
        // Méthodes existantes du Knowledge Graph
        // ========================================

        runtime.registerMethod('atomicAddNode', async (payload) => {
            return await graphWorker.atomicAddNode((payload as any).node);
        });

        runtime.registerMethod('search', async (payload) => {
            const p = payload as any;
            return await graphWorker.search(p.embedding, p.k);
        });

        runtime.registerMethod('addEdge', async (payload) => {
            return await graphWorker.addEdge((payload as any).edge);
        });

        runtime.registerMethod('getNode', async (payload) => {
            return await graphWorker.getNode((payload as any).id);
        });

        runtime.registerMethod('getStats', async () => {
            return await graphWorker.getStats();
        });

        runtime.registerMethod('checkpoint', async () => {
            return await graphWorker.checkpoint();
        });

        runtime.registerMethod('rebuildIndex', async () => {
            return await graphWorker.rebuildIndex();
        });

        runtime.registerMethod('deleteNodesByTopic', async (payload) => {
            return await graphWorker.deleteNodesByTopic((payload as any).topic);
        });

        // ========================================
        // Nouvelles méthodes Sprint 7 : Projets
        // ========================================

        runtime.registerMethod('createProject', async (payload) => {
            const p = payload as any;
            return await graphWorker.createProject(p.name, p.goal || '');
        });

        runtime.registerMethod('getProject', async (payload) => {
            return await graphWorker.getProject((payload as any).id);
        });

        runtime.registerMethod('getActiveProjects', async () => {
            return await graphWorker.getActiveProjects();
        });

        runtime.registerMethod('updateProject', async (payload) => {
            const p = payload as any;
            return await graphWorker.updateProject(p.id, p.updates);
        });

        runtime.registerMethod('deleteProject', async (payload) => {
            return await graphWorker.deleteProject((payload as any).id);
        });

        // ========================================
        // Nouvelles méthodes Sprint 7 : Tâches
        // ========================================

        runtime.registerMethod('createTask', async (payload) => {
            const p = payload as any;
            return await graphWorker.createTask(p.projectId, p.text);
        });

        runtime.registerMethod('getProjectTasks', async (payload) => {
            return await graphWorker.getProjectTasks((payload as any).projectId);
        });

        runtime.registerMethod('toggleTask', async (payload) => {
            return await graphWorker.toggleTask((payload as any).taskId);
        });

        runtime.registerMethod('deleteTask', async (payload) => {
            return await graphWorker.deleteTask((payload as any).taskId);
        });

        // ========================================
        // Sprint 9: Fact-Checking Evidence Search
        // ========================================

        runtime.registerMethod('findEvidence', async (payload) => {
            return await graphWorker.findEvidence((payload as any).embedding, 3);
        });

        runtime.log('info', '[GraphWorker] ✅ Toutes les méthodes enregistrées');
    }
});
