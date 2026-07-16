import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import {
  CheckCircle2,
  ListTodo,
  Timer as TimerIcon,
  TimerReset,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { ProfilePage } from "@/components/features/ProfilePage";
import { SessionTask } from "@/components/features/SessionTask";
import { TaskPanel } from "@/components/features/TaskPanel";
import { UserAvatar } from "@/components/features/UserAvatar";
import {
  Timer,
  type TimerStopOptions,
  type TimerState,
} from "@/components/features/timer";
import { usePomodoroSession } from "@/hooks/usePomodoroSession";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { createPocketBaseId } from "@/lib/pocketbase-records";
import {
  loadSelectedTaskId,
  saveSelectedTaskId,
} from "@/lib/selection-storage";

const PRESETS = [15, 25, 45, 60];
type Page = "tasks" | "timer" | "profile";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

function formatDuration(minutes: number) {
  return `${minutes.toString().padStart(2, "0")}:00`;
}

function getPageFromHash(): Page {
  if (window.location.hash === "#timer") return "timer";
  if (window.location.hash === "#profile") return "profile";
  return "tasks";
}

function getPageTitle(page: Page) {
  if (page === "timer") return "Pomodoro Timer";
  if (page === "profile") return "Profile";
  return "Tasks";
}

function ClockDigits({ value }: { value: string }) {
  return (
    <div
      className="clock-digits flex justify-center"
      aria-label={value}
    >
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 md:px-10 md:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-8 w-28" />
          </div>
          <Skeleton className="h-9 w-48" />
        </header>
        <div className="grid flex-1 items-start gap-5 py-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Skeleton className="hidden h-[34rem] lg:block" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const [duration, setDuration] = useState(25);
  const {
    session,
    setSession,
    isLoading: isSessionLoading,
    loadError: sessionLoadError,
  } = usePomodoroSession();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    loadSelectedTaskId,
  );
  const [page, setPage] = useState<Page>(getPageFromHash);
  const {
    tasks,
    createTask,
    setTaskDone,
    deleteTask,
    recordFocusTime,
    editTask,
    removeProjectFromTasks,
    isLoading: areTasksLoading,
    loadError: tasksLoadError,
  } = useTasks();
  const {
    projects,
    createProject,
    deleteProject,
    setProjectDone,
    isLoading: areProjectsLoading,
    loadError: projectsLoadError,
  } = useProjects();

  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId && !task.isDone) ?? null;
  const sessionTask =
    tasks.find((task) => task.id === session?.taskId) ?? null;
  const hasValidSessionTask = !session?.taskId || sessionTask !== null;
  const currentSession = session && hasValidSessionTask ? session : null;
  const mode = currentSession?.mode ?? "setup";
  const workspaceLoadError =
    tasksLoadError ?? projectsLoadError ?? sessionLoadError;

  useEffect(() => {
    const handleHashChange = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    saveSelectedTaskId(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (areTasksLoading) return;

    if (
      selectedTaskId &&
      !tasks.some((task) => task.id === selectedTaskId && !task.isDone)
    ) {
      saveSelectedTaskId(null);
    }
  }, [areTasksLoading, selectedTaskId, tasks]);

  useEffect(() => {
    if (areTasksLoading || isSessionLoading) return;

    if (
      session?.taskId &&
      !tasks.some((task) => task.id === session.taskId)
    ) {
      setSession((currentSession) =>
        currentSession ? { ...currentSession, taskId: null } : null,
      );
    }
  }, [areTasksLoading, isSessionLoading, session, setSession, tasks]);

  const runActionTransition = useCallback((action: string, update: () => void) => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const transitionDocument = document as ViewTransitionDocument;

    if (!transitionDocument.startViewTransition || prefersReducedMotion) {
      update();
      return;
    }

    document.documentElement.dataset.transitionAction = action;

    const transition = transitionDocument.startViewTransition(() => {
      flushSync(update);
    });

    transition.finished.finally(() => {
      delete document.documentElement.dataset.transitionAction;
    });
  }, []);

  const handleDurationChange = useCallback((value: number) => {
    setDuration(Math.max(1, value));
  }, []);

  const navigateToPage = useCallback((nextPage: Page) => {
    window.location.hash = nextPage;
    setPage(nextPage);
  }, []);

  const startTimer = useCallback(() => {
    runActionTransition("start", () => {
      setSession({
        id: createPocketBaseId(),
        taskId: selectedTask?.id ?? null,
        durationMinutes: duration,
        mode: "running",
        remainingSeconds: duration * 60,
        isActive: true,
        lastTick: Date.now(),
      });
      navigateToPage("timer");
    });
  }, [duration, navigateToPage, runActionTransition, selectedTask, setSession]);

  const openTimerPage = useCallback(() => {
    if (!currentSession) setSelectedTaskId(null);
    navigateToPage("timer");
  }, [currentSession, navigateToPage]);

  const setUpTimerForTask = useCallback(
    (taskId: string) => {
      const task = tasks.find(
        (candidate) => candidate.id === taskId && !candidate.isDone,
      );
      if (!task || currentSession) return;

      setSelectedTaskId(task.id);
      navigateToPage("timer");
    },
    [currentSession, navigateToPage, tasks],
  );

  const handleTimerStop = useCallback(
    ({ saveElapsedTime, elapsedSeconds }: TimerStopOptions) => {
      runActionTransition("reset", () => {
        if (saveElapsedTime && session?.taskId) {
          void recordFocusTime(session.taskId, elapsedSeconds).catch(() => {
            toast.error("Focused time could not be saved.");
          });
          setSession((currentSession) =>
            currentSession
              ? {
                  ...currentSession,
                  mode: "complete",
                  remainingSeconds: Math.max(
                    0,
                    currentSession.durationMinutes * 60 - elapsedSeconds,
                  ),
                  isActive: false,
                  lastTick: Date.now(),
                }
              : currentSession,
          );
        }
        setSession(null);
      });
    },
    [recordFocusTime, runActionTransition, session, setSession],
  );

  const completeTimer = useCallback(() => {
    if (currentSession?.mode !== "running") return;

    runActionTransition("complete", () => {
      if (currentSession.taskId) {
        void recordFocusTime(
          currentSession.taskId,
          currentSession.durationMinutes * 60,
        ).catch(() => {
          toast.error("Focused time could not be added to the task.");
        });
      }
      setSession((currentSession) =>
        currentSession
          ? {
              ...currentSession,
              mode: "complete",
              remainingSeconds: 0,
              isActive: false,
              lastTick: Date.now(),
            }
          : currentSession,
      );
    });
  }, [currentSession, recordFocusTime, runActionTransition, setSession]);

  const handleTimerStateChange = useCallback(
    (timerState: TimerState) => {
      setSession((currentSession) =>
        currentSession ? { ...currentSession, ...timerState } : currentSession,
      );
    },
    [setSession],
  );

  const handleCreateTask = useCallback(
    async (title: string, projectId: string | null) => {
      const validProjectId = projects.some(
        (project) => project.id === projectId && !project.isDone,
      )
        ? projectId
        : null;
      return createTask(title, validProjectId);
    },
    [createTask, projects],
  );

  const handleCreateProject = useCallback(
    async (title: string) => (await createProject(title))?.id ?? null,
    [createProject],
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      try {
        await removeProjectFromTasks(projectId);
        await deleteProject(projectId);
        toast.success("Project deleted. Its tasks are in No project.");
      } catch (error) {
        toast.error("The project could not be deleted.");
        throw error;
      }
    },
    [deleteProject, removeProjectFromTasks],
  );

  const handleProjectStatusChange = useCallback(
    async (projectId: string, isDone: boolean) => {
      try {
        await setProjectDone(projectId, isDone);
      } catch (error) {
        toast.error(
          isDone
            ? "The project could not be marked done."
            : "The project could not be restored.",
        );
        throw error;
      }
    },
    [setProjectDone],
  );

  const handleEditTask = useCallback(
    async (taskId: string, title: string, projectId: string | null) => {
      const validProjectId = projects.some(
        (project) => project.id === projectId && !project.isDone,
      )
        ? projectId
        : null;
      try {
        await editTask(taskId, title, validProjectId);
      } catch (error) {
        toast.error("The task could not be saved.");
        throw error;
      }
    },
    [editTask, projects],
  );

  const handleTaskStatusChange = useCallback(
    async (taskId: string, isDone: boolean) => {
      try {
        await setTaskDone(taskId, isDone);
        if (isDone && selectedTaskId === taskId) {
          setSelectedTaskId(null);
        }
        if (isDone && session?.taskId === taskId) {
          setSession((currentSession) =>
            currentSession ? { ...currentSession, taskId: null } : null,
          );
        }
      } catch (error) {
        toast.error(
          isDone
            ? "The task could not be marked done."
            : "The task could not be reopened.",
        );
        throw error;
      }
    },
    [selectedTaskId, session, setSession, setTaskDone],
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      try {
        await deleteTask(taskId);
        if (selectedTaskId === taskId) setSelectedTaskId(null);
        if (session?.taskId === taskId) {
          setSession((currentSession) =>
            currentSession ? { ...currentSession, taskId: null } : null,
          );
        }
        toast.success("Task deleted.");
      } catch (error) {
        toast.error("The task could not be deleted.");
        throw error;
      }
    },
    [deleteTask, selectedTaskId, session, setSession],
  );

  const handleMarkSessionTaskDone = useCallback(async () => {
    if (!sessionTask) return;
    try {
      await setTaskDone(sessionTask.id, true);
      runActionTransition("reset", () => {
        setSelectedTaskId(null);
        setSession(null);
        navigateToPage("tasks");
      });
    } catch {
      toast.error("The task could not be marked done.");
    }
  }, [navigateToPage, runActionTransition, sessionTask, setSession, setTaskDone]);

  const handleKeepTaskOpen = useCallback(() => {
    if (!sessionTask) return;

    runActionTransition("reset", () => {
      setSelectedTaskId(sessionTask.id);
      setSession(null);
    });
  }, [runActionTransition, sessionTask, setSession]);

  const handleStartAnother = useCallback(() => {
    runActionTransition("reset", () => {
      setSelectedTaskId(null);
      setSession(null);
      navigateToPage("timer");
    });
  }, [navigateToPage, runActionTransition, setSession]);

  const handleViewTasks = useCallback(() => {
    runActionTransition("reset", () => {
      setSelectedTaskId(null);
      setSession(null);
      navigateToPage("tasks");
    });
  }, [navigateToPage, runActionTransition, setSession]);

  if (areTasksLoading || areProjectsLoading || isSessionLoading) {
    return <WorkspaceSkeleton />;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 md:px-10 md:py-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <Badge>Pokus</Badge>
            <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              {getPageTitle(page)}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <nav aria-label="Primary navigation" className="w-full sm:w-auto">
              <ToggleGroup
                variant="outline"
                spacing={0}
                value={[page]}
                onValueChange={(values) => {
                  const nextPage = values[0] as Page | undefined;
                  if (!nextPage || nextPage === page) return;
                  if (nextPage === "timer") openTimerPage();
                  else navigateToPage(nextPage);
                }}
              >
                <ToggleGroupItem
                  value="tasks"
                  aria-label="Tasks"
                  aria-current={page === "tasks" ? "page" : undefined}
                >
                  <ListTodo data-icon="inline-start" />
                  <span>Tasks</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="timer"
                  aria-label={mode === "running" ? "Timer, running" : "Timer"}
                  aria-current={page === "timer" ? "page" : undefined}
                >
                  <TimerIcon data-icon="inline-start" />
                  <span>Timer</span>
                  {mode === "running" && page !== "timer" ? (
                    <Badge variant="secondary">Live</Badge>
                  ) : null}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="profile"
                  aria-label="Profile"
                  aria-current={page === "profile" ? "page" : undefined}
                >
                  <UserAvatar size="sm" />
                  <span className="hidden md:inline">Profile</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </nav>
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center gap-8 py-10">
          {page === "profile" ? (
            <ProfilePage tasks={tasks} />
          ) : page === "tasks" ? (
            <div className="screen-panel w-full max-w-5xl">
              {workspaceLoadError ? (
                <Card className="mb-5 border-destructive/30">
                  <CardHeader>
                    <CardTitle>Some workspace data is unavailable</CardTitle>
                    <CardDescription>{workspaceLoadError}</CardDescription>
                    <CardAction>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => window.location.reload()}
                      >
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
                      {mode === "running" ? "Pomodoro running" : "Session complete"}
                    </CardTitle>
                    <CardDescription>
                      {sessionTask?.title ?? "No task attached"}
                    </CardDescription>
                    <CardAction>
                      <Button type="button" onClick={() => navigateToPage("timer")}>
                        <TimerIcon data-icon="inline-start" />
                        {mode === "running" ? "Return to timer" : "View result"}
                      </Button>
                    </CardAction>
                  </CardHeader>
                </Card>
              ) : null}

              <TaskPanel
                tasks={tasks}
                projects={projects}
                canStartPomodoro={!currentSession}
                onCreate={handleCreateTask}
                onCreateProject={handleCreateProject}
                onDeleteProject={handleDeleteProject}
                onProjectStatusChange={handleProjectStatusChange}
                onStartPomodoro={setUpTimerForTask}
                onStatusChange={handleTaskStatusChange}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
              />
            </div>
          ) : mode === "running" && currentSession ? (
            <div className="screen-panel w-full max-w-3xl text-center">
              <div className="mb-8">
                <p className="text-sm uppercase text-muted-foreground">
                  Focus session · {currentSession.durationMinutes} minutes
                </p>
                {sessionTask ? (
                  <div className="mt-3">
                    <SessionTask title={sessionTask.title} />
                  </div>
                ) : (
                  <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
                    Open focus session
                  </h2>
                )}
              </div>
              <Timer
                key={currentSession.id}
                initialDurationMinutes={currentSession.durationMinutes}
                initialRemainingSeconds={currentSession.remainingSeconds}
                initialIsActive={currentSession.isActive}
                initialLastTick={currentSession.lastTick}
                sessionTitle={
                  sessionTask?.title ??
                  `${currentSession.durationMinutes}-minute Pomodoro`
                }
                taskTitle={sessionTask?.title}
                onStop={handleTimerStop}
                onComplete={completeTimer}
                onStateChange={handleTimerStateChange}
              />
            </div>
          ) : (
            <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="screen-panel flex justify-center lg:justify-end">
                <div
                  className="timer-shell setup-dial relative mx-auto flex aspect-square w-full max-w-[560px] justify-center"
                  style={
                    {
                      viewTransitionName: "focus-timer-container",
                    } as CSSProperties
                  }
                >
                  <CircularDurationInput
                    value={duration}
                    onChange={handleDurationChange}
                    min={1}
                    max={60}
                    size={560}
                    strokeWidth={12}
                    className="size-full"
                    ariaLabel="Pomodoro duration in minutes"
                  >
                    <ClockDigits value={formatDuration(duration)} />
                  </CircularDurationInput>
                </div>
              </div>

              <div className="screen-panel mx-auto flex w-full max-w-sm flex-col gap-5 lg:mx-0">
                {mode === "complete" && currentSession ? (
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
                      <>
                        <CardContent className="flex flex-col gap-3 text-left">
                          <SessionTask title={sessionTask.title} isComplete />
                          <p className="text-sm text-muted-foreground">
                            Did you finish this task?
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {currentSession.durationMinutes} minutes added to its
                            focused time.
                          </p>
                        </CardContent>
                        <CardFooter className="grid gap-2">
                          <Button
                            type="button"
                            onClick={handleMarkSessionTaskDone}
                          >
                            <CheckCircle2 data-icon="inline-start" />
                            Mark done & return to tasks
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleKeepTaskOpen}
                          >
                            Focus again
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={handleViewTasks}
                          >
                            Return to tasks
                          </Button>
                        </CardFooter>
                      </>
                    ) : (
                      <>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            Your focus session is finished.
                          </p>
                        </CardContent>
                        <CardFooter className="grid gap-2">
                          <Button
                            type="button"
                            onClick={handleStartAnother}
                          >
                            <TimerReset data-icon="inline-start" />
                            Start another
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleViewTasks}
                          >
                            View tasks
                          </Button>
                        </CardFooter>
                      </>
                    )}
                  </Card>
                ) : (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle>Set up your session</CardTitle>
                        <CardDescription>
                          {selectedTask
                            ? "This task was chosen from your task list."
                            : "Choose a task from Tasks or run an open focus session."}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        {selectedTask ? (
                          <SessionTask title={selectedTask.title} />
                        ) : (
                          <p className="text-sm font-medium">Open focus session</p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {selectedTask
                            ? `Focus time will be added to “${selectedTask.title}”.`
                            : "No task will be attached, but the session will still appear in your focus history."}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => navigateToPage("tasks")}
                        >
                          <ListTodo data-icon="inline-start" />
                          {selectedTask ? "Change task" : "Choose from tasks"}
                        </Button>
                      </CardFooter>
                    </Card>

                    <ToggleGroup
                      variant="outline"
                      spacing={2}
                      value={[duration.toString()]}
                      onValueChange={(values) => {
                        const nextDuration = Number(values[0]);
                        if (nextDuration) setDuration(nextDuration);
                      }}
                      aria-label="Pomodoro duration presets"
                      className="grid w-full grid-cols-4"
                    >
                      {PRESETS.map((preset) => (
                        <ToggleGroupItem
                          key={preset}
                          value={preset.toString()}
                          aria-label={`${preset} minutes`}
                          className="w-full"
                        >
                          {preset}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>

                    <p className="text-center text-xs text-muted-foreground">
                      Drag the ring or use the arrow keys for a custom duration.
                    </p>

                    <Button
                      type="button"
                      size="lg"
                      onClick={startTimer}
                      className="w-full"
                    >
                      <TimerReset data-icon="inline-start" />
                      Start Pomodoro
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
