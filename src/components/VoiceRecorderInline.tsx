import { useState, useEffect, useRef } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceRecorderInlineProps {
  onTranscript?: (text: string) => void;
  onStop?: () => void;
  onLevel?: (level: number) => void;
}

const VoiceRecorderInline = ({ onTranscript, onStop, onLevel }: VoiceRecorderInlineProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const isRecordingRef = useRef(false);

  useEffect(() => {
    if (isRecording) {
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setDuration(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      stopAudioAnalysis();
    };
  }, [isRecording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const startAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const updateAudioLevel = () => {
        if (analyserRef.current && isRecordingRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const normalizedLevel = average / 255;
          setAudioLevel(normalizedLevel);
          onLevel?.(normalizedLevel);
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };
      
      updateAudioLevel();
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopAudioAnalysis = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  const toggleRecording = () => {
    if (!isRecording) {
      setIsRecording(true);
      isRecordingRef.current = true;
      setTranscript("");
      startAudioAnalysis();
      
      // Simulation de transcription en temps réel
      let count = 0;
      const words = ["Ceci", "est", "une", "transcription", "en", "temps", "réel", "simulée"];
      const transcriptionInterval = setInterval(() => {
        if (count < words.length) {
          setTranscript((prev) => prev + (prev ? " " : "") + words[count]);
          count++;
        }
      }, 800);

      // Arrêter après quelques secondes
      setTimeout(() => {
        clearInterval(transcriptionInterval);
      }, 7000);
    } else {
      setIsRecording(false);
      isRecordingRef.current = false;
      stopAudioAnalysis();
      if (transcript) {
        onTranscript?.(transcript);
      }
      onStop?.();
    }
  };

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Recording button with waves */}
      <div className="relative shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleRecording}
          className={cn(
            "h-10 w-10 rounded-full transition-all duration-300 relative z-10",
            isRecording
              ? "bg-recording-active hover:bg-recording-active/90 text-white"
              : "hover:bg-accent/50"
          )}
        >
          {isRecording ? (
            <Square className="h-5 w-5" fill="currentColor" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </Button>

        {/* Animated waves dynamiques basées sur l'intensité */}
        {isRecording && (
          <>
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="absolute inset-0 rounded-full bg-recording-wave transition-all duration-100"
                style={{
                  transform: `scale(${1 + (audioLevel * (index + 1) * 0.5)})`,
                  opacity: Math.max(0.05, (audioLevel * (0.4 - index * 0.08))),
                  animationDelay: `${index * 0.15}s`,
                }}
              />
            ))}
          </>
        )}
      </div>

      {/* Timer and transcript */}
      {isRecording && (
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-recording-active animate-pulse" />
            <span className="text-sm font-medium text-foreground">
              {formatDuration(duration)}
            </span>
          </div>
          {transcript && (
            <p className="text-sm text-muted-foreground truncate font-light">
              {transcript}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceRecorderInline;
