import { z } from 'zod';

export const KenshoMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('process-prompt'),
    payload: z.object({
      prompt: z.string().min(1).max(10000),
      options: z.object({
        streaming: z.boolean().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(4096).optional(),
      }).optional(),
    }),
    requestId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('cancel-task'),
    payload: z.object({
      taskId: z.string(),
    }),
    requestId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('clear-cache'),
    payload: z.object({}),
    requestId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('get-status'),
    payload: z.object({}),
    requestId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('ping'),
    payload: z.object({}),
    requestId: z.string().uuid(),
  }),
]);

export type KenshoMessage = z.infer<typeof KenshoMessageSchema>;

export type KenshoResponseType = 
  | 'processing-started'
  | 'stream-chunk'
  | 'final-response'
  | 'error'
  | 'task-cancelled'
  | 'cache-cleared'
  | 'status'
  | 'pong';

export interface KenshoResponse {
  type: KenshoResponseType;
  requestId: string;
  payload?: {
    response?: string;
    chunk?: string;
    message?: string;
    stack?: string;
    status?: {
      activeConnections: number;
      activeTasks: number;
      cacheSize: number;
      uptime: number;
    };
    progress?: number;
    tokensGenerated?: number;
  };
  timestamp: number;
}

export function createResponse(
  type: KenshoResponseType,
  requestId: string,
  payload?: KenshoResponse['payload']
): KenshoResponse {
  return {
    type,
    requestId,
    payload,
    timestamp: Date.now(),
  };
}

export function isValidMessage(data: unknown): data is { type: string; payload: unknown; requestId: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as Record<string, unknown>).type === 'string' &&
    'payload' in data &&
    'requestId' in data &&
    typeof (data as Record<string, unknown>).requestId === 'string'
  );
}

export function validateMessage(data: unknown): { success: true; data: KenshoMessage } | { success: false; error: string } {
  if (!isValidMessage(data)) {
    return { success: false, error: 'Invalid message format: missing required fields' };
  }

  const result = KenshoMessageSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMessages = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
  return { success: false, error: `Validation failed: ${errorMessages}` };
}
