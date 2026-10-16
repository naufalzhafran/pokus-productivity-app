import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Play, Plus, RefreshCw, TimerReset } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AgendaEditor, AgendaList, type AgendaEditorState } from "@/components/features/Agenda";
import { buildCalendarItems } from "@/lib/calendar";
import { formatFocusDuration } from "@/lib/focus-stats";
import { formatHabitDay, habitDay, overallHabitProgress } from "@/lib/habits";
import { calendarHash } from "@/lib/routes";
import { planDays, planReasonLabel } from "@/lib/today-plan";
import { useAppPreferences } from "@/hooks/useAppPreferences";
import type { CaptureStore } from "@/hooks/useCaptures";
import type { useHabits } from "@/hooks/useHabits";
import type { CalendarSourceItem } from "@/types/calendar";
import type { Category, CategoryInput, PomodoroSession, Project, ProjectInput, Task, TaskInput } from "@/types/task";

interface TodayPageProps {
  projects: Project[]; tasks: Task[]; categories: Category[]; captureStore: CaptureStore; habitStore: ReturnType<typeof useHabits>;
  readOnly: boolean; loading: boolean; loadError: string | null;
  session: PomodoroSession | null; sessionTask: Task | null; selectedTask: Task | null; remainingSeconds: number;
  /** Focused seconds today, including sessions waiting to sync. */
  todaySeconds: number;
  isSaving?: boolean;
  onStartFocus: () => void;
  onOpenTimer: () => void;
  onFocusTask: (taskId: string) => void;
  canFocus: boolean;
  onTaskDone: (id: string, done: boolean) => Promise<unknown>;
  onEditTask: (id: string, input: TaskInput) => Promise<unknown>;
  onEditProject: (id: string, input: ProjectInput) => Promise<unknown>;
  onCreateTask: (input: TaskInput) => Promise<unknown>;
  onCreateCategory: (input: CategoryInput) => Promise<Category>;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="flex flex-col gap-3"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2>{action}</div>{children}</section>;
}

