import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import {
  CheckCircle2,
  ListTodo,
  RotateCcw,
  Timer as TimerIcon,
  TimerReset,
  X,
} from "lucide-react";
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
import { CircularDurationInput } from "@/components/features/CircularDurationInput";
import { SessionTask } from "@/components/features/SessionTask";
import { TaskPanel } from "@/components/features/TaskPanel";
import {
  Timer,
  type TimerStopOptions,
} from "@/components/features/timer";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import {
  loadSelectedTaskId,
  loadSession,
  removeTimerState,
  saveSelectedTaskId,
  saveSession,
} from "@/lib/session-storage";
import type { PomodoroSession } from "@/types/task";

const PRESETS = [15, 25, 45, 60];
type Page = "tasks" | "timer";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

function formatDuration(minutes: number) {
  return `${minutes.toString().padStart(2, "0")}:00`;
}

function getPageFromHash(): Page {
  return window.location.hash === "#timer" ? "timer" : "tasks";
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

export default function App() {
  const [initialSession] = useState(loadSession);
  const [duration, setDuration] = useState(
    () => initialSession?.durationMinutes ?? 25,
  );
  const [session, setSession] = useState<PomodoroSession | null>(initialSession);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    () => (initialSession ? initialSession.taskId : loadSelectedTaskId()),
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
  } = useTasks();
  const { projects, createProject, deleteProject, setProjectDone } =
    useProjects();

  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId && !task.isDone) ?? null;
  const sessionTask =
    tasks.find((task) => task.id === session?.taskId) ?? null;
  const hasValidSessionTask = !session?.taskId || sessionTask !== null;
  const currentSession = session && hasValidSessionTask ? session : null;
  const mode = currentSession?.mode ?? "setup";

  useEffect(() => {
    const handleHashChange = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    saveSelectedTaskId(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (
      selectedTaskId &&
      !tasks.some((task) => task.id === selectedTaskId && !task.isDone)
    ) {
      saveSelectedTaskId(null);
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (
      session?.taskId &&
      !tasks.some((task) => task.id === session.taskId)
    ) {
      removeTimerState(session.id);
      saveSession(null);
    }
  }, [session, tasks]);

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
        id: `pomodoro-${Date.now()}`,
        taskId: selectedTask?.id ?? null,
        durationMinutes: duration,
        mode: "running",
      });
      navigateToPage("timer");
    });
  }, [duration, navigateToPage, runActionTransition, selectedTask]);

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

  const resetTimer = useCallback(() => {
    runActionTransition("reset", () => {
      if (session) removeTimerState(session.id);
      setSession(null);
    });
  }, [runActionTransition, session]);

  const handleTimerStop = useCallback(
    ({ saveElapsedTime, elapsedSeconds }: TimerStopOptions) => {
      runActionTransition("reset", () => {
        if (saveElapsedTime && session?.taskId) {
          recordFocusTime(session.taskId, elapsedSeconds);
        }
        setSession(null);
      });
    },
    [recordFocusTime, runActionTransition, session],
  );

  const completeTimer = useCallback(() => {
    if (currentSession?.mode !== "running") return;

    runActionTransition("complete", () => {
      if (currentSession.taskId) {
        recordFocusTime(
          currentSession.taskId,
          currentSession.durationMinutes * 60,
        );
      }
      setSession((currentSession) =>
        currentSession
          ? { ...currentSession, mode: "complete" }
          : currentSession,
      );
    });
  }, [currentSession, recordFocusTime, runActionTransition]);

  const handleCreateTask = useCallback(
    (title: string, projectId: string | null) => {
      const validProjectId = projects.some(
        (project) => project.id === projectId && !project.isDone,
      )
        ? projectId
        : null;
      createTask(title, validProjectId);
    },
    [createTask, projects],
  );

  const handleCreateProject = useCallback(
    (title: string) => createProject(title)?.id ?? null,
    [createProject],
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      deleteProject(projectId);
      removeProjectFromTasks(projectId);
    },
    [deleteProject, removeProjectFromTasks],
  );

  const handleProjectStatusChange = useCallback(
    (projectId: string, isDone: boolean) => {
      setProjectDone(projectId, isDone);
    },
    [setProjectDone],
  );

  const handleEditTask = useCallback(
    (taskId: string, title: string, projectId: string | null) => {
      const validProjectId = projects.some(
        (project) => project.id === projectId && !project.isDone,
      )
        ? projectId
        : null;
      editTask(taskId, title, validProjectId);
    },
    [editTask, projects],
  );

  const handleTaskStatusChange = useCallback(
    (taskId: string, isDone: boolean) => {
      setTaskDone(taskId, isDone);
      if (isDone && selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
      if (isDone && session?.taskId === taskId) {
        setSession((currentSession) =>
          currentSession ? { ...currentSession, taskId: null } : null,
        );
      }
    },
    [selectedTaskId, session?.taskId, setTaskDone],
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      deleteTask(taskId);
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      if (session?.taskId === taskId) {
        setSession((currentSession) =>
          currentSession ? { ...currentSession, taskId: null } : null,
        );
      }
    },
    [deleteTask, selectedTaskId, session?.taskId],
  );

  const handleMarkSessionTaskDone = useCallback(() => {
    if (!sessionTask) return;

    runActionTransition("reset", () => {
      setTaskDone(sessionTask.id, true);
      setSelectedTaskId(null);
      setSession(null);
    });
  }, [runActionTransition, sessionTask, setTaskDone]);

  const handleKeepTaskOpen = useCallback(() => {
    if (!sessionTask) return;

    runActionTransition("reset", () => {
      setSelectedTaskId(sessionTask.id);
      setSession(null);
    });
  }, [runActionTransition, sessionTask]);

  const handleStartAnother = useCallback(() => {
    runActionTransition("reset", () => {
      setSelectedTaskId(null);
      setSession(null);
      navigateToPage("timer");
    });
  }, [navigateToPage, runActionTransition]);

  const handleViewTasks = useCallback(() => {
    runActionTransition("reset", () => {
      setSelectedTaskId(null);
      setSession(null);
      navigateToPage("tasks");
    });
  }, [navigateToPage, runActionTransition]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 md:px-10 md:py-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <Badge>Pokus</Badge>
            <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              {page === "tasks" ? "Tasks" : "Pomodoro Timer"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <nav aria-label="Primary navigation">
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
                  <span className="hidden sm:inline">Tasks</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="timer"
                  aria-label={mode === "running" ? "Timer, running" : "Timer"}
                  aria-current={page === "timer" ? "page" : undefined}
                >
                  <TimerIcon data-icon="inline-start" />
                  <span className="hidden sm:inline">Timer</span>
                  {mode === "running" && page !== "timer" ? (
                    <Badge variant="secondary">Live</Badge>
                  ) : null}
                </ToggleGroupItem>
              </ToggleGroup>
            </nav>

            {page === "timer" && mode === "running" ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Reset timer"
                onClick={resetTimer}
                className="rounded-full"
              >
                <RotateCcw />
              </Button>
            ) : null}
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center gap-8 py-10">
          {page === "tasks" ? (
            <div className="screen-panel w-full max-w-5xl">
              <div className="mb-7 text-center">
                <p className="text-sm text-muted-foreground">
                  Organize tasks into projects, then start a focused session
                  from any open task.
                </p>
              </div>

              {currentSession ? (
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle>
                      {mode === "running" ? "Pomodoro running" : "Session complete"}
                    </CardTitle>
                    <CardDescription>
                      {sessionTask?.title ?? "No task attached"}
                    </CardDescription>
                    <CardAction>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigateToPage("timer")}
                      >
                        {mode === "running" ? "View timer" : "View result"}
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
                sessionId={currentSession.id}
                sessionTitle={
                  sessionTask?.title ??
                  `${currentSession.durationMinutes}-minute Pomodoro`
                }
                taskTitle={sessionTask?.title}
                onStop={handleTimerStop}
                onComplete={completeTimer}
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
                            Mark task done
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleKeepTaskOpen}
                          >
                            Keep task open
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
                        <CardTitle>Session task</CardTitle>
                        <CardDescription>
                          {selectedTask
                            ? "Started from your task list."
                            : "Run an open session or choose a task."}
                        </CardDescription>
                        {selectedTask ? (
                          <CardAction>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remove task from this session"
                              onClick={() => setSelectedTaskId(null)}
                            >
                              <X />
                            </Button>
                          </CardAction>
                        ) : null}
                      </CardHeader>
                      {selectedTask ? (
                        <CardContent>
                          <p className="truncate text-sm font-medium">
                            {selectedTask.title}
                          </p>
                        </CardContent>
                      ) : (
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            No task attached. This Pomodoro will be an open focus
                            session.
                          </p>
                        </CardContent>
                      )}
                      <CardFooter>
                        {!selectedTask ? (
                          <Button
                            type="button"
                            variant="link"
                            onClick={() => navigateToPage("tasks")}
                          >
                            Choose from tasks
                          </Button>
                        ) : null}
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
