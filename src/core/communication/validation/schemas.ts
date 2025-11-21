// src/core/communication/validation/schemas.ts
import { z } from 'zod';

// Worker name schema
export const WorkerNameSchema = z.string().min(1).max(100);

// Base Kensho message schema
export const KenshoMessageSchema = z.object({
    messageId: z.string().min(1),
    type: z.enum(['request', 'response', 'stream_request', 'stream_chunk', 'stream_end', 'stream_error', 'broadcast']),
    sourceWorker: WorkerNameSchema,
    targetWorker: WorkerNameSchema,
    payload: z.unknown(),
    timestamp: z.number().int().positive().optional(),
    traceId: z.string().optional(),
    streamId: z.string().optional(),
});

// Request message
export const RequestMessageSchema = KenshoMessageSchema.extend({
    type: z.literal('request'),
});

// Stream request message  
export const StreamRequestMessageSchema = KenshoMessageSchema.extend({
    type: z.literal('stream_request'),
    streamId: z.string().min(1),
});

// Response message
export const ResponseMessageSchema = KenshoMessageSchema.extend({
    type: z.literal('response'),
    error: z.object({
        message: z.string(),
        name: z.string(),
        stack: z.string().optional(),
    }).optional(),
});

// Stream chunk
export const StreamChunkSchema = KenshoMessageSchema.extend({
    type: z.literal('stream_chunk'),
    streamId: z.string().min(1),
});

// Stream end
export const StreamEndSchema = KenshoMessageSchema.extend({
    type: z.literal('stream_end'),
    streamId: z.string().min(1),
});

// Stream error
export const StreamErrorSchema = KenshoMessageSchema.extend({
    type: z.literal('stream_error'),
    streamId: z.string().min(1),
    error: z.object({
        message: z.string(),
        name: z.string(),
        stack: z.string().optional(),
    }),
});

// Broadcast message
export const BroadcastMessageSchema = KenshoMessageSchema.extend({
    type: z.literal('broadcast'),
});

// Type guards
export type ValidatedMessage = z.infer<typeof KenshoMessageSchema>;
export type ValidatedRequest = z.infer<typeof RequestMessageSchema>;
export type ValidatedResponse = z.infer<typeof ResponseMessageSchema>;
export type ValidatedStreamChunk = z.infer<typeof StreamChunkSchema>;
