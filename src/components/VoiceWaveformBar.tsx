import { useEffect, useRef } from "react";

interface VoiceWaveformBarProps {
  samples: number[];
}

const VoiceWaveformBar = ({ samples }: VoiceWaveformBarProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { offsetWidth: w, offsetHeight: h } = canvas;
    const width = w * dpr;
    const height = h * dpr;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Use current color from CSS (set via parent style/class)
    const color = getComputedStyle(canvas).color || "rgba(0,0,0,0.6)";
    ctx.fillStyle = color;

    // Compute bars
    const barWidth = 3; // px
    const gap = 1; // px
    const maxBars = Math.floor(w / (barWidth + gap));
    const visible = samples.slice(-maxBars);
    const baseY = h / 2;

    visible.forEach((lvl, i) => {
      const x = i * (barWidth + gap);
      const amp = Math.max(2, (h * 0.9 * Math.min(1, Math.max(0, lvl))) / 2);
      const y = baseY - amp;
      const rectH = amp * 2;
      ctx.fillRect(x, y, barWidth, rectH);
    });
  }, [samples]);

  return (
    <div
      className="absolute inset-0 pointer-events-none z-0"
      style={{ color: "hsl(var(--recording-active) / 0.6)" }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default VoiceWaveformBar;
