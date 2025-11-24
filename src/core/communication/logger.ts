/**
 * Système de logging configurable pour MessageBus et autres composants.
 * Permet de customiser le comportement du logging (niveau, format, destination).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  component: string;
  message: string;
  data?: unknown;
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

/**
 * Logger par défaut qui écrit dans la console.
 * Respecte le niveau de log minimum configuré.
 */
export class ConsoleLogger implements Logger {
  private static readonly LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    none: 4
  };

  constructor(
    private readonly component: string,
    private readonly minLevel: LogLevel = 'info'
  ) {}

  private shouldLog(level: LogLevel): boolean {
    return ConsoleLogger.LEVEL_PRIORITY[level] >= ConsoleLogger.LEVEL_PRIORITY[this.minLevel];
  }

  private formatMessage(level: LogLevel, message: string): string {
    return `[${this.component}] ${message}`;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), data);
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), data);
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), data);
    }
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), data);
    }
  }
}

/**
 * Logger qui accumule les logs dans un buffer.
 * Utile pour les tests ou pour envoyer les logs par batch.
 */
export class BufferedLogger implements Logger {
  private buffer: LogEntry[] = [];

  constructor(
    private readonly component: string,
    private readonly maxBufferSize: number = 100
  ) {}

  private addEntry(level: LogLevel, message: string, data?: unknown): void {
    this.buffer.push({
      timestamp: Date.now(),
      level,
      component: this.component,
      message,
      data
    });

    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  debug(message: string, data?: unknown): void {
    this.addEntry('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.addEntry('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.addEntry('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.addEntry('error', message, data);
  }

  getBuffer(): LogEntry[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }
}

/**
 * Logger silencieux qui n'émet aucun log.
 * Utile pour les tests ou quand le logging doit être désactivé.
 */
export class NoOpLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * Factory pour créer des loggers.
 */
export class LoggerFactory {
  private static defaultLevel: LogLevel = 'info';
  private static loggerType: 'console' | 'buffered' | 'noop' = 'console';

  static setDefaultLevel(level: LogLevel): void {
    this.defaultLevel = level;
  }

  static setLoggerType(type: 'console' | 'buffered' | 'noop'): void {
    this.loggerType = type;
  }

  static createLogger(component: string, level?: LogLevel): Logger {
    const logLevel = level || this.defaultLevel;

    switch (this.loggerType) {
      case 'buffered':
        return new BufferedLogger(component);
      case 'noop':
        return new NoOpLogger();
      case 'console':
      default:
        return new ConsoleLogger(component, logLevel);
    }
  }
}
