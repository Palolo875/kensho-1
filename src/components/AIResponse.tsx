import { useState } from "react";
import { ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, RotateCcw, Volume2, Copy, Loader2, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ThoughtStream } from "./chat/ThoughtStream";
import { MessageThinking } from "./chat/MessageThinking";
import { FactCheckingResults } from "./FactCheckingResults";
import type { ThoughtStep } from "@/agents/oie/types";

interface AIResponseProps {
  content: string;
  thinking?: string;
  statusMessage?: string;
  ocrProgress?: number;
  thoughtProcess?: ThoughtStep[];
  factCheckingClaims?: any[];
  semanticSearchResults?: any;
}

const AIResponse = ({
  content,
  thinking,
  statusMessage,
  ocrProgress,
  thoughtProcess,
  factCheckingClaims,
  semanticSearchResults
}: AIResponseProps) => {
  const [showThinking, setShowThinking] = useState(false);
  const [thinkingMode, setThinkingMode] = useState<"summary" | "detailed">("summary");

  return (
    <div className="px-4 md:px-8 py-6 group">
      <div className="max-w-4xl">
        {/* Message Thinking (Mode Simulation) */}
        {thinking && thinking !== "Kensho réfléchit..." && (
          <MessageThinking thinking={thinking} thoughtProcess={thoughtProcess} />
        )}

        {/* ThoughtStream for Debate Process (Sprint 6) */}
        {thoughtProcess && thoughtProcess.length > 0 && !thinking && (
          <div className="mb-4">
            <ThoughtStream />
          </div>
        )}

        {/* Status Message with OCR Progress */}
        {statusMessage && (
          <div className="mb-4 p-3 bg-secondary/50 rounded-lg border border-border/50 flex items-center gap-3 shadow-md">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm text-foreground">{statusMessage}</p>
              {ocrProgress !== undefined && ocrProgress >= 0 && (
                <div className="mt-2">
                  <Progress value={ocrProgress * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">{Math.round(ocrProgress * 100)}%</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Thinking Process */}
        {thinking && (
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowThinking(!showThinking)}
              className="text-thinking hover:text-foreground text-sm"
            >
              {showThinking ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Masquer la réflexion
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Voir la réflexion
                </>
              )}
            </Button>

            {showThinking && (
              <div className="mt-2 p-4 bg-muted/30 rounded-lg border border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setThinkingMode("summary")}
                    className={cn(
                      "text-xs",
                      thinkingMode === "summary" && "bg-accent"
                    )}
                  >
                    Résumé
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setThinkingMode("detailed")}
                    className={cn(
                      "text-xs",
                      thinkingMode === "detailed" && "bg-accent"
                    )}
                  >
                    Détaillé
                  </Button>
                </div>
                <p className="text-thinking text-sm font-light leading-relaxed italic">
                  {thinkingMode === "summary"
                    ? thinking.substring(0, 150) + "..."
                    : thinking}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Fact-Checking Results (Priority 6) */}
        {factCheckingClaims && factCheckingClaims.length > 0 && (
          <FactCheckingResults
            claims={factCheckingClaims}
            semanticSearchResults={semanticSearchResults}
            expanded={false}
          />
        )}

        {/* AI Response Content */}
        <div className="prose prose-sm md:prose-base max-w-none">
          <p className="text-foreground leading-relaxed whitespace-pre-wrap">
            {content}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <ThumbsDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <Volume2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIResponse;
