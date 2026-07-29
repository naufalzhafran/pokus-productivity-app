import type { CSSProperties } from "react";
import { ListTodo, Minus, Plus, TimerReset } from "lucide-react";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { SessionTask } from "@/components/features/SessionTask";
import { Timer, type TimerStopOptions } from "@/components/features/timer";
import { TimerCompletion } from "@/components/features/TimerCompletion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PomodoroSession, Task } from "@/types/task";

const PRESETS = [15, 25, 45, 60];

function formatDuration(minutes: number) {
  return `${minutes.toString().padStart(2, "0")}:00`;
}

function summarizeTitle(title: string) {
  const oneLine = title.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine;
}

function ClockDigits({ value }: { value: string }) {
  return (
    <div className="clock-digits flex justify-center" aria-label={value}>
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

interface TimerPageProps {
  session: PomodoroSession | null;
  sessionTask: Task | null;
  selectedTask: Task | null;
  duration: number;
  remainingSeconds: number;
  onDurationChange: (duration: number) => void;
  onStart: () => void;
  onToggle: () => void;
  onStop: (options: TimerStopOptions) => void;
  onChooseTask: () => void;
  onMarkTaskDone: () => Promise<void>;
  onFocusAgain: () => void;
  onViewTasks: () => void;
}

export function TimerPage({
  session,
  sessionTask,
  selectedTask,
  duration,
  remainingSeconds,
  onDurationChange,
  onStart,
  onToggle,
  onStop,
  onChooseTask,
  onMarkTaskDone,
  onFocusAgain,
  onViewTasks,
}: TimerPageProps) {
  if (session?.mode === "running") {
    return (
      <div className="screen-panel mx-auto w-full max-w-3xl text-center">
        <div className="mb-5">
          <p className="text-sm uppercase text-muted-foreground">
            Focus session · {session.durationMinutes} minutes
          </p>
          {sessionTask ? (
            <div className="mt-3"><SessionTask title={sessionTask.title} /></div>
          ) : (
            <h2 className="mt-3 text-xl font-semibold">Open focus session</h2>
          )}
        </div>
        <Timer
          durationMinutes={session.durationMinutes}
          remainingSeconds={remainingSeconds}
          isActive={session.isActive}
          sessionTitle={
            (sessionTask ? summarizeTitle(sessionTask.title) : null) ??
            `${session.durationMinutes}-minute Pomodoro`
          }
          taskTitle={sessionTask?.title}
          onToggle={onToggle}
          onStop={onStop}
        />
      </div>
    );
  }

  return (
    <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="screen-panel flex justify-center">
        <div
          className="timer-shell setup-dial relative flex aspect-square w-[min(88vw,58dvh,560px)] justify-center"
          style={{ viewTransitionName: "focus-timer-container" } as CSSProperties}
        >
          <CircularDurationInput
            value={duration}
            onChange={onDurationChange}
            min={1}
            max={60}
            size={560}
            strokeWidth={12}
            className="size-full"
            ariaLabel="Pomodoro duration in minutes"
            ariaValueText={`${duration} ${duration === 1 ? "minute" : "minutes"}`}
          >
            <ClockDigits value={formatDuration(duration)} />
          </CircularDurationInput>
        </div>
      </div>

      <div className="screen-panel mx-auto flex w-full max-w-sm flex-col gap-4 lg:mx-0">
        {session?.mode === "complete" ? (
          <TimerCompletion
            durationMinutes={session.durationMinutes}
            taskTitle={sessionTask?.title}
            onMarkTaskDone={sessionTask ? onMarkTaskDone : undefined}
            onFocusAgain={onFocusAgain}
            onViewTasks={onViewTasks}
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Set up your session</CardTitle>
                <CardDescription>
                  Choose a duration, then start deliberately when ready.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedTask ? (
                  <SessionTask title={selectedTask.title} />
                ) : (
                  <p className="text-sm font-medium">Open focus session</p>
                )}
              </CardContent>
              <CardFooter>
                <Button type="button" variant="outline" onClick={onChooseTask}>
                  <ListTodo data-icon="inline-start" />
                  {selectedTask ? "Change task" : "Choose a task"}
                </Button>
              </CardFooter>
            </Card>
            <div className="flex items-center justify-center gap-3">
              <Button type="button" variant="outline" size="icon" aria-label="Decrease duration" onClick={() => onDurationChange(duration - 1)}>
                <Minus />
              </Button>
              <span className="min-w-20 text-center text-sm font-medium">{duration} minutes</span>
              <Button type="button" variant="outline" size="icon" aria-label="Increase duration" onClick={() => onDurationChange(duration + 1)}>
                <Plus />
              </Button>
            </div>
            <ToggleGroup
              variant="outline"
              value={[duration.toString()]}
              onValueChange={(values) => values[0] && onDurationChange(Number(values[0]))}
              aria-label="Pomodoro duration presets"
              className="grid grid-cols-4"
            >
              {PRESETS.map((preset) => (
                <ToggleGroupItem key={preset} value={preset.toString()}>{preset}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button type="button" size="lg" onClick={onStart}>
              <TimerReset data-icon="inline-start" />
              Start Pomodoro
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
