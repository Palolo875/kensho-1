console.log("📜 LoggerService (Production) initialisé.");

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogPayload {
  message: string;
  service: string; // ex: 'Router', 'TaskExecutor'
  data?: Record<string, any>; // Données contextuelles
  error?: {
    message: string;
    stack?: string;
  };
}

class LoggerService {
  private log(level: LogLevel, payload: LogPayload): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      ...payload,
    };

    // En production, on enverrait ceci à un service externe.
    // Pour notre usine vide, on l'affiche en JSON dans la console.
    console.log(JSON.stringify(logEntry, null, 2));
  }

  public info(service: string, message: string, data?: Record<string, any>): void {
    this.log('INFO', { service, message, data });
  }

  public warn(service: string, message: string, data?: Record<string, any>): void {
    this.log('WARN', { service, message, data });
  }

  public error(service: string, message: string, error: Error, data?: Record<string, any>): void {
    this.log('ERROR', {
      service,
      message,
      data,
      error: {
        message: error.message,
        stack: error.stack,
      },
    });
  }

  public debug(service: string, message: string, data?: Record<string, any>): void {
    // Les logs de debug pourraient être désactivés en production
    if (process.env.NODE_ENV !== 'production') {
      this.log('DEBUG', { service, message, data });
    }
  }
}

export const logger = new LoggerService();