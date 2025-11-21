// src/core/communication/validation/PayloadValidator.ts
import { z } from 'zod';
import { KenshoMessage } from '../types';
import * as schemas from './schemas';

/**
 * Validates message payloads using Zod schemas.
 * Tracks validation statistics for monitoring.
 */
export class PayloadValidator {
    private stats = {
        validated: 0,
        rejected: 0,
        errors: new Map<string, number>(),
        lastReset: Date.now(),
    };

    /**
     * Validates a message against the base Kensho message schema.
     * Returns true if valid, false otherwise.
     */
    validate(message: unknown): message is KenshoMessage {
        try {
            schemas.KenshoMessageSchema.parse(message);
            this.stats.validated++;
            return true;
        } catch (error) {
            this.handleValidationError(error);
            return false;
        }
    }

    /**
     * Validates a request message.
     */
    validateRequest(message: unknown): boolean {
        try {
            schemas.RequestMessageSchema.parse(message);
            this.stats.validated++;
            return true;
        } catch (error) {
            this.handleValidationError(error);
            return false;
        }
    }

    /**
     * Validates a stream request message.
     */
    validateStreamRequest(message: unknown): boolean {
        try {
            schemas.StreamRequestMessageSchema.parse(message);
            this.stats.validated++;
            return true;
        } catch (error) {
            this.handleValidationError(error);
            return false;
        }
    }

    /**
     * Validates a response message.
     */
    validateResponse(message: unknown): boolean {
        try {
            schemas.ResponseMessageSchema.parse(message);
            this.stats.validated++;
            return true;
        } catch (error) {
            this.handleValidationError(error);
            return false;
        }
    }

    /**
     * Validates a stream chunk message.
     */
    validateStreamChunk(message: unknown): boolean {
        try {
            schemas.StreamChunkSchema.parse(message);
            this.stats.validated++;
            return true;
        } catch (error) {
            this.handleValidationError(error);
            return false;
        }
    }

    /**
     * Validates a stream end message.
     */
    validateStreamEnd(message: unknown): boolean {
        try {
            schemas.StreamEndSchema.parse(message);
            this.stats.validated++;
            return true;
        } catch (error) {
            this.handleValidationError(error);
            return false;
        }
    }

    /**
     * Validates a stream error message.
     */
    validateStreamError(message: unknown): boolean {
        try {
            schemas.StreamErrorSchema.parse(message);
            this.stats.validated++;
            return true;
        } catch (error) {
            this.handleValidationError(error);
            return false;
        }
    }

    /**
     * Validates a broadcast message.
     */
    validateBroadcast(message: unknown): boolean {
        try {
            schemas.BroadcastMessageSchema.parse(message);
            this.stats.validated++;
            return true;
        } catch (error) {
            this.handleValidationError(error);
            return false;
        }
    }

    /**
     * Handles validation errors by tracking them.
     */
    private handleValidationError(error: unknown): void {
        this.stats.rejected++;

        if (error instanceof z.ZodError) {
            const firstError = error.errors[0];
            const errorKey = firstError?.path.join('.') || 'unknown';
            const errorMessage = firstError?.message || 'unknown error';
            const fullKey = `${errorKey}: ${errorMessage}`;

            this.stats.errors.set(
                fullKey,
                (this.stats.errors.get(fullKey) || 0) + 1
            );

            console.warn('[PayloadValidator] Validation failed:', {
                path: errorKey,
                message: errorMessage,
                errors: error.errors,
            });
        } else {
            console.warn('[PayloadValidator] Unknown validation error:', error);
        }
    }

    /**
     * Returns validation statistics.
     */
    getStats() {
        const total = this.stats.validated + this.stats.rejected;
        const uptime = Date.now() - this.stats.lastReset;

        return {
            validated: this.stats.validated,
            rejected: this.stats.rejected,
            total,
            rejectionRate: total > 0 ? this.stats.rejected / total : 0,
            validationRate: total > 0 ? this.stats.validated / total : 0,
            errors: Array.from(this.stats.errors.entries())
                .map(([error, count]) => ({ error, count }))
                .sort((a, b) => b.count - a.count), // Sort by frequency
            uptime,
            messagesPerSecond: uptime > 0 ? (total / uptime) * 1000 : 0,
        };
    }

    /**
     * Resets statistics.
     */
    resetStats(): void {
        this.stats = {
            validated: 0,
            rejected: 0,
            errors: new Map(),
            lastReset: Date.now(),
        };
    }

    /**
     * Checks if rejection rate is above a threshold (for alerting).
     */
    hasHighRejectionRate(threshold = 0.1): boolean {
        const stats = this.getStats();
        return stats.rejectionRate > threshold;
    }
}

// Singleton instance for global usage
export const payloadValidator = new PayloadValidator();
