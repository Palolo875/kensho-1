import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ThoughtStep } from '@/agents/oie/types';

interface MessageThinkingProps {
  thinking: string;
  thoughtProcess?: ThoughtStep[];
}

export function MessageThinking({ thinking, thoughtProcess }: MessageThinkingProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMode, setShowMode] = useState<'summary' | 'detailed'>('summary');

  if (!thinking) return null;

  return (
    <div className="mb-3 group">
      {/* Collapsed State - Subtle hint */}
      {!isExpanded && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(true)}
          className="w-full justify-start text-left text-xs text-muted-foreground hover:text-foreground p-2 h-auto opacity-60 hover:opacity-100 transition-opacity"
        >
          <span className="italic font-light">💭 pensée interne...</span>
        </Button>
      )}

      {/* Expanded State - Full thinking process */}
      {isExpanded && (
        <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/40 backdrop-blur-sm">
          {/* Header with collapse button */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Processus de réflexion</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
              className="h-6 w-6 p-0"
            >
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>

          {/* Thinking steps - minimalist display */}
          {thoughtProcess && thoughtProcess.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {thoughtProcess.map((step, idx) => (
                <div
                  key={step.id}
                  className="text-xs px-2 py-1 rounded bg-secondary/40 text-muted-foreground border border-border/30"
                >
                  {idx + 1}. {step.label}
                </div>
              ))}
            </div>
          )}

          {/* Mode toggle - subtle */}
          <div className="flex gap-1 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMode('summary')}
              className={cn(
                'text-xs h-6 px-2 font-light',
                showMode === 'summary'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50'
              )}
            >
              Résumé
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMode('detailed')}
              className={cn(
                'text-xs h-6 px-2 font-light',
                showMode === 'detailed'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50'
              )}
            >
              Détaillé
            </Button>
          </div>

          {/* Thinking text - italic and subtle */}
          <div className="text-xs text-thinking leading-relaxed font-light italic opacity-80">
            {showMode === 'summary'
              ? thinking.length > 180
                ? thinking.substring(0, 180) + '…'
                : thinking
              : thinking}
          </div>
        </div>
      )}
    </div>
  );
}
