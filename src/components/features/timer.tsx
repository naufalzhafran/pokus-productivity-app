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
  initialRemainingSeconds: number;
  initialIsActive: boolean;
  initialLastTick: number;
  onComplete: () => void;
  onStop: (options: TimerStopOptions) => void;
  onStateChange: (state: TimerState) => void;
  sessionTitle: string;
  taskTitle?: string;
}

export interface TimerStopOptions {
  saveElapsedTime: boolean;
  elapsedSeconds: number;
}

export interface TimerState {
  remainingSeconds: number;
  isActive: boolean;
  lastTick: number;
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
  initialRemainingSeconds,
  initialIsActive,
  initialLastTick,
  onComplete,
  onStop,
  onStateChange,
  sessionTitle,
  taskTitle,
}: TimerProps) {
  const [restoredState] = useState(() => {
    const elapsedSeconds = initialIsActive
      ? Math.max(0, Math.floor((Date.now() - initialLastTick) / 1000))
      : 0;

    return {
      timeLeft: Math.max(0, initialRemainingSeconds - elapsedSeconds),
      isActive: initialIsActive,
    };
  });
  const [timeLeft, setTimeLeft] = useState(restoredState.timeLeft);
  const [isActive, setIsActive] = useState(restoredState.isActive);

  const [showConfirm, setShowConfirm] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const completedRef = useRef(false);

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
      if (intervalRef.current) clearInterval(intervalRef.current);
      onComplete();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, timeLeft, onComplete]);

  const toggleTimer = () => {
    const nextIsActive = !isActive;
    const lastTick = Date.now();
    setIsActive(nextIsActive);
    onStateChange({
      remainingSeconds: timeLeft,
      isActive: nextIsActive,
      lastTick,
    });
  };

  const handleStopClick = () => {
    setIsActive(false);
    setShowConfirm(true);
    onStateChange({
      remainingSeconds: timeLeft,
      isActive: false,
      lastTick: Date.now(),
    });
  };

  const handleConfirmStop = (saveElapsedTime: boolean) => {
    setShowConfirm(false);
    onStop({
      saveElapsedTime,
      elapsedSeconds: Math.max(0, initialDurationMinutes * 60 - timeLeft),
    });
  };

  const handleCancelStop = () => {
    setShowConfirm(false);
    setIsActive(true);
    onStateChange({
      remainingSeconds: timeLeft,
      isActive: true,
      lastTick: Date.now(),
    });
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

      <div className="flex flex-wrap justify-center gap-3">
        <Button
          variant="secondary"
          size="lg"
          className="rounded-full px-6"
          onClick={toggleTimer}
        >
          {isActive ? (
            <Pause data-icon="inline-start" className="fill-current" />
          ) : (
            <Play data-icon="inline-start" className="fill-current" />
          )}
          {isActive ? "Pause" : "Resume"}
        </Button>

        <Button
          variant="destructive"
          size="lg"
          className="rounded-full px-6"
          onClick={handleStopClick}
        >
          <Square data-icon="inline-start" className="fill-current" />
          Stop
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
