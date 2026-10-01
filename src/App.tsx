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
import { AppShell } from "@/components/features/AppShell";
import { PwaUpdate } from "@/components/features/PwaUpdate";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useAppPreferences } from "@/hooks/useAppPreferences";
import { playCompletionSound, unlockCompletionSound, useFocusDevice } from "@/hooks/useFocusDevice";
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
import { parseRoute, projectHash, routeHash, type AppPage, type AppRoute } from "@/lib/routes";
import { isProjectArchived, NO_PROJECT_ID } from "@/lib/workspace";
import type { PomodoroSession } from "@/types/task";

const loadProfilePage = () => import("@/components/features/ProfilePage");
const loadProjectsPage = () => import("@/components/features/ProjectsPage");
const ProjectsPage = lazy(() => loadProjectsPage().then((module) => ({ default: module.ProjectsPage })));
const loadProjectDetailPage = () => import("@/components/features/ProjectDetailPage");
const ProjectDetailPage = lazy(() => loadProjectDetailPage().then((module) => ({ default: module.ProjectDetailPage })));
const ProfilePage = lazy(() =>
  loadProfilePage().then((module) => ({
    default: module.ProfilePage,
  })),
);
const loadCapturePage = () => import("@/components/features/CapturePage");
const CapturePage = lazy(() => loadCapturePage().then((module) => ({ default: module.CapturePage })));
const loadTimerPage = () => import("@/components/features/TimerPage");
const TimerPage = lazy(() =>
  loadTimerPage().then((module) => ({ default: module.TimerPage })),
);

