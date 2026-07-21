import { useEffect, useRef, useState } from "react";
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
  taskTitle?: string;
  onMarkTaskDone?: () => Promise<unknown>;
  onFocusAgain: () => void;
  onViewTasks: () => void;
}

export function TimerCompletion({
  durationMinutes,
  taskTitle,
  onMarkTaskDone,
  onFocusAgain,
  onViewTasks,
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
    <Card className="complete-banner" aria-busy={isFinishingTask}>
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
          {durationMinutes} focused minutes recorded.
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
            disabled={isFinishingTask}
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
          variant="outline"
          onClick={onFocusAgain}
          disabled={isFinishingTask}
        >
          Focus again
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onViewTasks}
          disabled={isFinishingTask}
        >
          View tasks
        </Button>
      </CardFooter>
    </Card>
  );
}
