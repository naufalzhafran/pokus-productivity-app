import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { SessionTask } from "@/components/features/SessionTask";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TimerCompletionProps {
  durationMinutes: number;
  syncPending?: boolean;
  isSaving?: boolean;
  taskTitle?: string;
  onMarkTaskDone?: () => Promise<unknown>;
  onFocusAgain: () => void;
  onViewTasks: () => void;
  /** Shown below the actions, such as a knowledge note to review during the break. */
  children?: ReactNode;
}

export function TimerCompletion({
  durationMinutes,
  syncPending = false,
  isSaving = false,
  taskTitle,
  onMarkTaskDone,
  onFocusAgain,
  onViewTasks,
  children,
}: TimerCompletionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [isFinishingTask, setIsFinishingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: false });
  }, []);

  const finishTask = async () => {
    if (!onMarkTaskDone || isFinishingTask) return;
    setIsFinishingTask(true);
    setError(null);
    try {
      await onMarkTaskDone();
    } catch {
      setError("The task could not be completed. Try again or view your tasks.");
      headingRef.current?.focus();
    } finally {
      setIsFinishingTask(false);
    }
  };

  return (
    <Card className="complete-banner w-full" aria-busy={isFinishingTask || isSaving}>
      <CardHeader>
        <CardTitle>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="rounded-sm outline-none"
          >
            Session complete
          </h2>
        </CardTitle>
        <CardDescription>
          {Math.floor(durationMinutes)}m {Math.round((durationMinutes % 1) * 60)}s of focus.
          {syncPending ? " Saved on this device. Waiting to sync." : " Saved to your history."}
        </CardDescription>
      </CardHeader>
      {taskTitle ? (
        <CardContent>
          <SessionTask title={taskTitle} isComplete />
        </CardContent>
      ) : null}
      {error ? (
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        </CardContent>
      ) : null}
      <CardFooter className="grid gap-2">
        {taskTitle && onMarkTaskDone ? (
          <Button
            type="button"
            onClick={() => void finishTask()}
            disabled={isFinishingTask || isSaving}
          >
            {isFinishingTask ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <CheckCircle2 data-icon="inline-start" />
            )}
            {isFinishingTask ? "Completing task…" : "Mark done & view tasks"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="default"
          onClick={onFocusAgain}
          disabled={isFinishingTask || isSaving}
        >
          Focus again
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onViewTasks}
          disabled={isFinishingTask || isSaving}
        >
          View tasks
        </Button>
      </CardFooter>
      {children}
    </Card>
  );
}
