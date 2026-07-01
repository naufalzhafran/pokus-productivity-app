import { useEffect, useState, useRef, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";

interface TimerProps {
  initialDurationMinutes: number;
  sessionId: string;
  onComplete?: () => void;
  onStop?: () => void;
  sessionTitle?: string;
}

export function Timer({
  initialDurationMinutes,
  sessionId,
  onComplete,
  onStop,
  sessionTitle = "Focus Session",
}: TimerProps) {
  const storageKey = `pokus_timer_${sessionId}`;

  const [timeLeft, setTimeLeft] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const {
          timeLeft: savedTime,
          lastTick,
          isActive: wasActive,
        } = JSON.parse(saved);

        if (wasActive) {
          const elapsed = Math.floor((Date.now() - lastTick) / 1000);
          return Math.max(0, savedTime - elapsed);
        }
        return savedTime;
      }
    } catch (error) {
      console.error("Failed to parse saved timer state:", error);
    }
    return initialDurationMinutes * 60;
  });

  const [isActive, setIsActive] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved).isActive;
      }
    } catch {
      // Ignore error
    }
    return true;
  });

  const [showConfirm, setShowConfirm] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        timeLeft,
        isActive,
        lastTick: Date.now(),
      }),
    );
  }, [timeLeft, isActive, storageKey]);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      // Set the target end time based on current wall clock + remaining time
      endTimeRef.current = Date.now() + timeLeft * 1000;

      intervalRef.current = setInterval(() => {
        const remaining = Math.round((endTimeRef.current! - Date.now()) / 1000);
        if (remaining <= 0) {
          setIsActive(false);
          setTimeLeft(0);
        } else {
          setTimeLeft(remaining);
        }
      }, 1000);
    } else if (timeLeft === 0 && !completedRef.current) {
      completedRef.current = true;
      localStorage.removeItem(storageKey);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (onComplete) onComplete();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, timeLeft, onComplete, storageKey]);

  const toggleTimer = () => setIsActive((active) => !active);

  const handleStopClick = () => {
    setIsActive(false);
    setShowConfirm(true);
  };

  const handleConfirmStop = () => {
    setShowConfirm(false);
    localStorage.removeItem(storageKey);
    onStop?.();
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

  useEffect(() => {
    if (isActive) {
      document.title = `${formatTime(timeLeft)} - ${sessionTitle}`;
    } else {
      document.title = "Pokus";
    }

    return () => {
      document.title = "Pokus";
    };
  }, [isActive, timeLeft, sessionTitle]);

  const totalSeconds = initialDurationMinutes * 60;
  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100;

  return (
    <div className="flex flex-col items-center space-y-12 w-full">
      <div
        className="relative flex justify-center w-full max-w-[500px] aspect-square mx-auto px-4"
        style={
          { viewTransitionName: "focus-timer-container" } as CSSProperties
        }
      >
        <CircularDurationInput
          value={timeLeft}
          max={initialDurationMinutes * 60}
          onChange={() => {}}
          size={500}
          strokeWidth={6}
          readOnly={true}
          className="w-full h-full"
        >
          <div className="font-sans font-semibold text-6xl leading-none tabular-nums text-center select-none pointer-events-none sm:text-7xl md:text-8xl lg:text-[140px]">
            {formatTime(timeLeft)}
          </div>
        </CircularDurationInput>
      </div>

      <div className="flex gap-6 z-20">
        <Button
          variant="ghost"
          size="icon"
          aria-label={isActive ? "Pause timer" : "Resume timer"}
          className="h-16 w-16 rounded-full bg-white/5 hover:bg-white/10 text-foreground"
          onClick={toggleTimer}
        >
          {isActive ? (
            <Pause className="h-7 w-7 fill-current" />
          ) : (
            <Play className="h-7 w-7 ml-1 fill-current" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Stop timer"
          className="h-16 w-16 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-foreground"
          onClick={handleStopClick}
        >
          <Square className="h-5 w-5 fill-current" />
        </Button>
      </div>

      {/* Minimalist Progress Line */}
      <div
        className="fixed bottom-0 left-0 h-px bg-blue-500/60 transition-all duration-1000 ease-linear z-20"
        style={{ width: `${progress}%` }}
      />

      <Modal
        isOpen={showConfirm}
        onClose={handleCancelStop}
        title="Stop Pomodoro?"
        description="The current countdown will be cleared and you will return to setup."
        confirmText="Stop"
        onConfirm={handleConfirmStop}
      />
    </div>
  );
}
