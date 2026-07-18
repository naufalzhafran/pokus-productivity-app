import { useEffect, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";

interface TimerProps {
  durationMinutes: number;
  remainingSeconds: number;
  isActive: boolean;
  onToggle: () => void;
  onStop: (options: TimerStopOptions) => void;
  sessionTitle: string;
  taskTitle?: string;
}

export interface TimerStopOptions {
  saveElapsedTime: boolean;
  elapsedSeconds: number;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder
    .toString()
    .padStart(2, "0")}`;
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function ClockDigits({ value }: { value: string }) {
  return (
    <div className="clock-digits timer-digits flex justify-center" aria-label={value}>
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
  durationMinutes,
  remainingSeconds,
  isActive,
  onToggle,
  onStop,
  sessionTitle,
  taskTitle,
}: TimerProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const elapsedSeconds = Math.max(
    0,
    durationMinutes * 60 - remainingSeconds,
  );
  const conciseTitle =
    taskTitle && taskTitle.length > 100
      ? `${taskTitle.slice(0, 97).replace(/\s+/g, " ")}…`
      : taskTitle?.replace(/\s+/g, " ");

  useEffect(() => {
    document.title = isActive
      ? `${formatTime(remainingSeconds)} - ${sessionTitle}`
      : "Pokus";
    return () => {
      document.title = "Pokus";
    };
  }, [isActive, remainingSeconds, sessionTitle]);

  return (
    <div
      className="timer-stage flex w-full flex-col items-center gap-6 md:gap-10"
      data-active={isActive}
      data-urgent={remainingSeconds <= 60}
      data-final={remainingSeconds <= 10}
    >
      <p className="sr-only" role="status" aria-live="polite">
        Timer {isActive ? "running" : "paused"}
      </p>
      <div className="timer-shell relative mx-auto flex aspect-square w-[min(78vw,54dvh,540px)] justify-center">
        <CircularDurationInput
          value={remainingSeconds}
          max={durationMinutes * 60}
          onChange={() => undefined}
          size={540}
          strokeWidth={12}
          readOnly
          className="size-full"
        >
          <ClockDigits value={formatTime(remainingSeconds)} />
        </CircularDurationInput>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="min-h-11 rounded-full px-6"
          onClick={onToggle}
        >
          {isActive ? (
            <Pause data-icon="inline-start" className="fill-current" />
          ) : (
            <Play data-icon="inline-start" className="fill-current" />
          )}
          {isActive ? "Pause" : "Resume"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          className="min-h-11 rounded-full px-6"
          onClick={() => setShowConfirm(true)}
        >
          <Square data-icon="inline-start" className="fill-current" />
          Stop
        </Button>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Pomodoro?</AlertDialogTitle>
            <AlertDialogDescription>
              {conciseTitle
                ? `You focused for ${formatElapsed(elapsedSeconds)} on ${conciseTitle}. Save this time or discard it?`
                : "The countdown will be cleared."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue</AlertDialogCancel>
            {taskTitle ? (
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  onStop({ saveElapsedTime: false, elapsedSeconds })
                }
              >
                Discard
              </AlertDialogAction>
            ) : null}
            <AlertDialogAction
              variant={taskTitle ? "default" : "destructive"}
              onClick={() =>
                onStop({
                  saveElapsedTime: Boolean(taskTitle),
                  elapsedSeconds,
                })
              }
            >
              {taskTitle ? "Save time" : "Stop"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
