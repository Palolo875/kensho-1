import { KenshoMessage } from './types';
import { createLogger } from '../../lib/logger';

const log = createLogger('Validation');

export function sanitizeString(input: unknown): string {
    if (typeof input !== 'string') {
        return String(input || '').substring(0, 10000);
    }
    
    return input
        .substring(0, 10000)
        .replace(/[<>\"']/g, (char) => {
            const escapeMap: Record<string, string> = {
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return escapeMap[char] || char;
        });
}

export function validatePayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') {
        return {};
    }

    const cleaned: Record<string, unknown> = {};
    const obj = payload as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj)) {
        if (typeof key !== 'string' || key.length > 1000) continue;
        
        if (typeof value === 'string') {
            cleaned[key] = sanitizeString(value);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            cleaned[key] = value;
        } else if (value === null) {
            cleaned[key] = null;
        } else if (Array.isArray(value)) {
            cleaned[key] = value.slice(0, 1000);
        } else if (typeof value === 'object') {
            cleaned[key] = validatePayload(value);
        }
    }

    return cleaned;
}

export const payloadValidator = {
    validate: (message: KenshoMessage): boolean => {
        if (!message?.messageId || !message?.type) {
            log.warn('Message invalide: ID ou type manquant');
            return false;
        }

        if (message.messageId.length > 1000) {
            log.warn('messageId trop long');
            return false;
        }

        if (message.payload && typeof message.payload === 'object') {
            const payloadSize = JSON.stringify(message.payload).length;
            if (payloadSize > 10_000_000) {
                log.warn('Payload trop volumineux:', { size: payloadSize });
                return false;
            }
        }

        return true;
    },
    sanitize: (message: KenshoMessage): KenshoMessage => {
        return {
            ...message,
            messageId: sanitizeString(message.messageId),
            payload: validatePayload(message.payload)
        };
    }
};