function readRoute(): AppRoute {
  const route = parseRoute(window.location.hash);
  // Old `#tasks` links and installed shortcuts now open the projects list.
  if (window.location.hash === "#tasks" || window.location.hash.startsWith("#tasks/")) history.replaceState(null, "", routeHash(route));
  return route;
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
  const { online, canEdit } = useConnectivity();
  const preferences = useAppPreferences();
  const userId = pb.authStore.record?.id ?? "anonymous";
  const [viewState, setViewState] = useWorkspacePreferences(userId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    loadSelectedTaskId,
  );
  const [route, setRoute] = useState<AppRoute>(readRoute);
  const page = route.page;
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
    isSaving,
    pending,
    syncState,
    retrySync,
  } = usePomodoroSession();
  const {
    tasks,
    createTask,
    setTaskDone,
    deleteTask,
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
  const currentSession = session;
  const wakeError = useFocusDevice(session?.mode === "running" && session.isActive);

  const completeSession = useCallback(
    async (completed: PomodoroSession) => {
      if (completed.mode !== "running") return true;
      const saved = await setSession({
        ...completed,
        mode: "complete",
        remainingSeconds: 0,
        isActive: false,
        lastTick: completed.lastTick + completed.remainingSeconds * 1000,
      });
      if (!saved) return false;
      if (preferences.sound) playCompletionSound();
      toast.success("Pomodoro complete.");
      setAppFeedback({ kind: "status", message: "Pomodoro complete." });
      return true;
    },
    [preferences.sound, setSession],
  );
  const remainingSeconds = useTimerClock(currentSession, completeSession);

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    saveSelectedTaskId(selectedTaskId);
  }, [selectedTaskId]);

  const navigateTo = useCallback((nextRoute: AppRoute) => {
    window.location.hash = routeHash(nextRoute);
    setRoute(nextRoute);
  }, []);
  const navigate = useCallback((nextPage: AppPage) => navigateTo({ page: nextPage, projectId: null }), [navigateTo]);
  const openProject = useCallback((projectId: string | null) => navigateTo({ page: "projects", projectId: projectId ?? NO_PROJECT_ID }), [navigateTo]);

  useEffect(() => {
    if (currentSession?.mode === "complete") {
      window.location.hash = "timer";
    }
  }, [currentSession?.mode]);

  const setDuration = useCallback((duration: number) =>
    setViewState((current) => ({
      ...current,
      lastDuration: Math.max(1, Math.min(60, duration)),
    })), [setViewState]);

  const startTimer = useCallback(async () => {
    if (preferences.sound) unlockCompletionSound();
    const duration = viewState.lastDuration;
    const saved = await setSession({
      id: createPocketBaseId(),
      taskId: selectedTask?.id ?? null,
      durationMinutes: duration,
      mode: "running",
      remainingSeconds: duration * 60,
      isActive: true,
      lastTick: Date.now(),
    });
    if (!saved) return;
    void navigator.storage?.persist?.().catch(() => undefined);
    setAppFeedback({ kind: "status", message: "Pomodoro started." });
    navigate("timer");
  }, [navigate, preferences.sound, selectedTask?.id, setSession, viewState.lastDuration]);

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

  const toggleTimer = useCallback(async () => {
    if (!currentSession || currentSession.mode !== "running") return;
    if (preferences.sound) unlockCompletionSound();
    const saved = await setSession({
      ...currentSession,
      remainingSeconds,
      isActive: !currentSession.isActive,
      lastTick: Date.now(),
    });
    if (!saved) return;
    setAppFeedback({
      kind: "status",
      message: currentSession.isActive ? "Pomodoro paused." : "Pomodoro resumed.",
    });
  }, [currentSession, preferences.sound, remainingSeconds, setSession]);

  const stopTimer = useCallback(async ({ saveElapsedTime, elapsedSeconds }: TimerStopOptions) => {
    if (!currentSession) return;
    if (saveElapsedTime && currentSession.taskId) {
      const saved = await setSession({
        ...currentSession,
        mode: "complete",
        remainingSeconds: Math.max(
          0,
          currentSession.durationMinutes * 60 - elapsedSeconds,
        ),
        isActive: false,
        lastTick: Date.now(),
      });
      if (!saved) return;
      setAppFeedback({
        kind: "status",
        message: "Focused time saved on this device. Session complete.",
      });
    } else {
      if (!(await setSession(null))) return;
      setAppFeedback({ kind: "status", message: "Pomodoro stopped." });
    }
  }, [currentSession, setSession]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      await deleteProject(projectId);
      reconcileDeletedProject(projectId);
      if (window.location.hash === projectHash(projectId)) navigate("projects");
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
  }, [deleteProject, navigate, reconcileDeletedProject]);

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
    if (nextPage === "projects") { void loadProjectsPage(); void loadProjectDetailPage(); }
    if (nextPage === "capture") void loadCapturePage();
  }, []);

  const handleNavigate = useCallback((nextPage: AppPage) => {
    if (nextPage === "timer" && !currentSession) setSelectedTaskId(null);
    navigate(nextPage);
  }, [currentSession, navigate]);

  const handleTimerTaskDone = useCallback(async () => {
    if (!sessionTask) return;
    await handleStatusChange(sessionTask.id, true);
    if (!(await setSession(null))) return;
    openProject(sessionTask.projectId);
  }, [handleStatusChange, openProject, sessionTask, setSession]);

  const handleFocusAgain = useCallback(async () => {
    if (!(await setSession(null))) return;
    setSelectedTaskId(sessionTask?.id ?? null);
  }, [sessionTask?.id, setSession]);

  const handleViewTasks = useCallback(async () => {
    if (!(await setSession(null))) return;
    if (sessionTask) openProject(sessionTask.projectId);
    else navigate("projects");
  }, [navigate, openProject, sessionTask, setSession]);

  if (isSessionLoading) {
    return <WorkspaceSkeleton />;
  }

  const loadError = tasksLoadError ?? projectsLoadError ?? categoriesLoadError ?? sessionLoadError;
  const timerMode = currentSession?.mode;

  return (
    <AppShell
      page={page}
      session={currentSession}
      remainingSeconds={remainingSeconds}
      onNavigate={handleNavigate}
      onNavigateIntent={handleNavigationIntent}
    >
      <PwaUpdate hasSession={currentSession?.mode === "running"} saving={isSaving} />
      {!online || !canEdit || pending.length > 0 || syncState.error || sessionLoadError ? <div className="app-notice" role="status">
        <p>{sessionLoadError ?? syncState.error ?? (!online ? "Offline. Timers work; your saved workspace is read-only." : !canEdit ? "Sign in again from Profile to sync and edit. Your timer still works." : syncState.syncing ? "Syncing your focus sessions…" : "Focus sessions saved on this device, waiting to sync.")}</p>
        {online && pending.length > 0 ? <Button variant="ghost" size="sm" disabled={syncState.syncing} onClick={retrySync}>Retry sync</Button> : null}
      </div> : null}
      {wakeError ? <p className="mb-3 text-sm text-muted-foreground" role="status">{wakeError}</p> : null}
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
      {page === "projects" ? (
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
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          {areTasksLoading || areProjectsLoading || areCategoriesLoading ? <Skeleton className="h-96 w-full" /> : route.projectId ? <ProjectDetailPage
            key={route.projectId}
            projectId={route.projectId}
            readOnly={!canEdit}
            tasks={tasks}
            projects={projects}
            categories={categories}
            viewState={viewState}
            setViewState={setViewState}
            canStartPomodoro={!currentSession}
            onCreateTask={createTask}
            onEditTask={editTask}
            onDeleteTask={handleDeleteTask}
            onStatusChange={handleStatusChange}
            onStartPomodoro={setUpTimerForTask}
            onCreateCategory={createCategory}
            onUpdateProject={updateProject}
            onArchiveProject={handleArchiveProject}
            onDeleteProject={handleDeleteProject}
          /> : <ProjectsPage
            readOnly={!canEdit}
            projects={projects}
            tasks={tasks}
            categories={categories}
            viewState={viewState}
            setViewState={setViewState}
            onCreateProject={createProject}
            onOpenProject={openProject}
            onUpdateCategory={updateCategory}
            onDeleteCategory={handleDeleteCategory}
          />}
          </Suspense>
        </div>
      ) : page === "capture" ? (
        <div className="screen-panel">
          <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
            <CapturePage readOnly={!canEdit} />
          </Suspense>
        </div>
      ) : page === "profile" ? (
        <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
          <ProfilePage
            pendingSessions={pending}
            syncState={syncState}
            onRetrySync={retrySync}
            tasks={tasks}
            openTaskId={profileTaskId}
            onOpenTask={setProfileTaskId}
          />
        </Suspense>
      ) : (
        <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
          <TimerPage
            isSaving={isSaving}
            canEdit={canEdit}
            syncPending={pending.some((operation) => operation.session.id === currentSession?.id)}
            session={currentSession}
            sessionTask={sessionTask}
            selectedTask={selectedTask}
            duration={viewState.lastDuration}
            remainingSeconds={remainingSeconds}
            onDurationChange={setDuration}
            onStart={startTimer}
            onToggle={toggleTimer}
            onStop={stopTimer}
            tasks={tasks}
            projects={projects}
            onSelectTask={setSelectedTaskId}
            onMarkTaskDone={handleTimerTaskDone}
            onFocusAgain={handleFocusAgain}
            onViewTasks={handleViewTasks}
          />
        </Suspense>
      )}
    </AppShell>
  );
}
