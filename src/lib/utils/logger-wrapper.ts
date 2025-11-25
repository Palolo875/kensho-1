/**
 * Logger wrapper for centralized logging
 * Re-exports structured logger from src/lib/logger.ts
 */

export { logger, createLogger, LogLevel } from '../logger';
export type { LogEntry, LoggerConfig } from '../logger';
