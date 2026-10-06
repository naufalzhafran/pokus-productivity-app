import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarMonth } from "@/components/features/CalendarMonth";
import { HabitDayList } from "@/components/features/HabitDayList";
import { CapturePreview } from "@/components/features/CaptureCard";
import { CaptureReminderEditor } from "@/components/features/CaptureReminderEditor";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { buildCalendarItems, calendarMonthDays } from "@/lib/calendar";
import { formatHabitDay, habitDay } from "@/lib/habits";
import { captureDisplayTitle } from "@/lib/capture";
import { projectHash } from "@/lib/routes";
import type { CalendarSourceItem } from "@/types/calendar";
import type { useHabits } from "@/hooks/useHabits";
import type { CaptureStore } from "@/hooks/useCaptures";
import type { Category, CategoryInput, Project, ProjectInput, Task, TaskInput } from "@/types/task";

const TaskEditor = lazy(() => import("@/components/features/TaskEditor").then((module) => ({ default: module.TaskEditor })));
const ProjectEditor = lazy(() => import("@/components/features/ProjectEditor").then((module) => ({ default: module.ProjectEditor })));
type Editor = { type: "task" | "project"; id: string };

interface CalendarPageProps {
  projects: Project[]; tasks: Task[]; categories: Category[]; captureStore: CaptureStore;
  habitStore: ReturnType<typeof useHabits>; readOnly: boolean; loading: boolean; loadError: string | null;
  selectedDay?: string | null; captureId?: string | null;
  onSelect: (day: string, captureId?: string) => void;
  onTaskDone: (id: string, done: boolean) => Promise<unknown>;
  onEditTask: (id: string, input: TaskInput) => Promise<unknown>;
  onEditProject: (id: string, input: ProjectInput) => Promise<unknown>;
  onCreateCategory: (input: CategoryInput) => Promise<Category>;
}

function CalendarEmpty({ title, description }: { title: string; description: string }) {
  return <Empty><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>;
}

