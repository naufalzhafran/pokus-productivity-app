import { lazy, Suspense, useState } from "react";
import { Check, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HabitDayList } from "@/components/features/HabitDayList";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { projectHash } from "@/lib/routes";
import type { CaptureStore } from "@/hooks/useCaptures";
import type { useHabits } from "@/hooks/useHabits";
import type { CalendarSourceItem } from "@/types/calendar";
import type { Category, CategoryInput, Project, ProjectInput, Task, TaskInput } from "@/types/task";

const TaskEditor = lazy(() => import("@/components/features/TaskEditor").then((module) => ({ default: module.TaskEditor })));
const ProjectEditor = lazy(() => import("@/components/features/ProjectEditor").then((module) => ({ default: module.ProjectEditor })));

/** What the agenda's editor sheet shows: an existing task or project, or a new task due on `day`. */
export type AgendaEditorState = { type: "task" | "project"; id: string } | { type: "new"; day: string | null };

interface AgendaListProps {
  entries: CalendarSourceItem[];
  /** The day being shown; habit check-ins record on it. */
  day: string;
  today: string;
  readOnly: boolean;
  captureStore: CaptureStore;
  habitStore: ReturnType<typeof useHabits>;
  onTaskDone: (id: string, done: boolean) => Promise<unknown>;
  onEdit: (editor: AgendaEditorState) => void;
  onOpenCapture: (item: CalendarSourceItem) => void;
  onOpenHabits?: () => void;
  /** Sets up (or links) a focus session for an open task. Disabled when `canFocus` is false. */
  onFocus?: (taskId: string) => void;
  canFocus?: boolean;
}

