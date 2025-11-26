import { createLogger } from '../../lib/logger';

const log = createLogger('ExecutionTraceContext');

export type TraceLevel = 'ROUTER' | 'KERNEL' | 'EXECUTOR' | 'STREAM' | 'ENGINE';

export interface TraceEvent {
  level: TraceLevel;
  timestamp: number;
  component: string;
  action: string;
  data?: Record<string, any>;
  duration?: number;
  status: 'start' | 'progress' | 'success' | 'error' | 'warning';
  error?: {
    message: string;
    code: string;
    stack?: string;
  };
}

export interface ExecutionTrace {
  requestId: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalDuration?: number;
  events: TraceEvent[];
  summary: {
    routerTime: number;
    kernelTime: number;
    executorTime: number;
    streamTime: number;
    engineTime: number;
    totalTime: number;
  };
}

export class ExecutionTraceContext {
  private static readonly traces = new Map<string, ExecutionTrace>();
  private static readonly MAX_TRACES = 100;

  private requestId: string;
  private trace: ExecutionTrace;

  constructor(requestId?: string) {
    this.requestId = requestId || this.generateRequestId();
    this.trace = {
      requestId: this.requestId,
      startTime: performance.now(),
      status: 'running',
      events: [],
      summary: {
        routerTime: 0,
        kernelTime: 0,
        executorTime: 0,
        streamTime: 0,
        engineTime: 0,
        totalTime: 0
      }
    };

    ExecutionTraceContext.traces.set(this.requestId, this.trace);
    
    if (ExecutionTraceContext.traces.size > ExecutionTraceContext.MAX_TRACES) {
      const oldest = Array.from(ExecutionTraceContext.traces.entries())
        .sort((a, b) => a[1].startTime - b[1].startTime)[0];
      if (oldest) {
        ExecutionTraceContext.traces.delete(oldest[0]);
      }
    }
  }

  public addEvent(
    level: TraceLevel,
    component: string,
    action: string,
    status: 'start' | 'progress' | 'success' | 'error' | 'warning' = 'progress',
    data?: Record<string, any>,
    error?: { message: string; code: string; stack?: string }
  ): void {
    const event: TraceEvent = {
      level,
      timestamp: performance.now(),
      component,
      action,
      status,
      data,
      error
    };

    this.trace.events.push(event);
    this.logEvent(event);
  }

  public addTimedEvent(
    level: TraceLevel,
    component: string,
    action: string,
    duration: number,
    status: 'success' | 'error' = 'success',
    data?: Record<string, any>
  ): void {
    const event: TraceEvent = {
      level,
      timestamp: performance.now(),
      component,
      action,
      status,
      data,
      duration
    };

    this.trace.events.push(event);

    switch (level) {
      case 'ROUTER':
        this.trace.summary.routerTime += duration;
        break;
      case 'KERNEL':
        this.trace.summary.kernelTime += duration;
        break;
      case 'EXECUTOR':
        this.trace.summary.executorTime += duration;
        break;
      case 'STREAM':
        this.trace.summary.streamTime += duration;
        break;
      case 'ENGINE':
        this.trace.summary.engineTime += duration;
        break;
    }

    this.logEvent(event);
  }

  public markCompleted(finalStatus: 'completed' | 'failed' = 'completed'): void {
    this.trace.endTime = performance.now();
    this.trace.status = finalStatus;
    this.trace.totalDuration = this.trace.endTime - this.trace.startTime;
    this.trace.summary.totalTime = this.trace.totalDuration;

    log.info(`Requête #${this.requestId} ${finalStatus} en ${this.trace.totalDuration.toFixed(0)}ms`);
  }

  private logEvent(event: TraceEvent): void {
    const statusEmoji = {
      start: '▶️',
      progress: '⏳',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    }[event.status];

    log.info(`[${event.level}:${event.component}] ${statusEmoji} ${event.action}${event.duration ? ` (${event.duration.toFixed(0)}ms)` : ''}`, event.data || '');
  }

  public getTrace(): ExecutionTrace {
    return this.trace;
  }

  public getRequestId(): string {
    return this.requestId;
  }

  public static getTrace(requestId: string): ExecutionTrace | undefined {
    return this.traces.get(requestId);
  }

  public static getAllTraces(): Map<string, ExecutionTrace> {
    return this.traces;
  }

  public static printSummary(requestId?: string): void {
    if (requestId) {
      const trace = this.traces.get(requestId);
      if (trace) {
        log.info('ExecutionTrace Summary', {
          'Request ID': trace.requestId,
          'Status': trace.status,
          'Total Duration (ms)': trace.totalDuration?.toFixed(2),
          'Router Time': trace.summary.routerTime.toFixed(2),
          'Kernel Time': trace.summary.kernelTime.toFixed(2),
          'Executor Time': trace.summary.executorTime.toFixed(2),
          'Stream Time': trace.summary.streamTime.toFixed(2),
          'Engine Time': trace.summary.engineTime.toFixed(2)
        });
      }
    } else {
      log.info('ExecutionTrace Summary');
      for (const [id, trace] of this.traces) {
        log.info(`[${id}] ${trace.status} - ${trace.totalDuration?.toFixed(0)}ms`);
      }
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
