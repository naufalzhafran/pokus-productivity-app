import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { CheckCircle2, ListTodo, Minus, Plus, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { AppShell, type AppPage } from "@/components/features/AppShell";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { SessionTask } from "@/components/features/SessionTask";
import { TaskWorkspace } from "@/components/features/TaskWorkspace";
import { Timer, type TimerStopOptions } from "@/components/features/timer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePomodoroSession } from "@/hooks/usePomodoroSession";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { useTimerClock } from "@/hooks/useTimerClock";
import { useWorkspacePreferences } from "@/hooks/useWorkspacePreferences";
import { createPocketBaseId } from "@/lib/pocketbase-records";
import { pb } from "@/lib/pocketbase";
import {
  loadSelectedTaskId,
  saveSelectedTaskId,
} from "@/lib/selection-storage";
import type { PomodoroSession } from "@/types/task";

const ProfilePage = lazy(() =>
  import("@/components/features/ProfilePage").then((module) => ({
    default: module.ProfilePage,
  })),
);
const PRESETS = [15, 25, 45, 60];

function getPageFromHash(): AppPage {
  if (window.location.hash === "#timer") return "timer";
  if (window.location.hash === "#profile") return "profile";
  return "tasks";
}

function formatDuration(minutes: number) {
  return `${minutes.toString().padStart(2, "0")}:00`;
}

function summarizeTitle(title: string) {
  const oneLine = title.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine;
}

function ClockDigits({ value }: { value: string }) {
  return (
    <div className="clock-digits flex justify-center" aria-label={value}>
      {value.split("").map((character, index) => (
        <span
          key={`${index}-${character}`}
          className={character === ":" ? "duration-separator" : "duration-digit"}
          aria-hidden="true"
        >
          {character}
        </span>
      ))}
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-5 px-5 py-6">
      <Skeleton className="h-14 w-full" />
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Skeleton className="hidden h-[36rem] lg:block" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const userId = pb.authStore.record?.id ?? "anonymous";
  const [viewState, setViewState] = useWorkspacePreferences(userId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    loadSelectedTaskId,
  );
  const [page, setPage] = useState<AppPage>(getPageFromHash);
  const [profileTaskId, setProfileTaskId] = useState<string | null>(null);
  const {
    session,
    setSession,
    isLoading: isSessionLoading,
    loadError: sessionLoadError,
  } = usePomodoroSession();
  const {
    tasks,
    createTask,
    setTaskDone,
    deleteTask,
    recordFocusTime,
    editTask,
    reconcileDeletedProject,
    isLoading: areTasksLoading,
    loadError: tasksLoadError,
  } = useTasks();
  const {
    projects,
    createProject,
    deleteProject,
    setProjectDone,
    updateProject,
    isLoading: areProjectsLoading,
    loadError: projectsLoadError,
  } = useProjects();

  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId && !task.isDone) ?? null;
  const sessionTask =
    tasks.find((task) => task.id === session?.taskId) ?? null;
  const currentSession =
    session && (!session.taskId || sessionTask) ? session : null;

  const completeSession = useCallback(
    (completed: PomodoroSession) => {
      if (completed.mode !== "running") return;
      if (completed.taskId) {
        void recordFocusTime(
          completed.taskId,
          completed.durationMinutes * 60,
        ).catch(() => toast.error("Focused time could not be saved."));
      }
      setSession({
        ...completed,
        mode: "complete",
        remainingSeconds: 0,
        isActive: false,
        lastTick: Date.now(),
      });
      toast.success("Pomodoro complete.");
    },
    [recordFocusTime, setSession],
  );
  const remainingSeconds = useTimerClock(currentSession, completeSession);

  useEffect(() => {
    const handleHashChange = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    saveSelectedTaskId(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (areTasksLoading || !session?.taskId) return;
    if (!tasks.some((task) => task.id === session.taskId)) {
      setSession((current) => (current ? { ...current, taskId: null } : null));
    }
  }, [areTasksLoading, session?.taskId, setSession, tasks]);

  const navigate = useCallback((nextPage: AppPage) => {
    window.location.hash = nextPage;
    setPage(nextPage);
  }, []);

  const setDuration = (duration: number) =>
    setViewState((current) => ({
      ...current,
      lastDuration: Math.max(1, Math.min(60, duration)),
    }));

  const startTimer = () => {
    const duration = viewState.lastDuration;
    setSession({
      id: createPocketBaseId(),
      taskId: selectedTask?.id ?? null,
      durationMinutes: duration,
      mode: "running",
      remainingSeconds: duration * 60,
      isActive: true,
      lastTick: Date.now(),
    });
    navigate("timer");
  };

  const setUpTimerForTask = (taskId: string) => {
    if (currentSession) {
      toast.error("Finish the current session before starting another.");
      return;
    }
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.isDone) return;
    setSelectedTaskId(taskId);
    navigate("timer");
  };

  const toggleTimer = () => {
    if (!currentSession || currentSession.mode !== "running") return;
    setSession({
      ...currentSession,
      remainingSeconds,
      isActive: !currentSession.isActive,
      lastTick: Date.now(),
    });
  };

  const stopTimer = ({ saveElapsedTime, elapsedSeconds }: TimerStopOptions) => {
    if (!currentSession) return;
    if (saveElapsedTime && currentSession.taskId) {
      void recordFocusTime(currentSession.taskId, elapsedSeconds).catch(() =>
        toast.error("Focused time could not be saved."),
      );
      setSession({
        ...currentSession,
        mode: "complete",
        remainingSeconds: Math.max(
          0,
          currentSession.durationMinutes * 60 - elapsedSeconds,
        ),
        isActive: false,
        lastTick: Date.now(),
      });
    } else {
      setSession(null);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProject(projectId);
      reconcileDeletedProject(projectId);
      if (viewState.scope === `project:${projectId}`) {
        setViewState((current) => ({ ...current, scope: "all" }));
      }
      toast.success("Project deleted. Its tasks now have no project.");
    } catch (error) {
      toast.error("The project could not be deleted.");
      throw error;
    }
  };

  const handleStatusChange = async (taskId: string, isDone: boolean) => {
    try {
      await setTaskDone(taskId, isDone);
      if (isDone && selectedTaskId === taskId) setSelectedTaskId(null);
      if (isDone && session?.taskId === taskId) {
        setSession((current) => (current ? { ...current, taskId: null } : null));
      }
    } catch (error) {
      toast.error(isDone ? "Task could not be completed." : "Task could not be reopened.");
      throw error;
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      if (session?.taskId === taskId) {
        setSession((current) => (current ? { ...current, taskId: null } : null));
      }
      toast.success("Task deleted.");
    } catch (error) {
      toast.error("The task could not be deleted.");
      throw error;
    }
  };

  if (areTasksLoading || areProjectsLoading || isSessionLoading) {
    return <WorkspaceSkeleton />;
  }

  const loadError = tasksLoadError ?? projectsLoadError ?? sessionLoadError;
  const timerMode = currentSession?.mode;

  return (
    <AppShell
      page={page}
      session={currentSession}
      onNavigate={(nextPage) => {
        if (nextPage === "timer" && !currentSession) setSelectedTaskId(null);
        navigate(nextPage);
      }}
    >
      {page === "tasks" ? (
        <div className="screen-panel">
          {loadError ? (
            <Card className="mb-5 border-destructive/30">
              <CardHeader>
                <CardTitle>Some workspace data is unavailable</CardTitle>
                <CardDescription>{loadError}</CardDescription>
                <CardAction>
                  <Button type="button" variant="outline" onClick={() => location.reload()}>
                    Try again
                  </Button>
                </CardAction>
              </CardHeader>
            </Card>
          ) : null}
          {currentSession ? (
            <Card className="mb-5 border-primary/25 bg-primary/5">
              <CardHeader>
                <CardTitle>
                  {timerMode === "complete"
                    ? "Session complete"
                    : currentSession.isActive
                      ? "Pomodoro running"
                      : "Pomodoro paused"}
                </CardTitle>
                <CardDescription className="line-clamp-2 whitespace-pre-wrap break-words">
                  {sessionTask?.title ?? "Open focus session"}
                </CardDescription>
                <CardAction>
                  <Button type="button" onClick={() => navigate("timer")}>
                    <TimerReset data-icon="inline-start" />
                    View timer
                  </Button>
                </CardAction>
              </CardHeader>
            </Card>
          ) : null}
          <TaskWorkspace
            tasks={tasks}
            projects={projects}
            viewState={viewState}
            setViewState={setViewState}
            canStartPomodoro={!currentSession}
            onCreateTask={(title, projectId) => createTask(title, projectId)}
            onCreateProject={createProject}
            onUpdateProject={updateProject}
            onDeleteProject={handleDeleteProject}
            onArchiveProject={async (projectId, archived) => {
              try {
                await setProjectDone(projectId, archived);
                toast.success(archived ? "Project archived." : "Project restored.");
              } catch (error) {
                toast.error("The project could not be updated.");
                throw error;
              }
            }}
            onStartPomodoro={setUpTimerForTask}
            onStatusChange={handleStatusChange}
            onEditTask={editTask}
            onDeleteTask={handleDeleteTask}
          />
        </div>
      ) : page === "profile" ? (
        <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
          <ProfilePage
            tasks={tasks}
            openTaskId={profileTaskId}
            onOpenTask={setProfileTaskId}
          />
        </Suspense>
      ) : currentSession?.mode === "running" ? (
        <div className="screen-panel mx-auto w-full max-w-3xl text-center">
          <div className="mb-5">
            <p className="text-sm uppercase text-muted-foreground">
              Focus session · {currentSession.durationMinutes} minutes
            </p>
            {sessionTask ? (
              <div className="mt-3">
                <SessionTask title={sessionTask.title} />
              </div>
            ) : (
              <h2 className="mt-3 text-xl font-semibold">Open focus session</h2>
            )}
          </div>
          <Timer
            durationMinutes={currentSession.durationMinutes}
            remainingSeconds={remainingSeconds}
            isActive={currentSession.isActive}
            sessionTitle={
              (sessionTask ? summarizeTitle(sessionTask.title) : null) ??
              `${currentSession.durationMinutes}-minute Pomodoro`
            }
            taskTitle={sessionTask?.title}
            onToggle={toggleTimer}
            onStop={stopTimer}
          />
        </div>
      ) : (
        <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="screen-panel flex justify-center">
            <div
              className="timer-shell setup-dial relative flex aspect-square w-[min(88vw,58dvh,560px)] justify-center"
              style={{ viewTransitionName: "focus-timer-container" } as CSSProperties}
            >
              <CircularDurationInput
                value={viewState.lastDuration}
                onChange={setDuration}
                min={1}
                max={60}
                size={560}
                strokeWidth={12}
                className="size-full"
                ariaLabel="Pomodoro duration in minutes"
              >
                <ClockDigits value={formatDuration(viewState.lastDuration)} />
              </CircularDurationInput>
            </div>
          </div>

          <div className="screen-panel mx-auto flex w-full max-w-sm flex-col gap-4 lg:mx-0">
            {currentSession?.mode === "complete" ? (
              <Card className="complete-banner">
                <CardHeader>
                  <CardTitle role="status" aria-live="polite">
                    Session complete
                  </CardTitle>
                  <CardDescription>
                    {currentSession.durationMinutes} focused minutes recorded.
                  </CardDescription>
                </CardHeader>
                {sessionTask ? (
                  <CardContent>
                    <SessionTask title={sessionTask.title} isComplete />
                  </CardContent>
                ) : null}
                <CardFooter className="grid gap-2">
                  {sessionTask ? (
                    <Button
                      type="button"
                      onClick={async () => {
                        await handleStatusChange(sessionTask.id, true);
                        setSession(null);
                        navigate("tasks");
                      }}
                    >
                      <CheckCircle2 data-icon="inline-start" />
                      Mark done & view tasks
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSession(null);
                      setSelectedTaskId(sessionTask?.id ?? null);
                    }}
                  >
                    Focus again
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSession(null);
                      navigate("tasks");
                    }}
                  >
                    View tasks
                  </Button>
                </CardFooter>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Set up your session</CardTitle>
                    <CardDescription>
                      Choose a duration, then start deliberately when ready.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedTask ? (
                      <SessionTask title={selectedTask.title} />
                    ) : (
                      <p className="text-sm font-medium">Open focus session</p>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate("tasks")}
                    >
                      <ListTodo data-icon="inline-start" />
                      {selectedTask ? "Change task" : "Choose a task"}
                    </Button>
                  </CardFooter>
                </Card>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Decrease duration"
                    onClick={() => setDuration(viewState.lastDuration - 1)}
                  >
                    <Minus />
                  </Button>
                  <span className="min-w-20 text-center text-sm font-medium">
                    {viewState.lastDuration} minutes
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Increase duration"
                    onClick={() => setDuration(viewState.lastDuration + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
                <ToggleGroup
                  variant="outline"
                  value={[viewState.lastDuration.toString()]}
                  onValueChange={(values) => {
                    if (values[0]) setDuration(Number(values[0]));
                  }}
                  aria-label="Pomodoro duration presets"
                  className="grid grid-cols-4"
                >
                  {PRESETS.map((preset) => (
                    <ToggleGroupItem key={preset} value={preset.toString()}>
                      {preset}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Button type="button" size="lg" onClick={startTimer}>
                  <TimerReset data-icon="inline-start" />
                  Start Pomodoro
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