export function CalendarPage({ projects, tasks, categories, captureStore, habitStore, readOnly, loading, loadError, selectedDay, captureId, onSelect, onTaskDone, onEditTask, onEditProject, onCreateCategory }: CalendarPageProps) {
  const [today, setToday] = useState(habitDay);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
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
  const editedTask = editor?.type === "task" ? tasks.find((item) => item.id === editor.id) : undefined;
  const editedProject = editor?.type === "project" ? projects.find((item) => item.id === editor.id) : undefined;
  const error = loadError ?? habitStore.loadError;

  useEffect(() => {
    const update = () => setToday(habitDay());
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);

  const mutate = async (id: string, action: () => Promise<unknown>) => {
    if (pending.has(id)) return;
    setPending((current) => new Set(current).add(id));
    try { await action(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "The change could not be saved."); throw cause; }
    finally { setPending((current) => { const next = new Set(current); next.delete(id); return next; }); }
  };

  const rows = (entries: CalendarSourceItem[]) => <div className="flex flex-col gap-3">
    {entries.filter((item) => item.type !== "habit").length ? <ul className="divide-y rounded-xl border">{entries.filter((item) => item.type !== "habit").map((item) => <li key={`${item.type}:${item.id}`} className="flex flex-wrap items-center gap-2 px-3 py-3">
      <div className="min-w-0 flex-1">
        {item.type === "project" ? <a href={projectHash(item.id)} className="block min-h-11 content-center rounded-sm font-medium [overflow-wrap:anywhere] hover:underline">{item.title}</a> : <Button variant="ghost" className="h-auto min-h-11 max-w-full justify-start whitespace-normal px-0 text-left" onClick={() => item.type === "capture" ? onSelect(item.day ?? day, item.id) : setEditor({ type: "task", id: item.id })}>{item.title}</Button>}
        <p className="text-xs text-muted-foreground">{item.type === "project" ? "Project deadline" : item.type === "task" ? item.project?.title ?? "Task · No project" : "Capture reminder"}{item.inheritedDate ? " · From project" : ""}{item.day && item.day !== day ? ` · ${item.day}` : ""}{item.time ? ` · ${new Date(item.time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}</p>
      </div>
      {item.type === "project" ? <Button variant="outline" disabled={readOnly} onClick={() => setEditor({ type: "project", id: item.id })}>{item.day ? "Edit" : "Set date"}</Button> : item.type === "task" || item.type === "capture" ? <Button variant={item.completed ? "secondary" : "outline"} disabled={readOnly || pending.has(`${item.type}:${item.id}`)} aria-label={`${item.completed ? "Reopen" : "Complete"} ${item.title}`} aria-pressed={item.completed} onClick={() => void mutate(`${item.type}:${item.id}`, () => item.type === "task" ? onTaskDone(item.id, !item.completed) : captureStore.setCaptureReminderDone(item.id, !item.completed)).catch(() => {})}><Check data-icon="inline-start" />{item.completed ? "Done" : "Complete"}</Button> : null}
      {item.type === "task" && !item.day ? <Button variant="outline" disabled={readOnly} onClick={() => setEditor({ type: "task", id: item.id })}>Set date</Button> : null}
    </li>)}</ul> : null}
    {entries.some((item) => item.type === "habit") ? <HabitDayList habits={entries.flatMap((item) => item.type === "habit" ? [item.source] : [])} day={day} disabled={readOnly || habitStore.saving || day > today}
      onDetail={() => { window.location.hash = "#habits"; }}
      onSet={(habit, value) => mutate(`habit:${habit.id}`, () => habitStore.setValue(habit, day, value))}
      onIncrement={(habit) => mutate(`habit:${habit.id}`, () => habitStore.increment(habit, day))} /> : null}
  </div>;
  // Keep all-day work ahead of reminders without hiding the habit controls.
  const agendaRows = (entries: CalendarSourceItem[]) => <div className="flex flex-col gap-3">{rows(entries.filter((item) => item.type !== "capture"))}{rows(entries.filter((item) => item.type === "capture"))}</div>;

  return <div className="mx-auto flex max-w-6xl flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Your projects, habits, and reminders in one place.</p><div className="flex gap-2"><a href="#habits" className={buttonVariants({ variant: "outline" })}><CalendarCheck data-icon="inline-start" />Habits</a><Button variant="ghost" size="icon" aria-label="Refresh calendar" disabled={readOnly} onClick={() => window.dispatchEvent(new Event("pokus-workspace-refresh"))}><RefreshCw /></Button></div></div>
    {error ? <div role="status" className="rounded-xl border p-3 text-sm">{error} Use Refresh to try again.</div> : null}
    {readOnly ? <p role="status" className="text-sm text-muted-foreground">Saved calendar items are available to browse. Connect and sign in to make changes.</p> : null}
    {captureId && !capture && !loading ? <p role="status">This capture is no longer available. <Button variant="link" onClick={() => onSelect(day)}>Dismiss</Button></p> : null}
    <Tabs value={view.routeKey === routeKey ? view.value : "agenda"} onValueChange={(value) => setView({ routeKey, value: String(value) })}><TabsList aria-label="Calendar views"><TabsTrigger value="agenda">Calendar</TabsTrigger><TabsTrigger value="unscheduled">Unscheduled</TabsTrigger></TabsList>
      <TabsContent value="agenda" className="pt-5"><div className="grid items-start gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <CalendarMonth day={day} today={today} markers={markers} onSelect={onSelect} />
        <section aria-label="Daily agenda" className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{day === today ? "Today" : formatHabitDay(day)}</h2><Button variant="outline" onClick={() => onSelect(today)}>Today</Button></div>
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
        return <section key={type} className="flex flex-col gap-3"><h2 className="font-semibold">{type === "project" ? "Projects" : "Tasks"}</h2>{entries.length ? rows(entries) : <p className="text-sm text-muted-foreground">No unscheduled {type === "project" ? "projects" : "tasks"}.</p>}</section>;
      })}</>}</div></TabsContent>
    </Tabs>
    <ResponsiveOverlay open={Boolean(editor)} onOpenChange={(value) => { if (!value) setEditor(null); }} title={editedTask ? "Edit task" : "Edit project"}>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        {editedTask && !readOnly ? <TaskEditor key={editedTask.id} task={editedTask} initialProjectId={editedTask.projectId} projects={projects} categories={categories} onCreateCategory={onCreateCategory} onCancel={() => setEditor(null)} onSave={async (input) => { await onEditTask(editedTask.id, input); setEditor(null); }} /> : null}
        {editedProject && !readOnly ? <ProjectEditor key={editedProject.id} project={editedProject} openTaskCount={tasks.filter((task) => task.projectId === editedProject.id && !task.isDone).length} onCancel={() => setEditor(null)} onSave={async (input) => { await onEditProject(editedProject.id, input); setEditor(null); }} /> : null}
        {readOnly ? <p>Connect and sign in to edit this item.</p> : null}
      </Suspense>
    </ResponsiveOverlay>
    <ResponsiveOverlay open={Boolean(capture)} onOpenChange={(value) => { if (!value) onSelect(day); }} title={capture ? captureDisplayTitle(capture) : "Capture reminder"}>
      {capture ? <div className="flex flex-col gap-5"><CapturePreview capture={capture} /><CaptureReminderEditor key={capture.id} capture={capture} store={captureStore} readOnly={readOnly} onClose={() => onSelect(day)} /></div> : null}
    </ResponsiveOverlay>
  </div>;
}
