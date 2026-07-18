import { CalendarDays, Folder, TimerReset, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Project, Task } from "@/types/task";

interface TaskDetailProps {
  task: Task;
  project?: Project;
  canFocus: boolean;
  onEdit: () => void;
  onFocus: () => void;
  onDelete: () => void;
}

const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

function formatFocused(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return seconds ? "<1 minute" : "No focus time yet";
  if (minutes < 60) return `${minutes} minutes`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function TaskDetail({
  task,
  project,
  canFocus,
  onEdit,
  onFocus,
  onDelete,
}: TaskDetailProps) {
  return (
    <div className="flex flex-col gap-5">
      <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
        {task.title}
      </p>
      <Separator />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-4 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <Badge variant={task.isDone ? "secondary" : "outline"}>
            {task.isDone ? "Completed" : "Open"}
          </Badge>
        </dd>
        <dt className="text-muted-foreground">Project</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <Folder aria-hidden="true" />
          <span className="truncate">{project?.title ?? "Inbox"}</span>
        </dd>
        <dt className="text-muted-foreground">Focused</dt>
        <dd>{formatFocused(task.focusedSeconds)}</dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" />
          <time dateTime={new Date(task.createdAt).toISOString()}>
            {formatter.format(task.createdAt)}
          </time>
        </dd>
      </dl>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" onClick={onEdit}>
          Edit
        </Button>
        {!task.isDone ? (
          <Button
            type="button"
            variant="outline"
            onClick={onFocus}
            disabled={!canFocus}
          >
            <TimerReset data-icon="inline-start" />
            Focus
          </Button>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          className="sm:col-span-2"
          onClick={onDelete}
        >
          <Trash2 data-icon="inline-start" />
          Delete task
        </Button>
      </div>
    </div>
  );
}
