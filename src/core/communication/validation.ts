import { KenshoMessage } from './types';

/**
 * Sanitize une chaîne pour éviter les XSS
 */
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

/**
 * Valide et nettoie un payload de message
 */
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

/**
 * Validateur de messages Kensho
 */
export const payloadValidator = {
    validate: (message: KenshoMessage): boolean => {
        if (!message?.messageId || !message?.type) {
            console.warn('[Validation] Message invalide: ID ou type manquant');
            return false;
        }

        if (message.messageId.length > 1000) {
            console.warn('[Validation] messageId trop long');
            return false;
        }

        if (message.payload && typeof message.payload === 'object') {
            const payloadSize = JSON.stringify(message.payload).length;
            if (payloadSize > 10_000_000) {
                console.warn('[Validation] Payload trop volumineux:', payloadSize);
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
