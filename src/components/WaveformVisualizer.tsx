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
      setTime((t) => (t + 2) % 360); // Faster animation
    });
    return () => cancelAnimationFrame(animationId);
  }, []);

  const generateWave = (offset: number, frequency: number, phaseShift: number) => {
    const points: [number, number][] = [];
    const amplitude = (audioLevel + 0.2) * (20 + intensity * 10);
    
    for (let x = 0; x <= 200; x += 2) {
      const wave = Math.sin((x / frequency) + (time + phaseShift) * 0.05) * amplitude;
      const y = 100 + wave + offset;
      points.push([x, Math.max(20, Math.min(180, y))]);
    }
    
    return points.map(p => `${p[0]},${p[1]}`).join(" ");
  };

  const wave1 = generateWave(0, 15 + audioLevel * 5, 0);
  const wave2 = generateWave(-10, 20 + audioLevel * 4, Math.PI);
  const wave3 = generateWave(10, 25 + audioLevel * 3, Math.PI * 2);

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 w-full", className)}>
      {/* Large animated waveform visualization */}
      <div className="relative w-full h-48 flex items-center justify-center">
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 200"
          preserveAspectRatio="none"
          className="absolute inset-0"
        >
          <defs>
            {/* Gradient 1 */}
            <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity={0.6 + audioLevel * 0.4} />
              <stop offset="50%" stopColor="rgb(99, 102, 241)" stopOpacity={0.7} />
              <stop offset="100%" stopColor="rgb(139, 92, 246)" stopOpacity={0.5 + audioLevel * 0.4} />
            </linearGradient>

            {/* Gradient 2 */}
            <linearGradient id="waveGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgb(139, 92, 246)" stopOpacity={0.5 + audioLevel * 0.3} />
              <stop offset="50%" stopColor="rgb(168, 85, 247)" stopOpacity={0.6} />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity={0.5 + audioLevel * 0.3} />
            </linearGradient>

            {/* Gradient 3 */}
            <linearGradient id="waveGrad3" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity={0.4 + audioLevel * 0.3} />
              <stop offset="50%" stopColor="rgb(59, 130, 246)" stopOpacity={0.6} />
              <stop offset="100%" stopColor="rgb(139, 92, 246)" stopOpacity={0.4 + audioLevel * 0.3} />
            </linearGradient>

            {/* Blur filter for glow effect */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background grid */}
          <rect width="200" height="200" fill="transparent" opacity="0.02" />

          {/* Wave layer 3 (back) */}
          <polyline
            points={wave3}
            fill="none"
            stroke="url(#waveGrad3)"
            strokeWidth={1.5 + audioLevel * 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.3 + audioLevel * 0.2}
            filter="url(#glow)"
            className="transition-opacity duration-100"
          />

          {/* Wave layer 2 (middle) */}
          <polyline
            points={wave2}
            fill="none"
            stroke="url(#waveGrad2)"
            strokeWidth={2 + audioLevel * 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.5 + audioLevel * 0.3}
            filter="url(#glow)"
            className="transition-opacity duration-100"
          />

          {/* Wave layer 1 (front) */}
          <polyline
            points={wave1}
            fill="none"
            stroke="url(#waveGrad1)"
            strokeWidth={2.5 + audioLevel * 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.7 + audioLevel * 0.3}
            filter="url(#glow)"
            className="transition-opacity duration-100"
          />

          {/* Center vertical line */}
          <line
            x1="100"
            y1="0"
            x2="100"
            y2="200"
            stroke="url(#waveGrad1)"
            strokeWidth={1}
            opacity={0.2 + audioLevel * 0.1}
            strokeDasharray="5,5"
          />
        </svg>
      </div>

      {/* Intensity meter with pulsing effects */}
      <div className="flex items-center justify-center gap-6">
        {/* Pulse indicators */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: `${12 + audioLevel * 20}px`,
              height: `${12 + audioLevel * 20}px`,
              backgroundColor: `rgba(59, 130, 246, ${0.1 + audioLevel * 0.3 - i * 0.1})`,
              border: `2px solid rgba(99, 102, 241, ${0.3 + audioLevel * 0.4})`,
              animation: `pulse ${0.6 + i * 0.1}s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}

        {/* Center intensity display */}
        <div
          className="flex flex-col items-center justify-center rounded-full font-bold transition-all duration-100"
          style={{
            width: `${60 + audioLevel * 20}px`,
            height: `${60 + audioLevel * 20}px`,
            background: `radial-gradient(circle, rgba(59, 130, 246, ${0.2 + audioLevel * 0.3}), rgba(139, 92, 246, ${0.1 + audioLevel * 0.2}))`,
            border: `3px solid rgba(99, 102, 241, ${0.4 + audioLevel * 0.4})`,
            boxShadow: `0 0 ${12 + audioLevel * 20}px rgba(59, 130, 246, ${audioLevel * 0.5}), inset 0 0 ${8 + audioLevel * 10}px rgba(139, 92, 246, ${audioLevel * 0.3})`,
          }}
        >
          <span
            className="text-center transition-all duration-100"
            style={{
              fontSize: `${12 + audioLevel * 8}px`,
              color: `rgba(59, 130, 246, ${0.7 + audioLevel * 0.3})`,
              textShadow: `0 0 ${4 + audioLevel * 8}px rgba(59, 130, 246, 0.5)`,
            }}
          >
            {Math.round(audioLevel * 100)}
          </span>
        </div>

        {/* Pulse indicators (mirrored) */}
        {[2, 1, 0].map((i) => (
          <div
            key={`r${i}`}
            className="rounded-full"
            style={{
              width: `${12 + audioLevel * 20}px`,
              height: `${12 + audioLevel * 20}px`,
              backgroundColor: `rgba(139, 92, 246, ${0.1 + audioLevel * 0.3 - i * 0.1})`,
              border: `2px solid rgba(99, 102, 241, ${0.3 + audioLevel * 0.4})`,
              animation: `pulse ${0.6 + i * 0.1}s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
