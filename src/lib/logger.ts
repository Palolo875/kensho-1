/**
 * Structured Logging System for Kensho
 * Provides isomorphic logging (Node.js + Browser) with levels, context, and formatting
 * Replaces console.log/error/warn throughout the codebase
 *
 * @version 2.0.0 - Enhanced with environment-aware configuration and typed data
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
  error?: Error;
}

export interface LoggerConfig {
  minLevel?: LogLevel;
  enableConsole?: boolean;
  enablePersist?: boolean;
  persistKey?: string;
  maxLogs?: number;
}

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.NONE]: 'NONE',
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[36m',
  [LogLevel.INFO]: '\x1b[32m',
  [LogLevel.WARN]: '\x1b[33m',
  [LogLevel.ERROR]: '\x1b[31m',
  [LogLevel.NONE]: '',
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RESET_COLOR = '\x1b[0m';

function isProduction(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return true;
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location?.hostname || '';
    return !hostname.includes('localhost') &&
           !hostname.includes('127.0.0.1') &&
           !hostname.includes('.replit.dev');
  }
  return false;
}

function getDefaultMinLevel(): LogLevel {
  if (isProduction()) {
    return LogLevel.WARN;
  }
  return LogLevel.DEBUG;
}

class KenshoLogger {
  private minLevel: LogLevel;
  private enableConsole: boolean;
  private enablePersist: boolean;
  private persistKey: string;
  private logs: LogEntry[] = [];
  private maxLogs: number;
  private contextFilters: Set<string> = new Set();
  private isFilterWhitelist: boolean = false;

  constructor(config?: LoggerConfig) {
    this.minLevel = config?.minLevel ?? getDefaultMinLevel();
    this.enableConsole = config?.enableConsole ?? true;
    this.enablePersist = config?.enablePersist ?? false;
    this.persistKey = config?.persistKey ?? 'kensho_logs_v2';
    this.maxLogs = config?.maxLogs ?? 500;
  }

  configure(config: Partial<LoggerConfig>): void {
    if (config.minLevel !== undefined) this.minLevel = config.minLevel;
    if (config.enableConsole !== undefined) this.enableConsole = config.enableConsole;
    if (config.enablePersist !== undefined) this.enablePersist = config.enablePersist;
    if (config.persistKey !== undefined) this.persistKey = config.persistKey;
    if (config.maxLogs !== undefined) this.maxLogs = config.maxLogs;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  setContextFilter(contexts: string[], whitelist: boolean = true): void {
    this.contextFilters = new Set(contexts);
    this.isFilterWhitelist = whitelist;
  }

  clearContextFilter(): void {
    this.contextFilters.clear();
  }

  private shouldLog(level: LogLevel, context: string): boolean {
    if (level < this.minLevel) return false;

    if (this.contextFilters.size > 0) {
      const hasContext = this.contextFilters.has(context);
      return this.isFilterWhitelist ? hasContext : !hasContext;
    }

    return true;
  }

  private formatForConsole(level: LogLevel, context: string, message: string): string {
    const timestamp = new Date().toISOString().substring(11, 23);
    const levelLabel = LOG_LEVEL_LABELS[level];
    return `[${timestamp}] [${levelLabel}] [${context}] ${message}`;
  }

  private formatData(data: unknown): string {
    if (data === undefined || data === null) return '';
    try {
      if (typeof data === 'object') {
        return JSON.stringify(data, null, 0);
      }
      return String(data);
    } catch {
      return '[Unserializable data]';
    }
  }

  private log(level: LogLevel, context: string, message: string, data?: unknown, error?: Error): void {
    if (!this.shouldLog(level, context)) return;

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
      const formatted = this.formatForConsole(level, context, message);
      const dataStr = this.formatData(data);
      const fullMessage = dataStr ? `${formatted} ${dataStr}` : formatted;

      switch (level) {
        case LogLevel.DEBUG:
          console.debug(fullMessage);
          break;
        case LogLevel.INFO:
          console.info(fullMessage);
          break;
        case LogLevel.WARN:
          console.warn(fullMessage);
          break;
        case LogLevel.ERROR:
          if (error) {
            console.error(fullMessage, error);
          } else {
            console.error(fullMessage);
          }
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
    } catch {
      // localStorage might be full or unavailable
    }
  }

  debug(context: string, message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, context, message, data);
  }

  info(context: string, message: string, data?: unknown): void {
    this.log(LogLevel.INFO, context, message, data);
  }

  warn(context: string, message: string, data?: unknown): void {
    this.log(LogLevel.WARN, context, message, data);
  }

  error(context: string, message: string, error?: Error | unknown, data?: unknown): void {
    let errorObj: Error | undefined;
    if (error instanceof Error) {
      errorObj = error;
    } else if (error !== undefined && error !== null) {
      errorObj = new Error(String(error));
    }
    this.log(LogLevel.ERROR, context, message, data, errorObj);
  }

  getLogs(level?: LogLevel): LogEntry[] {
    return level !== undefined ? this.logs.filter(l => l.level === level) : [...this.logs];
  }

  getLogsByContext(context: string): LogEntry[] {
    return this.logs.filter(l => l.context === context);
  }

  getRecentErrors(count: number = 10): LogEntry[] {
    return this.logs.filter(l => l.level === LogLevel.ERROR).slice(-count);
  }

  clear(): void {
    this.logs = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(this.persistKey);
      }
    } catch {
      // Silently fail
    }
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = new KenshoLogger();

export interface ContextLogger {
  debug: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, err?: Error | unknown, data?: unknown) => void;
}

export function createLogger(context: string): ContextLogger {
  return {
    debug: (msg: string, data?: unknown) => logger.debug(context, msg, data),
    info: (msg: string, data?: unknown) => logger.info(context, msg, data),
    warn: (msg: string, data?: unknown) => logger.warn(context, msg, data),
    error: (msg: string, err?: Error | unknown, data?: unknown) => logger.error(context, msg, err, data),
  };
}

export { LogLevel as Level };
export default logger;
