import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TimerReset } from "lucide-react";
import { toast } from "sonner";
import { AppShell, type AppPage } from "@/components/features/AppShell";
import { TaskWorkspace } from "@/components/features/TaskWorkspace";
import type { TimerStopOptions } from "@/components/features/timer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePomodoroSession } from "@/hooks/usePomodoroSession";
import { useProjects } from "@/hooks/useProjects";
import { useCategories } from "@/hooks/useCategories";
import { useTasks } from "@/hooks/useTasks";
import { useTimerClock } from "@/hooks/useTimerClock";
import { useWorkspacePreferences } from "@/hooks/useWorkspacePreferences";
import { createPocketBaseId } from "@/lib/pocketbase-records";
import { pb } from "@/lib/pocketbase";
import {
  loadSelectedTaskId,
  saveSelectedTaskId,
} from "@/lib/selection-storage";
import { isProjectArchived } from "@/lib/workspace";
import type { PomodoroSession } from "@/types/task";

const loadProfilePage = () => import("@/components/features/ProfilePage");
const ProfilePage = lazy(() =>
  loadProfilePage().then((module) => ({
    default: module.ProfilePage,
  })),
);
const loadTimerPage = () => import("@/components/features/TimerPage");
const TimerPage = lazy(() =>
  loadTimerPage().then((module) => ({ default: module.TimerPage })),
);

