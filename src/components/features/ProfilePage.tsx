import { useState } from "react";
import { CheckCircle2, Clock3, History, LogOut } from "lucide-react";
import { UserAvatar } from "@/components/features/UserAvatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { usePomodoroHistory } from "@/hooks/usePomodoroHistory";
import { pb } from "@/lib/pocketbase";
import { getUserDisplayName } from "@/lib/user-profile";
import type { Task } from "@/types/task";

interface ProfilePageProps {
  tasks: Task[];
  openTaskId: string | null;
  onOpenTask: (taskId: string | null) => void;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatFocusedTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${remainingSeconds}s`;
}

function formatSessionCount(count: number) {
  return `${count} ${count === 1 ? "session" : "sessions"}`;
}

export function ProfilePage({
  tasks,
  openTaskId,
  onOpenTask,
}: ProfilePageProps) {
  const record = pb.authStore.record;
  const { history, isLoading, error } = usePomodoroHistory();
  const [visibleCount, setVisibleCount] = useState(25);
  const [historyAnnouncement, setHistoryAnnouncement] = useState("");

  if (!record) return null;

  const displayName = getUserDisplayName(record);
  const email = typeof record.email === "string" ? record.email : "";
  const totalFocusedSeconds = history.reduce(
    (total, entry) => total + entry.focusedSeconds,
    0,
  );
  const completedTasks = tasks.filter((task) => task.isDone).length;
  const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));
  const openTask = tasks.find((task) => task.id === openTaskId) ?? null;

  return (
    <div className="screen-panel grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader className="items-center text-center">
            <UserAvatar className="size-20" />
            <CardTitle className="mt-2 text-xl">{displayName}</CardTitle>
            <CardDescription>{email}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-2">
            <Badge variant="secondary">Google account</Badge>
            {record.verified ? <Badge variant="outline">Verified</Badge> : null}
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => pb.authStore.clear()}
            >
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </CardFooter>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Total focus</CardDescription>
              <CardTitle className="text-2xl">
                {formatFocusedTime(totalFocusedSeconds)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Completed tasks</CardDescription>
              <CardTitle className="text-2xl">{completedTasks}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>

      <Card className="min-h-[420px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History aria-hidden="true" />
            Pomodoro history
          </CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading your completed focus sessions…"
              : formatSessionCount(history.length)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <Empty role="alert">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Clock3 />
                </EmptyMedia>
                <EmptyTitle>History unavailable</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : isLoading ? (
            <div className="flex flex-col gap-4 py-2" role="status">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
              <span className="sr-only">Loading history…</span>
            </div>
          ) : history.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Clock3 />
                </EmptyMedia>
                <EmptyTitle>No sessions yet</EmptyTitle>
                <EmptyDescription>
                  Complete a Pomodoro or save an interrupted task session and it
                  will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
            <p className="sr-only" role="status" aria-live="polite">
              {historyAnnouncement}
            </p>
            <ol className="flex flex-col">
              {history.slice(0, visibleCount).map((entry, index) => {
                const completedInFull =
                  entry.focusedSeconds >= entry.durationMinutes * 60;
                const completedDate = new Date(entry.completedAt);
                const taskTitle = entry.taskId
                  ? taskTitles.get(entry.taskId)
                  : null;

                return (
                  <li key={entry.id}>
                    {index > 0 ? <Separator /> : null}
                    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 gap-3">
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <CheckCircle2 aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          {entry.taskId && taskTitle ? (
                            <button
                              type="button"
                              className="min-h-6 rounded-sm line-clamp-2 text-left font-medium whitespace-pre-wrap break-words hover:underline"
                              onClick={() => onOpenTask(entry.taskId)}
                              aria-label={`Open task details for ${taskTitle}`}
                            >
                              {taskTitle}
                            </button>
                          ) : (
                            <p className="font-medium">Open focus session</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            <time dateTime={completedDate.toISOString()}>
                              {dateFormatter.format(completedDate)}
                            </time>
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="font-medium">
                          {formatFocusedTime(entry.focusedSeconds)}
                        </span>
                        <Badge variant={completedInFull ? "secondary" : "outline"}>
                          {completedInFull ? "Complete" : "Saved early"}
                        </Badge>
                      </div>
                    </div>
                  </li>
                );
              })}
              {visibleCount < history.length ? (
                <li className="pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const nextCount = Math.min(visibleCount + 25, history.length);
                      setVisibleCount(nextCount);
                      setHistoryAnnouncement(
                        `${nextCount - visibleCount} more sessions shown. ${nextCount} of ${history.length} sessions visible.`,
                      );
                    }}
                  >
                    Show 25 more sessions
                  </Button>
                </li>
              ) : null}
            </ol>
            </>
          )}
        </CardContent>
      </Card>

      <ResponsiveOverlay
        open={Boolean(openTask)}
        onOpenChange={(open) => !open && onOpenTask(null)}
        title="Task details"
        description="Task text from this focus session."
      >
        {openTask ? (
          <div className="flex flex-col gap-4">
            <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
              {openTask.title}
            </p>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Badge variant={openTask.isDone ? "secondary" : "outline"}>
                {openTask.isDone ? "Completed" : "Open"}
              </Badge>
              <Badge variant="outline">
                {formatFocusedTime(openTask.focusedSeconds)} focused
              </Badge>
            </div>
          </div>
        ) : null}
      </ResponsiveOverlay>
    </div>
  );
}
