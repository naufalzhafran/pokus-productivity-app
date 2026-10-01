import { lazy, Suspense, useState, type ReactNode } from "react";
import { ListTodo, Minus, Plus, Play } from "lucide-react";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { SessionTask } from "@/components/features/SessionTask";
import { Timer, type TimerStopOptions } from "@/components/features/timer";
import { TimerCompletion } from "@/components/features/TimerCompletion";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PomodoroSession, Project, Task } from "@/types/task";

const TaskPickerDialog = lazy(() => import("@/components/features/TaskPickerDialog").then((module) => ({ default: module.TaskPickerDialog })));

interface TimerPageProps {
  session: PomodoroSession | null;
  sessionTask: Task | null;
  selectedTask: Task | null;
  tasks: Task[];
  projects: Project[];
  duration: number;
  remainingSeconds: number;
  isSaving?: boolean;
  canEdit?: boolean;
  syncPending?: boolean;
  onDurationChange: (duration: number) => void;
  onStart: () => void;
  onToggle: () => void;
  onStop: (options: TimerStopOptions) => void;
  onSelectTask: (taskId: string | null) => void;
  onMarkTaskDone: () => Promise<void>;
  onFocusAgain: () => void;
  onViewTasks: () => void;
  /** Content offered on the completion screen while you take a break. */
  breakContent?: ReactNode;
}
export function TimerPage({ session, sessionTask, selectedTask, tasks, projects, duration, remainingSeconds,
  isSaving = false, canEdit = true, syncPending = false, onDurationChange, onStart,
  onToggle, onStop, onSelectTask, onMarkTaskDone, onFocusAgain, onViewTasks, breakContent }: TimerPageProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  if (session?.mode === "complete") return <div className="mx-auto flex min-h-[55svh] max-w-md flex-col justify-center">
    <TimerCompletion durationMinutes={(session.durationMinutes * 60 - session.remainingSeconds) / 60}
      taskTitle={sessionTask?.title} onMarkTaskDone={sessionTask && canEdit ? onMarkTaskDone : undefined}
      onFocusAgain={onFocusAgain} onViewTasks={onViewTasks} syncPending={syncPending} isSaving={isSaving}>{breakContent}</TimerCompletion>
  </div>;
  if (session?.mode === "running") return <div className="focus-screen mx-auto w-full max-w-xl text-center">
    <div className="mb-5 flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{session.isActive ? "Time to focus" : "Take a breath"} · {session.durationMinutes} min</p>
      {sessionTask ? <SessionTask title={sessionTask.title} /> : <h2 className="text-xl font-medium">Open focus session</h2>}
    </div>
    <Timer durationMinutes={session.durationMinutes} remainingSeconds={remainingSeconds}
      isActive={session.isActive} isSaving={isSaving} sessionTitle={sessionTask?.title ?? "Focus session"}
      taskTitle={sessionTask?.title ?? (session.taskId ? "Your task" : undefined)} onToggle={onToggle} onStop={onStop} />
  </div>;
  return <div className="focus-screen mx-auto flex w-full max-w-md flex-col items-center gap-4 md:gap-6">
    <div className="text-center"><h2 className="text-xl font-medium md:text-2xl">Make room for focus.</h2><p className="mt-1 text-sm text-muted-foreground">One session. One thing at a time.</p></div>
    <div className="focus-dial setup-dial relative aspect-square">
      <CircularDurationInput value={duration} onChange={onDurationChange} min={1} max={60} size={540} strokeWidth={10}
        ariaLabel="Pomodoro duration in minutes" ariaValueText={`${duration} minutes`}>
        <div className="flex flex-col items-center gap-2"><span className="clock-digits">{String(duration).padStart(2, "0")}:00</span><span className="text-sm text-muted-foreground">minutes of focus</span></div>
      </CircularDurationInput>
    </div>
    <Button variant="outline" className="task-picker w-full justify-start" onClick={() => setPickerOpen(true)} disabled={isSaving}>
      <ListTodo data-icon="inline-start" /><span className="min-w-0 flex-1 truncate text-left">{selectedTask?.title ?? "Choose a task (optional)"}</span>
    </Button>
    <div className="flex w-full items-center gap-2">
      <Button variant="ghost" size="icon" aria-label="Decrease duration" disabled={duration <= 1 || isSaving} onClick={() => onDurationChange(duration - 1)}><Minus /></Button>
      <ToggleGroup variant="outline" value={[String(duration)]} onValueChange={(values) => values[0] && onDurationChange(Number(values[0]))} aria-label="Pomodoro duration presets" className="grid flex-1 grid-cols-4">
        {[15, 25, 45, 60].map((preset) => <ToggleGroupItem key={preset} value={String(preset)} disabled={isSaving} aria-label={`${preset} minutes`}>{preset}</ToggleGroupItem>)}
      </ToggleGroup>
      <Button variant="ghost" size="icon" aria-label="Increase duration" disabled={duration >= 60 || isSaving} onClick={() => onDurationChange(duration + 1)}><Plus /></Button>
    </div>
    <Button size="lg" className="focus-primary w-full" disabled={isSaving} onClick={onStart}><Play data-icon="inline-start" />{isSaving ? "Saving…" : "Start focus"}</Button>
    {pickerOpen ? <Suspense fallback={null}><TaskPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} tasks={tasks} projects={projects} selectedTaskId={selectedTask?.id ?? null} onSelect={onSelectTask} /></Suspense> : null}
  </div>;
}