function getPageFromHash(): AppPage {
  if (window.location.hash === "#timer") return "timer";
  if (window.location.hash === "#profile") return "profile";
  return "tasks";
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
  const [appFeedback, setAppFeedback] = useState<{
    kind: "status" | "alert";
    message: string;
  } | null>(null);
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
    reconcileDeletedCategory,
    isLoading: areTasksLoading,
    loadError: tasksLoadError,
  } = useTasks();
  const {
    projects,
    createProject,
    deleteProject,
    setProjectArchived,
    updateProject,
    isLoading: areProjectsLoading,
    loadError: projectsLoadError,
  } = useProjects();
  const {
    categories,
    createCategory,
    updateCategory,
    deleteCategory,
    isLoading: areCategoriesLoading,
    loadError: categoriesLoadError,
  } = useCategories();

  const taskMap = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const selectedTaskCandidate = selectedTaskId
    ? taskMap.get(selectedTaskId)
    : undefined;
  const selectedTask =
    selectedTaskCandidate && !selectedTaskCandidate.isDone
      ? selectedTaskCandidate
      : null;
  const sessionTask = session?.taskId ? (taskMap.get(session.taskId) ?? null) : null;
  const currentSession =
    session && (!session.taskId || sessionTask) ? session : null;

  const completeSession = useCallback(
    (completed: PomodoroSession) => {
      if (completed.mode !== "running") return;
      if (completed.taskId) {
        void recordFocusTime(
          completed.taskId,
          completed.durationMinutes * 60,
        ).catch(() => {
          toast.error("Focused time could not be saved.");
          setAppFeedback({
            kind: "alert",
            message: "Focused time could not be saved.",
          });
        });
      }
      setSession({
        ...completed,
        mode: "complete",
        remainingSeconds: 0,
        isActive: false,
        lastTick: Date.now(),
      });
      toast.success("Pomodoro complete.");
      setAppFeedback({ kind: "status", message: "Pomodoro complete." });
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

  useEffect(() => {
    if (currentSession?.mode === "complete" && page !== "timer") {
      window.location.hash = "timer";
    }
  }, [currentSession?.mode, page]);

  const setDuration = useCallback((duration: number) =>
    setViewState((current) => ({
      ...current,
      lastDuration: Math.max(1, Math.min(60, duration)),
    })), [setViewState]);

  const startTimer = useCallback(() => {
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
    setAppFeedback({ kind: "status", message: "Pomodoro started." });
    navigate("timer");
  }, [navigate, selectedTask?.id, setSession, viewState.lastDuration]);

  const setUpTimerForTask = useCallback((taskId: string) => {
    if (currentSession) {
      const message = "Finish the current session before starting another.";
      toast.error(message);
      setAppFeedback({ kind: "alert", message });
      return;
    }
    const task = taskMap.get(taskId);
    const taskProject = task?.projectId ? projectMap.get(task.projectId) : undefined;
    if (!task || task.isDone || isProjectArchived(taskProject)) return;
    setSelectedTaskId(taskId);
    navigate("timer");
  }, [currentSession, navigate, projectMap, taskMap]);

  const toggleTimer = useCallback(() => {
    if (!currentSession || currentSession.mode !== "running") return;
    setSession({
      ...currentSession,
      remainingSeconds,
      isActive: !currentSession.isActive,
      lastTick: Date.now(),
    });
    setAppFeedback({
      kind: "status",
      message: currentSession.isActive ? "Pomodoro paused." : "Pomodoro resumed.",
    });
  }, [currentSession, remainingSeconds, setSession]);

  const stopTimer = useCallback(({ saveElapsedTime, elapsedSeconds }: TimerStopOptions) => {
    if (!currentSession) return;
    if (saveElapsedTime && currentSession.taskId) {
      void recordFocusTime(currentSession.taskId, elapsedSeconds).catch(() => {
          toast.error("Focused time could not be saved.");
          setAppFeedback({
            kind: "alert",
            message: "Focused time could not be saved.",
          });
        });
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
      setAppFeedback({
        kind: "status",
        message: "Focused time saved. Session complete.",
      });
    } else {
      setSession(null);
      setAppFeedback({ kind: "status", message: "Pomodoro stopped." });
    }
  }, [currentSession, recordFocusTime, setSession]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      await deleteProject(projectId);
      reconcileDeletedProject(projectId);
      if (viewState.scope === `project:${projectId}`) {
        setViewState((current) => ({ ...current, scope: "all" }));
      }
      toast.success("Project deleted. Its tasks now have no project.");
      setAppFeedback({
        kind: "status",
        message: "Project deleted. Its tasks now have no project.",
      });
    } catch (error) {
      toast.error("The project could not be deleted.");
      setAppFeedback({
        kind: "alert",
        message: "The project could not be deleted.",
      });
      throw error;
    }
  }, [deleteProject, reconcileDeletedProject, setViewState, viewState.scope]);

  const handleStatusChange = useCallback(async (taskId: string, isDone: boolean) => {
    try {
      await setTaskDone(taskId, isDone);
      if (isDone && selectedTaskId === taskId) setSelectedTaskId(null);
      if (isDone && session?.taskId === taskId) {
        setSession((current) => (current ? { ...current, taskId: null } : null));
      }
      setAppFeedback({
        kind: "status",
        message: isDone ? "Task completed." : "Task reopened.",
      });
    } catch (error) {
      const message = isDone
        ? "Task could not be completed."
        : "Task could not be reopened.";
      toast.error(message);
      setAppFeedback({ kind: "alert", message });
      throw error;
    }
  }, [selectedTaskId, session, setSession, setTaskDone]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      await deleteTask(taskId);
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      if (session?.taskId === taskId) {
        setSession((current) => (current ? { ...current, taskId: null } : null));
      }
      toast.success("Task deleted.");
      setAppFeedback({ kind: "status", message: "Task deleted." });
    } catch (error) {
      toast.error("The task could not be deleted.");
      setAppFeedback({
        kind: "alert",
        message: "The task could not be deleted.",
      });
      throw error;
    }
  }, [deleteTask, selectedTaskId, session, setSession]);

  const handleArchiveProject = useCallback(async (projectId: string, archived: boolean) => {
    try {
      await setProjectArchived(projectId, archived);
      const message = archived ? "Project archived." : "Project restored.";
      toast.success(message);
      setAppFeedback({ kind: "status", message });
    } catch (error) {
      toast.error("The project could not be updated.");
      setAppFeedback({ kind: "alert", message: "The project could not be updated." });
      throw error;
    }
  }, [setProjectArchived]);

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    await deleteCategory(categoryId);
    reconcileDeletedCategory(categoryId);
    if (viewState.categoryId === categoryId) setViewState((current) => ({ ...current, categoryId: null }));
    toast.success("Category deleted. Affected tasks are now uncategorized.");
  }, [deleteCategory, reconcileDeletedCategory, setViewState, viewState.categoryId]);

  const handleNavigationIntent = useCallback((nextPage: AppPage) => {
    if (nextPage === "timer") void loadTimerPage();
    if (nextPage === "profile") void loadProfilePage();
  }, []);

  const handleNavigate = useCallback((nextPage: AppPage) => {
    if (nextPage === "timer" && !currentSession) setSelectedTaskId(null);
    navigate(nextPage);
  }, [currentSession, navigate]);

  const handleTimerTaskDone = useCallback(async () => {
    if (!sessionTask) return;
    await handleStatusChange(sessionTask.id, true);
    setSession(null);
    navigate("tasks");
  }, [handleStatusChange, navigate, sessionTask, setSession]);

  const handleFocusAgain = useCallback(() => {
    setSession(null);
    setSelectedTaskId(sessionTask?.id ?? null);
  }, [sessionTask?.id, setSession]);

  const handleViewTasks = useCallback(() => {
    setSession(null);
    navigate("tasks");
  }, [navigate, setSession]);

  if (areTasksLoading || areProjectsLoading || areCategoriesLoading || isSessionLoading) {
    return <WorkspaceSkeleton />;
  }

  const loadError = tasksLoadError ?? projectsLoadError ?? categoriesLoadError ?? sessionLoadError;
  const timerMode = currentSession?.mode;

  return (
    <AppShell
      page={page}
      session={currentSession}
      onNavigate={handleNavigate}
      onNavigateIntent={handleNavigationIntent}
    >
      {appFeedback ? (
        <p
          className="sr-only"
          role={appFeedback.kind}
          aria-live={appFeedback.kind === "alert" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          {appFeedback.message}
        </p>
      ) : null}
      {page === "tasks" ? (
        <div className="screen-panel">
          {loadError ? (
            <Card className="mb-5 border-destructive/30" role="alert">
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
            categories={categories}
            viewState={viewState}
            setViewState={setViewState}
            canStartPomodoro={!currentSession}
            onCreateTask={createTask}
            onCreateProject={createProject}
            onUpdateProject={updateProject}
            onDeleteProject={handleDeleteProject}
            onArchiveProject={handleArchiveProject}
            onStartPomodoro={setUpTimerForTask}
            onStatusChange={handleStatusChange}
            onEditTask={editTask}
            onDeleteTask={handleDeleteTask}
            onCreateCategory={createCategory}
            onUpdateCategory={updateCategory}
            onDeleteCategory={handleDeleteCategory}
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
      ) : (
        <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
          <TimerPage
            session={currentSession}
            sessionTask={sessionTask}
            selectedTask={selectedTask}
            duration={viewState.lastDuration}
            remainingSeconds={remainingSeconds}
            onDurationChange={setDuration}
            onStart={startTimer}
            onToggle={toggleTimer}
            onStop={stopTimer}
            onChooseTask={() => navigate("tasks")}
            onMarkTaskDone={handleTimerTaskDone}
            onFocusAgain={handleFocusAgain}
            onViewTasks={handleViewTasks}
          />
        </Suspense>
      )}
    </AppShell>
  );
}
