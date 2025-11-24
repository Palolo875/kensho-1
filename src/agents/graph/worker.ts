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
        console.log('[GraphWorker] 🚀 Initialisation du worker de graphe...');
        
        const graphWorker = new GraphWorker();
        
        // Attendre que le GraphWorker soit prêt avant d'enregistrer les méthodes
        await graphWorker.ensureReady();
        
        runtime.log('info', '[GraphWorker] ✅ Système de graphe prêt');

        // ========================================
        // Méthodes existantes du Knowledge Graph
        // ========================================

        runtime.registerMethod('atomicAddNode', async (payload: { node: any }) => {
            return await graphWorker.atomicAddNode(payload.node);
        });

        runtime.registerMethod('search', async (payload: { embedding: number[]; k: number }) => {
            return await graphWorker.search(payload.embedding, payload.k);
        });

        runtime.registerMethod('addEdge', async (payload: { edge: any }) => {
            return await graphWorker.addEdge(payload.edge);
        });

        runtime.registerMethod('getNode', async (payload: { id: string }) => {
            return await graphWorker.getNode(payload.id);
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

        runtime.registerMethod('deleteNodesByTopic', async (payload: { topic: string }) => {
            return await graphWorker.deleteNodesByTopic(payload.topic);
        });

        // ========================================
        // Nouvelles méthodes Sprint 7 : Projets
        // ========================================

        runtime.registerMethod('createProject', async (payload: { name: string; goal?: string }) => {
            return await graphWorker.createProject(payload.name, payload.goal || '');
        });

        runtime.registerMethod('getProject', async (payload: { id: string }) => {
            return await graphWorker.getProject(payload.id);
        });

        runtime.registerMethod('getActiveProjects', async () => {
            return await graphWorker.getActiveProjects();
        });

        runtime.registerMethod('updateProject', async (payload: { id: string; updates: any }) => {
            return await graphWorker.updateProject(payload.id, payload.updates);
        });

        runtime.registerMethod('deleteProject', async (payload: { id: string }) => {
            return await graphWorker.deleteProject(payload.id);
        });

        // ========================================
        // Nouvelles méthodes Sprint 7 : Tâches
        // ========================================

        runtime.registerMethod('createTask', async (payload: { projectId: string; text: string }) => {
            return await graphWorker.createTask(payload.projectId, payload.text);
        });

        runtime.registerMethod('getProjectTasks', async (payload: { projectId: string }) => {
            return await graphWorker.getProjectTasks(payload.projectId);
        });

        runtime.registerMethod('toggleTask', async (payload: { taskId: string }) => {
            return await graphWorker.toggleTask(payload.taskId);
        });

        runtime.registerMethod('deleteTask', async (payload: { taskId: string }) => {
            return await graphWorker.deleteTask(payload.taskId);
        });

        // ========================================
        // Sprint 9: Fact-Checking Evidence Search
        // ========================================

        runtime.registerMethod('findEvidence', async (payload: { embedding: number[] }) => {
            return await graphWorker.findEvidence(payload.embedding, 3);
        });

        runtime.log('info', '[GraphWorker] ✅ Toutes les méthodes enregistrées');
    }
});
