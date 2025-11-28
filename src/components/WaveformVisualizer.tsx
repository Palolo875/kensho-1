import { useMemo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface WaveformVisualizerProps {
  audioLevel: number;
  intensity?: number;
  className?: string;
}

export function WaveformVisualizer({ audioLevel, intensity = 1, className }: WaveformVisualizerProps) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    const animationId = requestAnimationFrame(() => {
      setTime((t) => (t + 1) % 360);
    });
    return () => cancelAnimationFrame(animationId);
  }, []);

  const waves = useMemo(() => {
    const frequency = audioLevel * 8 + 2;
    const amplitude = audioLevel * 15 + 5;
    const points: string[] = [];

    for (let x = 0; x <= 100; x += 2) {
      const y = 50 + Math.sin((x + time) / frequency) * amplitude * Math.sqrt(audioLevel + 0.1);
      points.push(`${x},${y}`);
    }

    return points.join(" ");
  }, [audioLevel, time]);

  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {/* Left wave */}
      <svg width="40" height="80" viewBox="0 0 100 100" className="opacity-80">
        <polyline
          points={waves}
          fill="none"
          stroke="url(#grad1)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8 + audioLevel * 0.2}
        />
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity={0.6} />
            <stop offset="100%" stopColor="rgb(139, 92, 246)" stopOpacity={0.4} />
          </linearGradient>
        </defs>
      </svg>

      {/* Center circle with intensity */}
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-100",
            "relative overflow-hidden"
          )}
          style={{
            borderColor: `rgba(59, 130, 246, ${0.3 + audioLevel * 0.7})`,
            boxShadow: `0 0 ${8 + audioLevel * 12}px rgba(59, 130, 246, ${audioLevel * 0.5})`,
          }}
        >
          <div
            className="absolute inset-0 rounded-full opacity-30"
            style={{
              background: `radial-gradient(circle, rgba(139, 92, 246, ${audioLevel * 0.4}), transparent)`,
              animation: `pulse ${0.5 + audioLevel}s ease-in-out infinite`,
            }}
          />
          <span className="relative text-xs font-bold text-blue-400">
            {Math.round(audioLevel * 100)}
          </span>
        </div>
      </div>

      {/* Right wave (mirrored) */}
      <svg width="40" height="80" viewBox="0 0 100 100" className="opacity-80 scale-x-[-1]">
        <polyline
          points={waves}
          fill="none"
          stroke="url(#grad2)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8 + audioLevel * 0.2}
        />
        <defs>
          <linearGradient id="grad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgb(139, 92, 246)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity={0.6} />
          </linearGradient>
        </defs>
      </svg>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.3); opacity: 0.1; }
        }
      `}</style>
    </div>
  );
}
