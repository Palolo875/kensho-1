import { z } from 'zod';

/**
 * Types pour les messages entre agents et l'orchestrateur
 */

// Schéma de validation avec Zod
export const AgentMessageSchema = z.discriminatedUnion('type', [
  // Messages de l'orchestrateur
  z.object({
    type: z.literal('ORCHESTRATE_TASK'),
    payload: z.object({
      tasks: z.array(z.any()),
      coordinationStrategy: z.enum(['SEQUENTIAL', 'PARALLEL']).optional()
    }),
    requestId: z.string().uuid(),
  }),
  
  z.object({
    type: z.literal('GET_ORCHESTRATOR_STATUS'),
    payload: z.object({}),
    requestId: z.string().uuid(),
  }),
  
  z.object({
    type: z.literal('REGISTER_AGENT'),
    payload: z.object({
      agentId: z.string(),
      agentType: z.string(),
      port: z.any() // MessagePort - typé plus précisément côté implémentation
    }),
    requestId: z.string().uuid(),
  }),
  
  z.object({
    type: z.literal('UNREGISTER_AGENT'),
    payload: z.object({
      agentId: z.string()
    }),
    requestId: z.string().uuid(),
  }),
  
  // Messages des agents
  z.object({
    type: z.literal('AGENT_READY'),
    payload: z.object({
      agentId: z.string(),
      agentType: z.string()
    }),
    requestId: z.string().uuid(),
  }),
  
  z.object({
    type: z.literal('AGENT_ERROR'),
    payload: z.object({
      agentId: z.string(),
      error: z.string(),
      stack: z.string().optional()
    }),
    requestId: z.string().uuid(),
  }),
  
  z.object({
    type: z.literal('AGENT_HEARTBEAT'),
    payload: z.object({
      agentId: z.string(),
      timestamp: z.number()
    }),
    requestId: z.string().uuid(),
  }),
]);

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export type AgentResponseType = 
  | 'SUCCESS'
  | 'ERROR'
  | 'TASK_COMPLETED'
  | 'ORCHESTRATOR_STATUS'
  | 'AGENT_REGISTERED';

export interface AgentResponse {
  type: AgentResponseType;
  requestId: string;
  payload?: {
    message?: string;
    stack?: string;
    results?: any[];
    strategy?: string;
    stats?: any;
    config?: any;
    agents?: any[];
  };
  timestamp: number;
}

export function createAgentResponse(
  type: AgentResponseType,
  requestId: string,
  payload?: AgentResponse['payload']
): AgentResponse {
  return {
    type,
    requestId,
    payload,
    timestamp: Date.now(),
  };
}

export function isValidAgentMessage(data: unknown): data is { type: string; payload: unknown; requestId: string } {
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

export function validateAgentMessage(data: unknown): { success: true; data: AgentMessage } | { success: false; error: string } {
  if (!isValidAgentMessage(data)) {
    return { success: false, error: 'Invalid message format: missing required fields' };
  }

  const result = AgentMessageSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMessages = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
  return { success: false, error: `Validation failed: ${errorMessages}` };
}