import { useState } from 'react';
import { ChevronDown, ChevronUp, Brain } from 'lucide-react';
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

  const statusIcons = {
    pending: '⏳',
    running: '⚙️',
    completed: '✅',
    failed: '❌',
  };

  return (
    <div className="mb-4 rounded-lg border border-purple-200/40 bg-gradient-to-r from-purple-50/40 to-pink-50/40 p-3 backdrop-blur-sm">
      {/* Header avec bouton de collapse */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-start text-left font-medium text-purple-700 hover:text-purple-900 p-0 mb-2"
      >
        <Brain className="h-4 w-4 mr-2 flex-shrink-0 animate-pulse" />
        <span className="text-sm">Processus de réflexion</span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 ml-auto flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 ml-auto flex-shrink-0" />
        )}
      </Button>

      {isExpanded && (
        <>
          {/* Étapes de pensée si disponibles */}
          {thoughtProcess && thoughtProcess.length > 0 && (
            <div className="mb-3 p-2 bg-white/30 rounded border border-purple-100/50">
              <div className="space-y-1">
                {thoughtProcess.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-start text-xs text-purple-700 gap-2"
                  >
                    <span className="flex-shrink-0 w-4">{statusIcons[step.status]}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{step.label}</span>
                      {step.result && (
                        <p className="text-purple-600/70 text-xs truncate">
                          {typeof step.result === 'string' ? step.result : '✓ Complété'}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Boutons Mode Résumé / Détaillé */}
          <div className="mb-2 flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMode('summary')}
              className={cn(
                'text-xs h-7 px-2',
                showMode === 'summary'
                  ? 'bg-purple-200/60 text-purple-900'
                  : 'text-purple-700 hover:bg-purple-100/50'
              )}
            >
              Résumé
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMode('detailed')}
              className={cn(
                'text-xs h-7 px-2',
                showMode === 'detailed'
                  ? 'bg-purple-200/60 text-purple-900'
                  : 'text-purple-700 hover:bg-purple-100/50'
              )}
            >
              Détaillé
            </Button>
          </div>

          {/* Contenu de la pensée */}
          <div className="text-sm text-purple-700 leading-relaxed font-light italic space-y-2 max-h-32 overflow-y-auto">
            {showMode === 'summary' ? (
              <p>
                {thinking.length > 200
                  ? thinking.substring(0, 180) + '...'
                  : thinking}
              </p>
            ) : (
              <p>{thinking}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