/** Today at a glance: focus, overdue work, today's tasks and deadlines, habits, and reminders. */
export function TodayPage({ projects, tasks, categories, captureStore, habitStore, readOnly, loading, loadError, session, sessionTask, selectedTask, remainingSeconds, todaySeconds, isSaving = false,
  onStartFocus, onOpenTimer, onFocusTask, canFocus, onTaskDone, onEditTask, onEditProject, onCreateTask, onCreateCategory }: TodayPageProps) {
  const [today, setToday] = useState(habitDay);
  const [editor, setEditor] = useState<AgendaEditorState | null>(null);
  useEffect(() => {
    const update = () => setToday(habitDay());
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  const { items, overdue } = useMemo(() => buildCalendarItems({ projects, tasks, captures: captureStore.captures, habits: habitStore.habits, startDay: today, endDay: today, today }), [projects, tasks, captureStore.captures, habitStore.habits, today]);
  const { dailyCapacity } = useAppPreferences();
  const [plan] = useMemo(() => planDays({ tasks, projects, today, days: 1, capacity: dailyCapacity }), [tasks, projects, today, dailyCapacity]);
  const planned = useMemo<CalendarSourceItem[]>(() => plan?.entries.map(({ task, project }) => ({ type: "task", id: task.id, source: task, project, title: task.title, day: today, completed: false })) ?? [], [plan, today]);
  const planNotes = useMemo(() => new Map(plan?.entries.map((entry) => [`task:${entry.task.id}`, planReasonLabel(entry, today)])), [plan, today]);
  const open = items.filter((item) => !item.completed);
  const deadlines = open.filter((item) => item.type === "project");
  const reminders = open.filter((item) => item.type === "capture");
  const habits = items.filter((item) => item.type === "habit");
  const completed = items.filter((item) => item.completed && item.type !== "habit");
  const progress = overallHabitProgress(habitStore.habits, today);
  const list = (entries: CalendarSourceItem[], notes?: ReadonlyMap<string, string>) => <AgendaList entries={entries} notes={notes} day={today} today={today} readOnly={readOnly} captureStore={captureStore} habitStore={habitStore}
    onTaskDone={onTaskDone} onEdit={setEditor} onOpenCapture={(item) => { window.location.hash = calendarHash(item.day ?? today, item.id); }} onFocus={onFocusTask} canFocus={canFocus} />;

  const focusTitle = session?.mode === "complete" ? "Pokus complete" : session ? session.isActive ? `Focusing · ${clock(remainingSeconds)} left` : `Paused · ${clock(remainingSeconds)} left` : "Focus";
  const focusDetail = session ? sessionTask?.title ?? "Open Pokus" : selectedTask ? `Next: ${selectedTask.title}` : todaySeconds ? "Keep going, one session at a time." : "No focus yet today.";

  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{formatHabitDay(today)}</p>
      <div className="flex gap-2">
        <Button variant="ghost" size="icon" aria-label="Refresh today" disabled={readOnly} onClick={() => window.dispatchEvent(new Event("pokus-workspace-refresh"))}><RefreshCw /></Button>
        <Button variant="outline" disabled={readOnly} onClick={() => setEditor({ type: "new", day: today })}><Plus data-icon="inline-start" />New task</Button>
      </div>
    </div>
    <Card className="border-primary/25 bg-primary/5">
      <CardHeader>
        <CardDescription>{formatFocusDuration(todaySeconds)} focused today</CardDescription>
        <CardTitle className="text-xl">{focusTitle}</CardTitle>
        <CardDescription className="line-clamp-2 [overflow-wrap:anywhere]">{focusDetail}</CardDescription>
        <CardAction className="flex flex-col gap-2 sm:flex-row">
          {session ? <Button onClick={onOpenTimer}><TimerReset data-icon="inline-start" />{session.mode === "complete" ? "View" : "Open timer"}</Button>
            : <><Button disabled={isSaving} onClick={onStartFocus}><Play data-icon="inline-start" />Start a Pokus</Button><a href="#timer" onClick={onOpenTimer} className={buttonVariants({ variant: "ghost" })}>Set up timer</a></>}
        </CardAction>
      </CardHeader>
    </Card>
    {loadError ?? habitStore.loadError ? <div role="status" className="rounded-xl border p-3 text-sm">{loadError ?? habitStore.loadError} Use Refresh to try again.</div> : null}
    {readOnly ? <p role="status" className="text-sm text-muted-foreground">Your saved day is available to browse. Connect and sign in to make changes.</p> : null}
    {loading || habitStore.isLoading ? <Skeleton className="h-64 w-full" /> : <>
      {overdue.length ? <Section title="Overdue">{list(overdue)}</Section> : null}
      <Section title="Today’s plan" action={plan ? <span className={plan.used > plan.capacity ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>{plan.used} of {plan.capacity} Pokus</span> : null}>
        {plan && plan.used > plan.capacity ? <p role="status" className="text-sm text-muted-foreground">More is due than fits today. Finish what you can, or move a due date.</p> : null}
        {planned.length ? list(planned, planNotes) : <p className="text-sm text-muted-foreground">Nothing planned. Tasks show up here on their due date, and bigger or higher-priority ones a few days before.</p>}
      </Section>
      {deadlines.length ? <Section title="Deadlines">{list(deadlines)}</Section> : null}
      <Section title="Habits" action={<a href="#habits" aria-label={habits.length ? `Open habits, ${progress.completed} of ${progress.total} done today` : "Add a habit"} className={buttonVariants({ variant: "ghost", size: "sm" })}>{habits.length ? `${progress.completed} of ${progress.total} done` : "Add a habit"}</a>}>
        {habits.length ? list(habits) : <p className="text-sm text-muted-foreground">Daily check-ins and numeric habits appear here.</p>}
      </Section>
      {reminders.length ? <Section title="Reminders">{list(reminders)}</Section> : null}
      {completed.length ? <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer content-center font-medium">Completed ({completed.length})</summary><div className="pt-3">{list(completed)}</div></details> : null}
    </>}
    <AgendaEditor editor={editor} onClose={() => setEditor(null)} readOnly={readOnly} tasks={tasks} projects={projects} categories={categories} onEditTask={onEditTask} onEditProject={onEditProject} onCreateTask={onCreateTask} onCreateCategory={onCreateCategory} />
  </div>;
}
