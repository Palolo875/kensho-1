/**
 * SSEStreamer.ts - DEPRECATED
 * 
 * ⚠️ DEPRECATED: Utiliser eventBus depuis EventBus.ts à la place
 * 
 * Ce fichier existe uniquement pour la compatibilité rétroactive.
 * L'implémentation réelle s'est déplacée vers EventBus.ts avec une architecture
 * production-ready complète (type safety, cleanup, wildcard, debug tools, etc.)
 * 
 * Migration:
 * - import { sseStreamer } from '../streaming/SSEStreamer' → from '../streaming/EventBus'
 * - sseStreamer.streamToken('text') → eventBus.streamToken('text')
 * - sseStreamer.on('stream-event', cb) → eventBus.on('TOKEN', cb)
 */

export { sseStreamer, eventBus, type StreamEvent, type EventMap, type EventType, type Listener } from './EventBus';
