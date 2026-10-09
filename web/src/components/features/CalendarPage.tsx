import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Plus, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarMonth } from "@/components/features/CalendarMonth";
import { AgendaEditor, AgendaList, type AgendaEditorState } from "@/components/features/Agenda";
import { CapturePreview } from "@/components/features/CaptureCard";
import { CaptureReminderEditor } from "@/components/features/CaptureReminderEditor";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { buildCalendarItems, calendarMonthDays } from "@/lib/calendar";
import { formatHabitDay, habitDay } from "@/lib/habits";
import { captureDisplayTitle } from "@/lib/capture";
import type { CalendarSourceItem } from "@/types/calendar";
import type { useHabits } from "@/hooks/useHabits";
import type { CaptureStore } from "@/hooks/useCaptures";
import type { Category, CategoryInput, Project, ProjectInput, Task, TaskInput } from "@/types/task";


interface CalendarPageProps {
  projects: Project[]; tasks: Task[]; categories: Category[]; captureStore: CaptureStore;
  habitStore: ReturnType<typeof useHabits>; readOnly: boolean; loading: boolean; loadError: string | null;
  selectedDay?: string | null; captureId?: string | null;
  onSelect: (day: string, captureId?: string) => void;
  onTaskDone: (id: string, done: boolean) => Promise<unknown>;
  onEditTask: (id: string, input: TaskInput) => Promise<unknown>;
  onEditProject: (id: string, input: ProjectInput) => Promise<unknown>;
  onCreateCategory: (input: CategoryInput) => Promise<Category>;
  /** Adds a task, here dated on the selected day. */
  onCreateTask?: (input: TaskInput) => Promise<unknown>;
  onFocusTask?: (taskId: string) => void;
  canFocus?: boolean;
}

function CalendarEmpty({ title, description }: { title: string; description: string }) {
  return <Empty><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>;
}

