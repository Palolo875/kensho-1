/**
 * Structured Logging System for Kensho
 * Provides isomorphic logging (Node.js + Browser) with levels, context, and formatting
 * Replaces console.log/error/warn throughout the codebase
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  context: string;
  message: string;
  data?: any;
  error?: Error;
}

export interface LoggerConfig {
  minLevel?: LogLevel;
  enableConsole?: boolean;
  enablePersist?: boolean;
  persistKey?: string;
}

class KenshoLogger {
  private minLevel: LogLevel = LogLevel.DEBUG;
  private enableConsole: boolean = true;
  private enablePersist: boolean = false;
  private persistKey: string = 'kensho_logs_v1';
  private logs: LogEntry[] = [];
  private maxLogs: number = 500;

  constructor(config?: LoggerConfig) {
    if (config?.minLevel) this.minLevel = config.minLevel;
    if (config?.enableConsole !== undefined) this.enableConsole = config.enableConsole;
    if (config?.enablePersist !== undefined) this.enablePersist = config.enablePersist;
    if (config?.persistKey) this.persistKey = config.persistKey;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(this.minLevel);
    const levelIndex = levels.indexOf(level);
    return levelIndex >= currentIndex;
  }

  private format(level: LogLevel, context: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const baseMsg = `[${timestamp}] [${context}] ${message}`;
    return data ? `${baseMsg} ${JSON.stringify(data)}` : baseMsg;
  }

  private log(level: LogLevel, context: string, message: string, data?: any, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      context,
      message,
      data,
      error,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    if (this.enableConsole) {
      const formatted = this.format(level, context, message, data);
      switch (level) {
        case LogLevel.DEBUG:
          console.log(formatted);
          break;
        case LogLevel.INFO:
          console.log(formatted);
          break;
        case LogLevel.WARN:
          console.warn(formatted);
          break;
        case LogLevel.ERROR:
          console.error(formatted, error || '');
          break;
      }
    }

    if (this.enablePersist) {
      this.persistLogs();
    }
  }

  private persistLogs(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const recent = this.logs.slice(-100);
        localStorage.setItem(this.persistKey, JSON.stringify(recent));
      }
    } catch (e) {
      // Fallback: silently fail if localStorage unavailable
    }
  }

  debug(context: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, context, message, data);
  }

  info(context: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, context, message, data);
  }

  warn(context: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, context, message, data);
  }

  error(context: string, message: string, error?: Error | any, data?: any): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.log(LogLevel.ERROR, context, message, data, errorObj);
  }

  getLogs(level?: LogLevel): LogEntry[] {
    return level ? this.logs.filter(l => l.level === level) : this.logs;
  }

  clear(): void {
    this.logs = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(this.persistKey);
      }
    } catch (e) {
      // Silently fail
    }
  }
}

export const logger = new KenshoLogger({
  minLevel: LogLevel.DEBUG,
  enableConsole: true,
  enablePersist: false, // Enable in production for debugging
});

// Export factory for creating contextualized loggers
export function createLogger(context: string) {
  return {
    debug: (msg: string, data?: any) => logger.debug(context, msg, data),
    info: (msg: string, data?: any) => logger.info(context, msg, data),
    warn: (msg: string, data?: any) => logger.warn(context, msg, data),
    error: (msg: string, err?: Error | any, data?: any) => logger.error(context, msg, err, data),
  };
}
