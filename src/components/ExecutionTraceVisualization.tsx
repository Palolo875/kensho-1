/**
 * ExecutionTraceVisualization - Shows multi-layer execution trace
 * Priority 4: Visual debugging for multi-agent responses
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Zap, Brain, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ExecutionTrace } from '@/core/kernel';

interface ExecutionTraceVisualizationProps {
  trace: ExecutionTrace;
  expanded?: boolean;
}

const LEVEL_COLORS = {
  ROUTER: 'text-blue-600 bg-blue-50',
  KERNEL: 'text-purple-600 bg-purple-50',
  EXECUTOR: 'text-green-600 bg-green-50',
  STREAM: 'text-orange-600 bg-orange-50',
  ENGINE: 'text-red-600 bg-red-50'
};

const STATUS_ICONS = {
  start: '▶️',
  progress: '⏳',
  success: '✅',
  error: '❌',
  warning: '⚠️'
};

export const ExecutionTraceVisualization = ({ trace, expanded = false }: ExecutionTraceVisualizationProps) => {
  const [isExpanded, setIsExpanded] = useState(expanded);

  if (!trace || trace.events.length === 0) {
    return null;
  }

  const summary = trace.summary;
  const totalDuration = trace.totalDuration || 0;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">Execution Trace</h3>
              <p className="text-xs text-muted-foreground">
                {trace.events.length} events • {totalDuration.toFixed(0)}ms total
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="p-0 h-auto">
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Summary Stats */}
          <div className="grid grid-cols-5 gap-2 p-4 bg-secondary/30 border-b border-border">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Router</p>
              <p className="font-mono text-sm font-semibold">{summary.routerTime.toFixed(0)}ms</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Kernel</p>
              <p className="font-mono text-sm font-semibold">{summary.kernelTime.toFixed(0)}ms</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Executor</p>
              <p className="font-mono text-sm font-semibold">{summary.executorTime.toFixed(0)}ms</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Stream</p>
              <p className="font-mono text-sm font-semibold">{summary.streamTime.toFixed(0)}ms</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Engine</p>
              <p className="font-mono text-sm font-semibold">{summary.engineTime.toFixed(0)}ms</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
            {trace.events.map((event, idx) => (
              <div
                key={idx}
                className={cn(
                  'p-3 rounded border border-border/50 text-sm',
                  LEVEL_COLORS[event.level] || 'bg-secondary'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1">
                    <span className="text-lg leading-none">
                      {STATUS_ICONS[event.status] || '•'}
                    </span>
                    <div className="flex-1">
                      <div className="font-mono text-xs opacity-70">
                        {event.level}:{event.component}
                      </div>
                      <div className="font-medium">{event.action}</div>
                      {event.data && (
                        <div className="text-xs opacity-70 mt-1">
                          {JSON.stringify(event.data).substring(0, 100)}...
                        </div>
                      )}
                    </div>
                  </div>
                  {event.duration && (
                    <div className="text-right whitespace-nowrap">
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <Clock className="h-3 w-3" />
                        {event.duration.toFixed(0)}ms
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Error Section */}
          {trace.events.some(e => e.status === 'error') && (
            <div className="p-4 border-t border-border bg-destructive/10">
              <p className="text-sm font-semibold text-destructive mb-2">Errors Detected</p>
              {trace.events
                .filter(e => e.status === 'error')
                .map((event, idx) => (
                  <div key={idx} className="text-xs text-destructive/90 p-2 bg-destructive/5 rounded mb-1">
                    {event.component}: {event.error?.message || 'Unknown error'}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
