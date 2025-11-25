/**
 * TaskExecutor v3.0 - Chef de Chantier Intelligent
 * 
 * Améliorations v3.0:
 * ✅ Gestion stricte de la concurrence avec p-queue
 * ✅ Gestion native des priorités
 * ✅ Timeouts avec AbortController
 * ✅ Streaming pour TTFT optimal
 * ✅ Observabilité complète (activeWorkers, queueSize)
 */

import PQueue from 'p-queue';
import { modelManager } from './ModelManager';
import { router } from '../router/Router';
import { 
  ExecutionPlan, 
  Task, 
  TaskResult, 
  StreamChunk, 
  ExecutionStrategy,
  RouterError
} from '../router/RouterTypes';
import { fusioner } from './Fusioner';

console.log("👷 TaskExecutor v3.0 - Chef de Chantier Intelligent initialisé");

export class TaskExecutor {
  private queue: PQueue;
  private activeWorkers = 0;

  constructor() {
    this.queue = new PQueue({ 
      concurrency: 1,
      timeout: 60000 // Timeout global de 60s
    });
  }

  /**
   * Process avec streaming pour UX optimale
   * Retourne un AsyncGenerator qui streame les chunks au fur et à mesure
   */
  public async *processStream(userPrompt: string): AsyncGenerator<StreamChunk> {
    console.log(`[TaskExecutor] 🚀 Nouvelle requête: "${userPrompt.substring(0, 50)}..."`);

    try {
      // 1. Obtenir le plan du Router
      const plan = await router.createPlan(userPrompt);
      console.log(`[TaskExecutor] 📋 Plan créé | Stratégie: ${plan.strategy} | Tâches: ${plan.fallbackTasks.length + 1}`);

      // Valider le plan
      await router.validatePlan(plan);

      // 2. Ajuster la concurrence dynamiquement
      this.queue.concurrency = this.getConcurrencyLimit(plan.strategy);
      console.log(`[TaskExecutor] ⚙️  Concurrence: ${this.queue.concurrency}`);

      // 3. Lancer les tâches fallback en arrière-plan (avec priorité plus basse)
      const fallbackPromises = plan.fallbackTasks.map((task, index) =>
        this.queue.add(
          () => this.executeTaskWithTimeout(task, userPrompt),
          { priority: this.getPriorityValue(task.priority) }
        )
      );

      // 4. Streamer la tâche primaire (priorité maximale)
      yield { type: 'status', status: `Exécution de ${plan.primaryTask.agentName}...` };

      const engine = await modelManager.getEngine();
      
      // Charger le modèle si nécessaire
      if (!modelManager.isModelLoaded(plan.primaryTask.modelKey)) {
        console.log(`[TaskExecutor] 🔄 Chargement du modèle ${plan.primaryTask.modelKey}...`);
        yield { type: 'status', status: `Chargement du modèle ${plan.primaryTask.modelKey}...` };
        await modelManager.switchModel(plan.primaryTask.modelKey);
      }

      // Créer le prompt pour la tâche primaire
      const primaryPrompt = plan.primaryTask.prompt || userPrompt;

      // Streamer la réponse
      console.log(`[TaskExecutor] ▶️  Streaming ${plan.primaryTask.agentName}...`);
      const primaryStream = await engine.chat.completions.create({
        messages: [{ role: 'user', content: primaryPrompt }],
        stream: true,
        temperature: plan.primaryTask.temperature
      });

      let primaryContent = '';
      const startTime = performance.now();

      for await (const chunk of primaryStream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          primaryContent += content;
          yield { type: 'primary', content };
        }
      }

      const duration = performance.now() - startTime;
      console.log(`[TaskExecutor] ✅ ${plan.primaryTask.agentName} terminé (${duration.toFixed(0)}ms, ${primaryContent.length} chars)`);

      // 5. Attendre les résultats des tâches fallback
      let expertResults: TaskResult[] = [];
      if (fallbackPromises.length > 0) {
        console.log(`[TaskExecutor] ⏳ Attente des ${fallbackPromises.length} tâche(s) fallback...`);
        expertResults = await Promise.all(fallbackPromises);
        
        const successCount = expertResults.filter(r => r.status === 'success').length;
        console.log(`[TaskExecutor] 📊 Fallback: ${successCount}/${expertResults.length} réussis`);
      }

      // 6. Fusionner les résultats
      const primaryResult: TaskResult = {
        agentName: plan.primaryTask.agentName,
        modelKey: plan.primaryTask.modelKey,
        result: primaryContent,
        status: 'success',
        duration
      };

      const finalResponse = await fusioner.fuse({
        primaryResult,
        expertResults
      });

      // 7. Envoyer le chunk de fusion final
      yield { 
        type: 'fusion', 
        content: finalResponse,
        expertResults 
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      console.error(`[TaskExecutor] ❌ Erreur lors du traitement:`, error);
      
      yield {
        type: 'status',
        status: `Erreur: ${errorMessage}`
      };
      
      throw error;
    }
  }