/** Calendar and Today rows: tasks, project deadlines, and reminders with their actions, then habit check-ins. */
export function AgendaList({ entries, day, today, readOnly, captureStore, habitStore, onTaskDone, onEdit, onOpenCapture, onOpenHabits, onFocus, canFocus = false }: AgendaListProps) {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const mutate = async (id: string, action: () => Promise<unknown>) => {
    if (pending.has(id)) return;
    setPending((current) => new Set(current).add(id));
    try { await action(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "The change could not be saved."); throw cause; }
    finally { setPending((current) => { const next = new Set(current); next.delete(id); return next; }); }
  };
  const habits = entries.flatMap((item) => item.type === "habit" ? [item.source] : []);
  const rows = (listed: CalendarSourceItem[]) => listed.length ? <ul className="divide-y rounded-xl border">{listed.map((item) => <li key={`${item.type}:${item.id}`} className="flex flex-wrap items-center gap-2 px-3 py-3">
      <div className="min-w-0 flex-1">
        {item.type === "project" ? <a href={projectHash(item.id)} className="block min-h-11 content-center rounded-sm font-medium [overflow-wrap:anywhere] hover:underline">{item.title}</a> : <Button variant="ghost" className="h-auto min-h-11 max-w-full justify-start whitespace-normal px-0 text-left" onClick={() => item.type === "capture" ? onOpenCapture(item) : onEdit({ type: "task", id: item.id })}>{item.title}</Button>}
        <p className="text-xs text-muted-foreground">{item.type === "project" ? "Project deadline" : item.type === "task" ? item.project?.title ?? "Task · No project" : "Capture reminder"}{item.inheritedDate ? " · From project" : ""}{item.day && item.day !== day ? ` · ${item.day}` : ""}{item.time ? ` · ${new Date(item.time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}</p>
      </div>
      {item.type === "task" && !item.completed && onFocus ? <Button variant="ghost" disabled={!canFocus} aria-label={`Focus on ${item.title}`} onClick={() => onFocus(item.id)}><TimerReset data-icon="inline-start" />Focus</Button> : null}
      {item.type === "project" ? <Button variant="outline" disabled={readOnly} onClick={() => onEdit({ type: "project", id: item.id })}>{item.day ? "Edit" : "Set date"}</Button> : <Button variant={item.completed ? "secondary" : "outline"} disabled={readOnly || pending.has(`${item.type}:${item.id}`)} aria-label={`${item.completed ? "Reopen" : "Complete"} ${item.title}`} aria-pressed={item.completed} onClick={() => void mutate(`${item.type}:${item.id}`, () => item.type === "task" ? onTaskDone(item.id, !item.completed) : captureStore.setCaptureReminderDone(item.id, !item.completed)).catch(() => {})}><Check data-icon="inline-start" />{item.completed ? "Done" : "Complete"}</Button>}
      {item.type === "task" && !item.day ? <Button variant="outline" disabled={readOnly} onClick={() => onEdit({ type: "task", id: item.id })}>Set date</Button> : null}
    </li>)}</ul> : null;

  // All-day work and habits come ahead of timed reminders.
  return <div className="flex flex-col gap-3">
    {rows(entries.filter((item) => item.type === "project" || item.type === "task"))}
    {habits.length ? <HabitDayList habits={habits} day={day} disabled={habitStore.saving || day > today} canIncrement={!readOnly}
      onDetail={() => { if (onOpenHabits) onOpenHabits(); else window.location.hash = "#habits"; }}
      onSet={(habit, value) => mutate(`habit:${habit.id}`, () => habitStore.setValue(habit, day, value))}
      onIncrement={(habit) => mutate(`habit:${habit.id}`, () => habitStore.increment(habit, day))} /> : null}
    {rows(entries.filter((item) => item.type === "capture"))}
  </div>;
}

interface AgendaEditorProps {
  editor: AgendaEditorState | null;
  onClose: () => void;
  readOnly: boolean;
  tasks: Task[];
  projects: Project[];
  categories: Category[];
  onEditTask: (id: string, input: TaskInput) => Promise<unknown>;
  onEditProject: (id: string, input: ProjectInput) => Promise<unknown>;
  onCreateTask?: (input: TaskInput) => Promise<unknown>;
  onCreateCategory: (input: CategoryInput) => Promise<Category>;
}

/** The sheet for editing an agenda task or project, or adding a task on a day. */
export function AgendaEditor({ editor, onClose, readOnly, tasks, projects, categories, onEditTask, onEditProject, onCreateTask, onCreateCategory }: AgendaEditorProps) {
  const editedTask = editor?.type === "task" ? tasks.find((item) => item.id === editor.id) : undefined;
  const editedProject = editor?.type === "project" ? projects.find((item) => item.id === editor.id) : undefined;
  const creating = editor?.type === "new" ? editor : null;
  return <ResponsiveOverlay open={Boolean(editor)} onOpenChange={(value) => { if (!value) onClose(); }} title={creating ? "New task" : editedTask ? "Edit task" : "Edit project"}>
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      {editedTask && !readOnly ? <TaskEditor key={editedTask.id} task={editedTask} initialProjectId={editedTask.projectId} projects={projects} categories={categories} onCreateCategory={onCreateCategory} onCancel={onClose} onSave={async (input) => { await onEditTask(editedTask.id, input); onClose(); }} /> : null}
      {editedProject && !readOnly ? <ProjectEditor key={editedProject.id} project={editedProject} openTaskCount={tasks.filter((task) => task.projectId === editedProject.id && !task.isDone).length} onCancel={onClose} onSave={async (input) => { await onEditProject(editedProject.id, input); onClose(); }} /> : null}
      {creating && onCreateTask && !readOnly ? <TaskEditor initialProjectId={null} initialDueDate={creating.day} projects={projects} categories={categories} onCreateCategory={onCreateCategory} onCancel={onClose}
        onSave={async (input) => { await onCreateTask(input); onClose(); toast.success(input.dueDate ? "Task added to your calendar." : "Task added."); }} /> : null}
      {readOnly ? <p>Connect and sign in to edit this item.</p> : null}
    </Suspense>
  </ResponsiveOverlay>;
}
