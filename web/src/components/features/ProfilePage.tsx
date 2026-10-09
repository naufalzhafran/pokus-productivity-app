import { memo, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Download, History, LogOut } from "lucide-react";
import { toast } from "sonner";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { FocusStats } from "@/components/features/FocusStats";
import { focusStatistics } from "@/lib/focus-stats";
import { pb } from "@/lib/pocketbase";
import { getUserDisplayName } from "@/lib/user-profile";
import type { PomodoroHistoryEntry, Task } from "@/types/task";
import { AppSettings } from "@/components/features/AppSettings";
import { clearAccountCache, type SessionOperation } from "@/lib/offline-store";
import type { SyncState } from "@/lib/session-sync";

interface ProfilePageProps {
  tasks: Task[];
  openTaskId: string | null;
  onOpenTask: (taskId: string | null) => void;
  pendingSessions?: SessionOperation[];
  syncState?: SyncState;
  onRetrySync?: () => void;
  /** Synced focus history merged with completed sessions waiting to sync, newest first. */
  history?: PomodoroHistoryEntry[];
  historyLoading?: boolean;
  historyError?: string | null;
  /** Downloads everything this browser has loaded for the account as one JSON file. */
  onExport?: () => Promise<void>;
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

const HistoryEntryRow = memo(function HistoryEntryRow({
  entry,
  index,
  taskTitle,
  onOpenTask,
}: {
  entry: PomodoroHistoryEntry;
  index: number;
  taskTitle: string | null;
  onOpenTask: (taskId: string | null) => void;
}) {
  const completedInFull = entry.focusedSeconds >= entry.durationMinutes * 60;
  const completedDate = new Date(entry.completedAt);

  return (
    <li>
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
          <span className="font-medium">{formatFocusedTime(entry.focusedSeconds)}</span>
          <Badge variant={completedInFull ? "secondary" : "outline"}>
            {completedInFull ? "Complete" : "Saved early"}
          </Badge>
        </div>
      </div>
    </li>
  );
});

export function ProfilePage({
  tasks,
  openTaskId,
  onOpenTask,
  pendingSessions = [],
  syncState,
  onRetrySync,
  history = [],
  historyLoading: isLoading = false,
  historyError: error = null,
  onExport,
}: ProfilePageProps) {
  const record = pb.authStore.record;
  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    if (!onExport) return;
    setExporting(true);
    try { await onExport(); toast.success("Your data was exported."); }
    catch { toast.error("Your data could not be exported. Try again."); }
    finally { setExporting(false); }
  };
  const [visibleCount, setVisibleCount] = useState(25);
  const [historyAnnouncement, setHistoryAnnouncement] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const signOut = async () => {
    const owner = record?.id;
    // Cached workspace data leaves this browser; unsynced sessions stay for the next sign-in.
    if (owner) await clearAccountCache(owner).catch(() => undefined);
    pb.authStore.clear();
  };

  const stats = useMemo(() => focusStatistics(history), [history]);
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.isDone).length,
    [tasks],
  );
  const taskTitles = useMemo(
    () => new Map(tasks.map((task) => [task.id, task.title])),
    [tasks],
  );
  const openTask = tasks.find((task) => task.id === openTaskId) ?? null;

  if (!record) return null;

  const displayName = getUserDisplayName(record);
  const email = typeof record.email === "string" ? record.email : "";

  return (
    <div className="screen-panel grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <UserAvatar className="size-12" />
            <CardTitle className="mt-2 text-xl break-words">{displayName}</CardTitle>
            <CardDescription>{email}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Badge variant="secondary">Google account</Badge>
            {record.verified ? <Badge variant="outline">Verified</Badge> : null}
          </CardContent>
        </Card>

        <FocusStats stats={stats} completedTasks={completedTasks} />
        <AppSettings />
        <Card><CardHeader><CardTitle>Sync & account</CardTitle><CardDescription>{pendingSessions.length ? `${pendingSessions.length} session changes saved on this device.` : "All session changes are synced."}</CardDescription></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground" role="status">{syncState?.error ?? (syncState?.syncing ? "Syncing…" : "Pending changes stay on this device until your account reconnects.")}</p></CardContent>
          <CardFooter className="flex flex-col gap-2">
            {pendingSessions.length ? <Button variant="outline" className="w-full" disabled={syncState?.syncing} onClick={onRetrySync}>Retry sync</Button> : null}
            {onExport ? <Button variant="outline" className="w-full" disabled={exporting} onClick={() => void exportData()}><Download data-icon="inline-start" />{exporting ? "Exporting…" : "Export my data"}</Button> : null}
            {pb.authStore.isValid
              ? <Button variant="ghost" className="w-full" onClick={() => setConfirmSignOut(true)}><LogOut data-icon="inline-start" />Sign out</Button>
              : <Button variant="ghost" className="w-full" onClick={() => pb.authStore.clear()}><LogOut data-icon="inline-start" />Sign in again</Button>}
          </CardFooter>
        </Card>
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
          {error && history.length === 0 ? (
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
              {history.slice(0, visibleCount).map((entry, index) => (
                <HistoryEntryRow
                  key={entry.id}
                  entry={entry}
                  index={index}
                  taskTitle={entry.taskId ? (taskTitles.get(entry.taskId) ?? null) : null}
                  onOpenTask={onOpenTask}
                />
              ))}
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

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSessions.length
                ? `${pendingSessions.length} session ${pendingSessions.length === 1 ? "change hasn't" : "changes haven't"} synced yet. ${pendingSessions.length === 1 ? "It stays" : "They stay"} on this device and will sync the next time you sign in here. Your saved workspace will be removed from this browser.`
                : "Your saved workspace will be removed from this browser. Everything is synced to your account."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void signOut()}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