  /**
   * Process classique (sans streaming) pour compatibilité
   * Collecte tous les chunks et retourne la réponse finale
   */
  public async process(userPrompt: string): Promise<string> {
    let finalContent = '';
    
    for await (const chunk of this.processStream(userPrompt)) {
      if (chunk.type === 'fusion' && chunk.content) {
        finalContent = chunk.content;
      } else if (chunk.type === 'primary' && chunk.content) {
        // Accumuler le contenu primaire si pas de fusion
        finalContent += chunk.content;
      }
    }

    return finalContent;
  }

  /**
   * Exécute une tâche avec timeout et gestion d'erreurs robuste
   */
  private async executeTaskWithTimeout(task: Task, userPrompt: string): Promise<TaskResult> {
    const timeoutMs = task.timeout;
    const controller = new AbortController();
    const startTime = performance.now();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        controller.abort();
        reject(new Error(`Timeout après ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      this.activeWorkers++;
      console.log(`   [Worker ${this.activeWorkers}] ▶️  ${task.agentName} démarré (${this.queue.pending} en attente)`);
      
      const result = await Promise.race([
        this.executeTask(task, userPrompt, controller.signal),
        timeoutPromise
      ]);
      
      this.activeWorkers--;
      return result;
      
    } catch (error) {
      this.activeWorkers--;
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`   [Worker] ❌ ${task.agentName} échoué après ${duration.toFixed(0)}ms:`, errorMessage);
      
      return { 
        agentName: task.agentName,
        modelKey: task.modelKey,
        error: errorMessage, 
        status: controller.signal.aborted ? 'timeout' : 'error',
        duration
      };
    }
  }

  /**
   * Exécute une seule tâche (appelé par executeTaskWithTimeout)
   */
  private async executeTask(task: Task, userPrompt: string, signal: AbortSignal): Promise<TaskResult> {
    const engine = await modelManager.getEngine();
    const startTime = performance.now();
    
    // Charger le modèle si nécessaire
    if (!modelManager.isModelLoaded(task.modelKey)) {
      console.log(`   [Worker] 🔄 Chargement du modèle ${task.modelKey}...`);
      await modelManager.switchModel(task.modelKey);
    }

    // Utiliser le prompt de la tâche ou le prompt utilisateur
    const prompt = task.prompt || userPrompt;

    const response = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: task.temperature
    });

    if (signal.aborted) {
      throw new Error('Task aborted');
    }

    const content = response.choices[0]?.message?.content || "";
    const duration = performance.now() - startTime;
    
    console.log(`   [Worker] ✅ ${task.agentName} terminé (${duration.toFixed(0)}ms, ${content.length} chars)`);
    
    return { 
      agentName: task.agentName,
      modelKey: task.modelKey,
      result: content, 
      status: 'success',
      duration
    };
  }

  /**
   * Détermine la limite de concurrence selon la stratégie
   */
  private getConcurrencyLimit(strategy: ExecutionStrategy): number {
    switch (strategy) {
      case 'SERIAL': 
        return 1;
      case 'PARALLEL_LIMITED': 
        return 2;
      case 'PARALLEL_FULL': 
        return 4;
      default: 
        return 1;
    }
  }

  /**
   * Convertit une priorité en valeur numérique pour p-queue
   * Plus le nombre est élevé, plus la priorité est haute
   */
  private getPriorityValue(priority: string): number {
    switch (priority) {
      case 'HIGH': 
        return 10;
      case 'MEDIUM': 
        return 5;
      case 'LOW': 
        return 1;
      default: 
        return 1;
    }
  }

  /**
   * Observabilité : Nombre de workers actifs
   */
  public getActiveWorkerCount(): number {
    return this.activeWorkers;
  }

  /**
   * Observabilité : Taille de la file d'attente
   */
  public getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * Observabilité : Nombre de tâches en attente
   */
  public getPendingCount(): number {
    return this.queue.pending;
  }

  /**
   * Observabilité : Statistiques complètes
   */
  public getStats() {
    return {
      activeWorkers: this.activeWorkers,
      queueSize: this.queue.size,
      pending: this.queue.pending,
      concurrency: this.queue.concurrency
    };
  }
}

// Instance singleton exportée
export const taskExecutor = new TaskExecutor();
