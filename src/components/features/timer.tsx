"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Play, Pause, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

interface TimerProps {
  initialDurationMinutes: number;
  onComplete?: () => void;
  onExit?: () => void;
  onStop?: () => void;
}

export function Timer({
  initialDurationMinutes,
  onComplete,
  onExit,
  onStop,
}: TimerProps) {
  const router = useRouter();
  // simple state: seconds remaining
  const [timeLeft, setTimeLeft] = useState(initialDurationMinutes * 60);
  const [isActive, setIsActive] = useState(false); // Start paused or auto-start? Let's say auto-start.
  const [showConfirm, setShowConfirm] = useState(false);

  // Ref for the interval to clear it properly
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Auto start
    setIsActive(true);
  }, []);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      // Completed
      setIsActive(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (onComplete) onComplete();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, timeLeft, onComplete]);

  const toggleTimer = () => setIsActive(!isActive);

  const handleStopClick = () => {
    setIsActive(false);
    setShowConfirm(true);
  };

  const handleConfirmStop = () => {
    setShowConfirm(false);
    if (onStop) {
      onStop();
    } else if (onExit) {
      onExit();
    }
  };

  const handleCancelStop = () => {
    setShowConfirm(false);
    setIsActive(true);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Calculate progress for potentially a progress bar
  const totalSeconds = initialDurationMinutes * 60;
  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100;

  return (
    <div className="flex flex-col items-center space-y-12 w-full">
      <div className="font-mono text-7xl sm:text-9xl md:text-[12rem] tracking-tight leading-none tabular-nums">
        {formatTime(timeLeft)}
      </div>

      <div className="flex gap-6 z-20">
        <Button
          variant="outline"
          size="icon"
          className="h-16 w-16 md:h-20 md:w-20 rounded-full border-2 border-white text-white hover:bg-white hover:text-black transition-colors"
          onClick={toggleTimer}
        >
          {isActive ? (
            <Pause className="h-8 w-8 md:h-10 md:w-10" />
          ) : (
            <Play className="h-8 w-8 md:h-10 md:w-10 ml-1" />
          )}
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="h-16 w-16 md:h-20 md:w-20 rounded-full border-2 border-white text-white hover:bg-destructive hover:border-destructive hover:text-white transition-colors"
          onClick={handleStopClick}
        >
          <Square className="h-6 w-6 md:h-8 md:w-8 fill-current" />
        </Button>
      </div>

      {/* Minimalist Progress Line */}
      <div
        className="fixed bottom-0 left-0 h-1 bg-white transition-all duration-1000 ease-linear"
        style={{ width: `${progress}%` }}
      />

      <Modal
        isOpen={showConfirm}
        onClose={handleCancelStop}
        title="Break Focus?"
        description="Are you sure you want to abandon execution? This session will be marked as abandoned."
        confirmText="Abandon"
        onConfirm={handleConfirmStop}
      />
    </div>
  );
}
