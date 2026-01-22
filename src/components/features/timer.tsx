import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";

interface TimerProps {
  initialDurationMinutes: number;
  sessionId: string;
  onComplete?: () => void;
  onExit?: () => void;
  onStop?: () => void;
  sessionTitle?: string;
}

export function Timer({
  initialDurationMinutes,
  sessionId,
  onComplete,
  onExit,
  onStop,
  sessionTitle = "Focus Session",
}: TimerProps) {
  const storageKey = `pokus_timer_${sessionId}`;

  // Initialize state with default props (server-safe)
  const [timeLeft, setTimeLeft] = useState(initialDurationMinutes * 60);
  const [isActive, setIsActive] = useState(true); // Default to auto-start
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage only on client mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const {
        timeLeft: savedTime,
        lastTick,
        isActive: wasActive,
      } = JSON.parse(saved);

      let newTimeLeft = savedTime;
      if (wasActive) {
        const now = Date.now();
        const elapsed = Math.floor((now - lastTick) / 1000);
        newTimeLeft = Math.max(0, savedTime - elapsed);
      }

      setTimeLeft(newTimeLeft);
      setIsActive(wasActive);
    }
    setIsHydrated(true);
  }, [storageKey]);

  const [showConfirm, setShowConfirm] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // Persist state whenever relevant values change
  useEffect(() => {
    if (!isHydrated) return;

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        timeLeft,
        isActive,
        lastTick: Date.now(),
      }),
    );
  }, [timeLeft, isActive, storageKey, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    if (isActive && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev: number) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      // Completed
      setIsActive(false);
      localStorage.removeItem(storageKey);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (onComplete) onComplete();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, timeLeft, onComplete, storageKey, isHydrated]);

  const toggleTimer = () => setIsActive(!isActive);

  const handleStopClick = () => {
    setIsActive(false);
    setShowConfirm(true);
  };

  const handleConfirmStop = () => {
    setShowConfirm(false);
    localStorage.removeItem(storageKey);
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

  // Calculate progress for potentially a progress bar
  const totalSeconds = initialDurationMinutes * 60;
  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100;

  return (
    <div className="flex flex-col items-center space-y-12 w-full">
      <div
        className="relative flex justify-center"
        style={
          { viewTransitionName: "focus-timer-container" } as React.CSSProperties
        }
      >
        <CircularDurationInput
          value={timeLeft}
          max={initialDurationMinutes * 60}
          onChange={() => {}}
          size={500}
          strokeWidth={15}
          readOnly={true}
        >
          <div className="font-sans font-semibold text-[100px] md:text-[140px] tracking-tight leading-none tabular-nums text-center select-none pointer-events-none">
            {formatTime(timeLeft)}
          </div>
        </CircularDurationInput>
      </div>

      <div className="flex gap-6 z-20">
        <Button
          variant="ghost"
          size="icon"
          className="h-20 w-20 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all transform hover:scale-110"
          onClick={toggleTimer}
        >
          {isActive ? (
            <Pause className="h-8 w-8 fill-current" />
          ) : (
            <Play className="h-8 w-8 ml-1 fill-current" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-20 w-20 rounded-full bg-white/10 hover:bg-red-500/80 text-white transition-all transform hover:scale-110"
          onClick={handleStopClick}
        >
          <Square className="h-6 w-6 fill-current" />
        </Button>
      </div>

      {/* Minimalist Progress Line */}
      <div
        className="fixed bottom-0 left-0 h-1 bg-cyan-400 transition-all duration-1000 ease-linear z-20"
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
