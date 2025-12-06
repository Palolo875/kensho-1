/**
 * WorkerScheduler - Planificateur intelligent pour le warming planifié
 *
 * Gère l'exécution de tâches en arrière-plan avec priorités et requestIdleCallback
 */

export interface SchedulerOptions {
  priority: 'high' | 'normal' | 'low';
  idleCallback?: boolean;
  idleTimeout?: number;
  maxConcurrency?: number;
}

export interface TaskOptions {
  priority: 'high' | 'normal' | 'low';
}

export interface ScheduledTask {
  task: () => Promise<void>;
  priority: 'high' | 'normal' | 'low';
  scheduledAt: number;
}

export class WorkerScheduler {
  private tasks: ScheduledTask[] = [];
  private readonly options: SchedulerOptions;

  constructor(options: SchedulerOptions) {
    this.options = options;
  }

  public schedule(task: () => Promise<void>, options: TaskOptions): void {
    const scheduledTask: ScheduledTask = {
      task,
      priority: options.priority || 'normal',
      scheduledAt: Date.now()
    };

    this.tasks.push(scheduledTask);
    this.processNextTask();
  }

  private async processNextTask(): Promise<void> {
    if (this.tasks.length === 0) return;

    // Trier par priorité
    this.tasks.sort((a, b) => {
      const priorityOrder = { 'high': 0, 'normal': 1, 'low': 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const nextTask = this.tasks.shift();
    if (!nextTask) return;

    try {
      if (this.options.idleCallback && typeof requestIdleCallback !== 'undefined') {
        // Utiliser requestIdleCallback pour le browser
        await new Promise<void>((resolve) => {
          requestIdleCallback(async () => {
            await nextTask.task();
            resolve();
          }, { timeout: this.options.idleTimeout || 1000 });
        });
      } else {
        // Exécuter directement
        await nextTask.task();
      }
    } catch (error) {
      console.error('[WorkerScheduler] Échec de l\'exécution de la tâche', error);
    }
  }
}