export function CalendarPage({ projects, tasks, categories, captureStore, habitStore, readOnly, loading, loadError, selectedDay, captureId, onSelect, onTaskDone, onEditTask, onEditProject, onCreateCategory, onCreateTask, onFocusTask, canFocus = false }: CalendarPageProps) {
  const [today, setToday] = useState(habitDay);
  const [editor, setEditor] = useState<AgendaEditorState | null>(null);
  const day = selectedDay ?? today;
  const routeKey = `${day}:${captureId ?? ""}`;
  const [view, setView] = useState({ routeKey, value: "agenda" });
  const days = useMemo(() => calendarMonthDays(day), [day]);
  const { items, unscheduled, overdue } = useMemo(() => buildCalendarItems({ projects, tasks, captures: captureStore.captures, habits: habitStore.habits, startDay: days[0], endDay: days[41], today }), [projects, tasks, captureStore.captures, habitStore.habits, days, today]);
  const markers = useMemo(() => {
    const result = new Map<string, string[]>();
    const names = { task: "tasks", project: "project deadlines", habit: "habits", capture: "reminders" };
    for (const item of items) {
      if (!item.day) continue;
      const current = result.get(item.day) ?? [];
      if (!current.includes(names[item.type])) result.set(item.day, [...current, names[item.type]]);
    }
    return result;
  }, [items]);
  const selected = items.filter((item) => item.day === day);
  const open = selected.filter((item) => !item.completed);
  const completed = selected.filter((item) => item.completed);
  const capture = captureId ? captureStore.captures.find((item) => item.id === captureId) : undefined;
  const error = loadError ?? habitStore.loadError;

  useEffect(() => {
    const update = () => setToday(habitDay());
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);

  const agendaRows = (entries: CalendarSourceItem[]) => <AgendaList entries={entries} day={day} today={today} readOnly={readOnly} captureStore={captureStore} habitStore={habitStore}
    onTaskDone={onTaskDone} onEdit={setEditor} onOpenCapture={(item) => onSelect(item.day ?? day, item.id)} onFocus={onFocusTask} canFocus={canFocus} />;

  return <div className="mx-auto flex max-w-6xl flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Your projects, habits, and reminders in one place.</p><div className="flex gap-2"><a href="#habits" className={buttonVariants({ variant: "outline" })}><CalendarCheck data-icon="inline-start" />Habits</a><Button variant="ghost" size="icon" aria-label="Refresh calendar" disabled={readOnly} onClick={() => window.dispatchEvent(new Event("pokus-workspace-refresh"))}><RefreshCw /></Button></div></div>
    {error ? <div role="status" className="rounded-xl border p-3 text-sm">{error} Use Refresh to try again.</div> : null}
    {readOnly ? <p role="status" className="text-sm text-muted-foreground">Saved calendar items are available to browse. Connect and sign in to make changes.</p> : null}
    {captureId && !capture && !loading ? <p role="status">This capture is no longer available. <Button variant="link" onClick={() => onSelect(day)}>Dismiss</Button></p> : null}
    <Tabs value={view.routeKey === routeKey ? view.value : "agenda"} onValueChange={(value) => setView({ routeKey, value: String(value) })}><TabsList aria-label="Calendar views"><TabsTrigger value="agenda">Calendar</TabsTrigger><TabsTrigger value="unscheduled">Unscheduled</TabsTrigger></TabsList>
      <TabsContent value="agenda" className="pt-5"><div className="grid items-start gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <CalendarMonth day={day} today={today} markers={markers} onSelect={onSelect} />
        <section aria-label="Daily agenda" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{day === today ? "Today" : formatHabitDay(day)}</h2><div className="flex gap-2">{onCreateTask ? <Button variant="outline" disabled={readOnly} onClick={() => setEditor({ type: "new", day })}><Plus data-icon="inline-start" />{day === today ? "New task today" : `New task on ${formatHabitDay(day)}`}</Button> : null}<Button variant="outline" onClick={() => onSelect(today)}>Today</Button></div></div>
          {loading || habitStore.isLoading ? <Skeleton className="h-64 w-full" /> : <>
            {day === today && overdue.length ? <section aria-label="Overdue" className="flex flex-col gap-3"><h3 className="font-medium">Overdue</h3>{agendaRows(overdue)}</section> : null}
            {open.length ? agendaRows(open) : <CalendarEmpty title="Nothing left on this date" description="Dated tasks, project deadlines, daily habits, and capture reminders appear here." />}
            {completed.length ? <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer content-center font-medium">Completed ({completed.length})</summary><div className="pt-3">{agendaRows(completed)}</div></details> : null}
            {day > today && selected.some((item) => item.type === "habit") ? <p className="text-xs text-muted-foreground">Future habits are shown for planning. Check in on the day or afterward.</p> : null}
          </>}
        </section>
      </div></TabsContent>
      <TabsContent value="unscheduled" className="pt-5"><div className="flex flex-col gap-5"><p className="text-sm text-muted-foreground">Set a date to put this work on your calendar. Tasks without their own date use their project’s deadline.</p>{loading ? <Skeleton className="h-64 w-full" /> : <>{["project", "task"].map((type) => {
        const entries = unscheduled.filter((item) => item.type === type && !item.completed);
        return <section key={type} className="flex flex-col gap-3"><h2 className="font-semibold">{type === "project" ? "Projects" : "Tasks"}</h2>{entries.length ? agendaRows(entries) : <p className="text-sm text-muted-foreground">No unscheduled {type === "project" ? "projects" : "tasks"}.</p>}</section>;
      })}</>}</div></TabsContent>
    </Tabs>
    <AgendaEditor editor={editor} onClose={() => setEditor(null)} readOnly={readOnly} tasks={tasks} projects={projects} categories={categories} onEditTask={onEditTask} onEditProject={onEditProject} onCreateTask={onCreateTask} onCreateCategory={onCreateCategory} />
    <ResponsiveOverlay open={Boolean(capture)} onOpenChange={(value) => { if (!value) onSelect(day); }} title={capture ? captureDisplayTitle(capture) : "Capture reminder"}>
      {capture ? <div className="flex flex-col gap-5"><CapturePreview capture={capture} /><CaptureReminderEditor key={capture.id} capture={capture} store={captureStore} readOnly={readOnly} onClose={() => onSelect(day)} /></div> : null}
    </ResponsiveOverlay>
  </div>;
}
