import { useEffect, useState, useRef, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";

interface TimerProps {
  initialDurationMinutes: number;
  sessionId: string;
  onComplete: () => void;
  onStop: (options: TimerStopOptions) => void;
  sessionTitle: string;
  taskTitle?: string;
}

export interface TimerStopOptions {
  saveElapsedTime: boolean;
  elapsedSeconds: number;
}

function formatElapsedTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${remainingSeconds}s`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function ClockDigits({ value }: { value: string }) {
  return (
    <div
      className="clock-digits timer-digits flex justify-center"
      aria-label={value}
    >
      {value.split("").map((character, index) => (
        <span
          key={`${index}-${character}`}
          className={character === ":" ? "duration-separator" : "duration-digit"}
          aria-hidden="true"
        >
          {character}
        </span>
      ))}
    </div>
  );
}

export function Timer({
  initialDurationMinutes,
  sessionId,
  onComplete,
  onStop,
  sessionTitle,
  taskTitle,
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
      onComplete();
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

  const handleConfirmStop = (saveElapsedTime: boolean) => {
    setShowConfirm(false);
    localStorage.removeItem(storageKey);
    onStop({
      saveElapsedTime,
      elapsedSeconds: Math.max(0, initialDurationMinutes * 60 - timeLeft),
    });
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

  const isUrgent = timeLeft <= 60;
  const isFinalCountdown = timeLeft <= 10;

  return (
    <div
      className="timer-stage flex w-full flex-col items-center gap-12"
      data-active={isActive}
      data-urgent={isUrgent}
      data-final={isFinalCountdown}
    >
      <div
        className="timer-shell relative mx-auto flex aspect-square w-full max-w-[540px] justify-center"
        style={
          { viewTransitionName: "focus-timer-container" } as CSSProperties
        }
      >
        <CircularDurationInput
          value={timeLeft}
          max={initialDurationMinutes * 60}
          onChange={() => {}}
          size={540}
          strokeWidth={12}
          readOnly={true}
          className="size-full"
        >
          <ClockDigits value={formatTime(timeLeft)} />
        </CircularDurationInput>
      </div>

      <div className="flex gap-4">
        <Button
          variant="secondary"
          size="icon"
          aria-label={isActive ? "Pause timer" : "Resume timer"}
          className="size-14 rounded-full"
          onClick={toggleTimer}
        >
          {isActive ? (
            <Pause className="fill-current" />
          ) : (
            <Play className="fill-current" />
          )}
        </Button>

        <Button
          variant="destructive"
          size="icon"
          aria-label="Stop timer"
          className="size-14 rounded-full"
          onClick={handleStopClick}
        >
          <Square className="fill-current" />
        </Button>
      </div>

      <AlertDialog
        open={showConfirm}
        onOpenChange={(open) => !open && handleCancelStop()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Pomodoro?</AlertDialogTitle>
            <AlertDialogDescription>
              {taskTitle
                ? `You focused for ${formatElapsedTime(Math.max(0, initialDurationMinutes * 60 - timeLeft))}. Save this time to “${taskTitle}” or discard it?`
                : "The current countdown will be cleared and you will return to setup."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelStop}>
              {taskTitle ? "Continue" : "Cancel"}
            </AlertDialogCancel>
            {taskTitle ? (
              <AlertDialogAction
                variant="destructive"
                onClick={() => handleConfirmStop(false)}
              >
                Discard
              </AlertDialogAction>
            ) : null}
            <AlertDialogAction
              variant={taskTitle ? "default" : "destructive"}
              onClick={() => handleConfirmStop(Boolean(taskTitle))}
            >
              {taskTitle ? "Save time" : "Stop"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
