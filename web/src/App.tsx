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
import { useHabitReminder } from "@/hooks/useHabitReminder";
import { useCaptureReminders } from "@/hooks/useCaptureReminders";
import { useHabits } from "@/hooks/useHabits";
import { useAppPreferences } from "@/hooks/useAppPreferences";
import { notifyCompletion, playCompletionSound, requestCompletionNotifications, unlockCompletionSound, useFocusDevice } from "@/hooks/useFocusDevice";
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
import { useCaptures, type CaptureStore } from "@/hooks/useCaptures";
import { useCategories } from "@/hooks/useCategories";
import { useKnowledge } from "@/hooks/useKnowledge";
import { useTasks } from "@/hooks/useTasks";
import { useTimerClock } from "@/hooks/useTimerClock";
import { useWorkspacePreferences } from "@/hooks/useWorkspacePreferences";
import { createPocketBaseId } from "@/lib/pocketbase-records";
import { pb } from "@/lib/pocketbase";
import {
  loadSelectedTaskId,
  saveSelectedTaskId,
} from "@/lib/selection-storage";
import { captureDisplayTitle } from "@/lib/capture";
import { knowledgeBySource } from "@/lib/knowledge";
import { dueKnowledge } from "@/lib/review";
import { knowledgeHash, KNOWLEDGE_REVIEW_ID, parseRoute, projectHash, routeHash, type AppPage, type AppRoute } from "@/lib/routes";
import { getProjectStatus, isProjectArchived, NO_PROJECT_ID, PROJECT_TITLE_MAX_LENGTH } from "@/lib/workspace";
import type { Capture, CaptureInput } from "@/types/capture";
import type { Knowledge, KnowledgeInput } from "@/types/knowledge";
import type { PomodoroSession, ProjectInput } from "@/types/task";

const loadProfilePage = () => import("@/components/features/ProfilePage");
const loadHabitsPage = () => import("@/components/features/HabitsPage");
const loadCalendarPage = () => import("@/components/features/CalendarPage");
const CalendarPage = lazy(() => loadCalendarPage().then((module) => ({ default: module.CalendarPage })));
const HabitsPage = lazy(() => loadHabitsPage().then((module) => ({ default: module.HabitsPage })));
const loadProjectsPage = () => import("@/components/features/ProjectsPage");
const ProjectsPage = lazy(() => loadProjectsPage().then((module) => ({ default: module.ProjectsPage })));
const loadProjectDetailPage = () => import("@/components/features/ProjectDetailPage");
const ProjectDetailPage = lazy(() => loadProjectDetailPage().then((module) => ({ default: module.ProjectDetailPage })));
const ProfilePage = lazy(() =>
  loadProfilePage().then((module) => ({
    default: module.ProfilePage,
  })),
);
const ProjectCaptures = lazy(() => import("@/components/features/ProjectCaptures").then((module) => ({ default: module.ProjectCaptures })));
const loadCapturePage = () => import("@/components/features/CapturePage");
const CapturePage = lazy(() => loadCapturePage().then((module) => ({ default: module.CapturePage })));
const loadKnowledgePage = () => import("@/components/features/KnowledgePage");
const KnowledgePage = lazy(() => loadKnowledgePage().then((module) => ({ default: module.KnowledgePage })));
const loadKnowledgeDetailPage = () => import("@/components/features/KnowledgeDetailPage");
const KnowledgeDetailPage = lazy(() => loadKnowledgeDetailPage().then((module) => ({ default: module.KnowledgeDetailPage })));
const KnowledgeReviewPage = lazy(() => import("@/components/features/KnowledgeReviewPage").then((module) => ({ default: module.KnowledgeReviewPage })));
const KnowledgeComposer = lazy(() => import("@/components/features/KnowledgeComposer").then((module) => ({ default: module.KnowledgeComposer })));
const BreakReview = lazy(() => import("@/components/features/BreakReview").then((module) => ({ default: module.BreakReview })));
const ProjectCompletionDialog = lazy(() => import("@/components/features/ProjectCompletionDialog").then((module) => ({ default: module.ProjectCompletionDialog })));
const ProjectKnowledge = lazy(() => import("@/components/features/ProjectKnowledge").then((module) => ({ default: module.ProjectKnowledge })));
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
  useHabitReminder(userId);
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
    changeProjectCaptures,
    setCaptureProjects,
    reconcileDeletedCapture,
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

  const knowledgeStore = useKnowledge();
  const { knowledge, createKnowledge, updateKnowledge, reviewKnowledge } = knowledgeStore;
  const notesBySource = useMemo(() => knowledgeBySource(knowledge), [knowledge]);
  const dueNotes = useMemo(() => dueKnowledge(knowledge), [knowledge]);
  /** The note being edited, or the prefilled fields of a new one. */
  const [composer, setComposer] = useState<{ note?: Knowledge; defaults?: Partial<KnowledgeInput> } | null>(null);
  const [completedProjectId, setCompletedProjectId] = useState<string | null>(null);

  const captures = useCaptures();
  const habitStore = useHabits();
  useCaptureReminders(userId, captures.captures, captures.isLoading);
  const { deleteCapture, createCapture, setCaptureProcessed } = captures;
  const reconcileKnowledgeCapture = knowledgeStore.reconcileDeletedCapture;
  const captureStore = useMemo<CaptureStore>(() => ({
    ...captures,
    deleteCapture: async (id: string) => {
      const deleted = await deleteCapture(id);
      if (deleted) { reconcileDeletedCapture(id); reconcileKnowledgeCapture(id); }
      return deleted;
    },
  }), [captures, deleteCapture, reconcileDeletedCapture, reconcileKnowledgeCapture]);
  const captureIds = useMemo(() => new Set(captures.captures.map((capture) => capture.id)), [captures.captures]);

  const organizeCapture = useCallback(async (captureId: string, projectIds: string[], markProcessed: boolean) => {
    await setCaptureProjects(captureId, projectIds);
    if (markProcessed) await setCaptureProcessed(captureId, true);
  }, [setCaptureProcessed, setCaptureProjects]);
  const addCapturesToProject = useCallback(async (projectId: string, ids: string[], markProcessed: boolean) => {
    await changeProjectCaptures(projectId, ids, []);
    if (!markProcessed) return;
    const inbox = captures.captures.filter((capture) => ids.includes(capture.id) && !capture.isProcessed);
    await Promise.all(inbox.map((capture) => setCaptureProcessed(capture.id, true)));
  }, [captures.captures, changeProjectCaptures, setCaptureProcessed]);
  const removeCaptureFromProject = useCallback((projectId: string, captureId: string) => changeProjectCaptures(projectId, [], [captureId]), [changeProjectCaptures]);
  const captureToProject = useCallback(async (projectId: string, input: CaptureInput) => {
    const saved = await createCapture(input, { isProcessed: true });
    await changeProjectCaptures(projectId, [saved.id], []);
  }, [changeProjectCaptures, createCapture]);

  const startProjectFromCapture = useCallback(async (capture: Capture) => {
    const title = captureDisplayTitle(capture);
    const project = await createProject({ title: (capture.kind === "book" ? `Read ${title}` : title).slice(0, PROJECT_TITLE_MAX_LENGTH), description: "", status: "active", dueDate: null });
    if (!project) return;
    await changeProjectCaptures(project.id, [capture.id], []);
    window.location.hash = projectHash(project.id);
  }, [changeProjectCaptures, createProject]);

  const composeKnowledge = useCallback((defaults: Partial<KnowledgeInput> = {}) => setComposer({ defaults }), []);
  /** A new note from a capture inherits the capture's project when it's in exactly one. */
  const distillCapture = useCallback((capture: Capture) => {
    const containing = projects.filter((project) => project.captureIds?.includes(capture.id) && !isProjectArchived(project));
    composeKnowledge({ sourceIds: [capture.id], projectId: containing.length === 1 ? containing[0].id : null });
  }, [composeKnowledge, projects]);
  const editingNote = composer?.note;
  const saveComposer = useCallback(async (input: KnowledgeInput) => {
    if (editingNote) {
      await updateKnowledge(editingNote.id, input);
      setComposer(null);
      toast.success("Knowledge updated.");
      return;
    }
    const saved = await createKnowledge(input);
    setComposer(null);
    toast.success("Knowledge saved.", { action: { label: "Open", onClick: () => { window.location.hash = knowledgeHash(saved.id); } } });
  }, [createKnowledge, editingNote, updateKnowledge]);

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
      notifyCompletion(completed.taskId ? `${completed.durationMinutes} minutes of focus saved.` : "Time for a break.");
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
    requestCompletionNotifications();
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
      knowledgeStore.reconcileDeletedProject(projectId);
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
  }, [deleteProject, knowledgeStore, navigate, reconcileDeletedProject]);

  const handleStatusChange = useCallback(async (taskId: string, isDone: boolean) => {
    try {
      await setTaskDone(taskId, isDone);
      if (isDone && selectedTaskId === taskId) setSelectedTaskId(null);
      if (isDone && session?.taskId === taskId) {
        setSession((current) => (current?.mode === "running" ? { ...current, taskId: null } : current));
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
        setSession((current) => (current?.mode === "running" ? { ...current, taskId: null } : current));
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
    knowledgeStore.reconcileDeletedCategory(categoryId);
    if (viewState.categoryId === categoryId) setViewState((current) => ({ ...current, categoryId: null }));
    toast.success("Category deleted. Affected tasks are now uncategorized.");
  }, [deleteCategory, knowledgeStore, reconcileDeletedCategory, setViewState, viewState.categoryId]);

  /** Completing a project asks what it taught you. */
  const handleUpdateProject = useCallback(async (projectId: string, input: ProjectInput) => {
    const previous = projectMap.get(projectId);
    const saved = await updateProject(projectId, input);
    if (saved && previous && input.status === "completed" && getProjectStatus(previous) !== "completed") setCompletedProjectId(projectId);
    return saved;
  }, [projectMap, updateProject]);
  const completedProject = completedProjectId ? projectMap.get(completedProjectId) ?? null : null;
  const completedUnprocessed = useMemo(() => {
    const ids = new Set(completedProject?.captureIds ?? []);
    return captures.captures.filter((capture) => ids.has(capture.id) && !capture.isProcessed);
  }, [captures.captures, completedProject?.captureIds]);
  const finishCompletedProject = useCallback(async ({ writeKnowledge, markProcessed }: { writeKnowledge: boolean; markProcessed: boolean }) => {
    if (!completedProjectId) return;
    if (markProcessed) {
      const failed = (await Promise.allSettled(completedUnprocessed.map((capture) => setCaptureProcessed(capture.id, true)))).find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
    }
    setCompletedProjectId(null);
    if (writeKnowledge) composeKnowledge({ projectId: completedProjectId });
  }, [completedProjectId, completedUnprocessed, composeKnowledge, setCaptureProcessed]);

  const handleNavigationIntent = useCallback((nextPage: AppPage) => {
    if (nextPage === "timer") void loadTimerPage();
    if (nextPage === "profile") void loadProfilePage();
    if (nextPage === "habits") void loadHabitsPage();
    if (nextPage === "calendar") void loadCalendarPage();
    if (nextPage === "projects") { void loadProjectsPage(); void loadProjectDetailPage(); }
    if (nextPage === "capture") void loadCapturePage();
    if (nextPage === "knowledge") { void loadKnowledgePage(); void loadKnowledgeDetailPage(); }
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

  const loadError = tasksLoadError ?? projectsLoadError ?? categoriesLoadError ?? captures.loadError ?? knowledgeStore.loadError ?? sessionLoadError;
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
            onUpdateProject={handleUpdateProject}
            onArchiveProject={handleArchiveProject}
            onDeleteProject={handleDeleteProject}
            captureCount={(projectMap.get(route.projectId)?.captureIds ?? []).filter((id) => captureIds.has(id)).length}
            capturesPanel={projectMap.has(route.projectId) ? <Suspense fallback={<Skeleton className="h-72 w-full" />}>
              <ProjectCaptures project={projectMap.get(route.projectId)!} store={captureStore} projects={projects} readOnly={!canEdit}
                onOrganize={organizeCapture} onAddCaptures={addCapturesToProject} onRemoveCapture={removeCaptureFromProject} onCaptureToProject={captureToProject}
                knowledgeBySource={notesBySource} onDistill={distillCapture} />
            </Suspense> : undefined}
            knowledgeCount={knowledge.filter((note) => note.projectId === route.projectId || note.linkedProjectIds.includes(route.projectId!)).length}
            knowledgePanel={projectMap.has(route.projectId) ? <Suspense fallback={<Skeleton className="h-72 w-full" />}>
              <ProjectKnowledge project={projectMap.get(route.projectId)!} store={knowledgeStore} projects={projects} readOnly={!canEdit} onCompose={() => composeKnowledge({ projectId: route.projectId })} />
            </Suspense> : undefined}
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
            captureIds={captures.isLoading ? undefined : captureIds}
          />}
          </Suspense>
        </div>
      ) : page === "capture" ? (
        <div className="screen-panel">
          <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
            <CapturePage readOnly={!canEdit} store={captureStore} projects={projects} onOrganize={organizeCapture}
              knowledgeBySource={notesBySource} onDistill={distillCapture} onStartProject={startProjectFromCapture} />
          </Suspense>
        </div>
      ) : page === "habits" ? (
        <Suspense fallback={<Skeleton className="h-72 w-full" />}><HabitsPage key={userId} store={habitStore} /></Suspense>
      ) : page === "calendar" ? (
        <Suspense fallback={<Skeleton className="h-96 w-full" />}><CalendarPage key={userId} projects={projects} tasks={tasks} categories={categories} captureStore={captureStore} habitStore={habitStore}
          readOnly={!canEdit} loading={areTasksLoading || areProjectsLoading || captures.isLoading} loadError={loadError}
          selectedDay={route.calendarDay} captureId={route.captureId} onSelect={(calendarDay, captureId) => navigateTo({ page: "calendar", projectId: null, calendarDay, captureId })}
          onTaskDone={handleStatusChange} onEditTask={editTask} onEditProject={handleUpdateProject} onCreateCategory={createCategory} /></Suspense>
      ) : page === "knowledge" ? (
        <div className="screen-panel">
          <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
            {route.knowledgeId === KNOWLEDGE_REVIEW_ID ? <KnowledgeReviewPage readOnly={!canEdit} store={knowledgeStore} />
              : route.knowledgeId ? <KnowledgeDetailPage key={route.knowledgeId} knowledgeId={route.knowledgeId} readOnly={!canEdit} store={knowledgeStore} projects={projects} captures={captures.captures} categories={categories}
                onEdit={(note) => setComposer({ note })} onDeleted={() => navigate("knowledge")} />
              : <KnowledgePage readOnly={!canEdit} store={knowledgeStore} projects={projects} captures={captures.captures} categories={categories} onCompose={() => composeKnowledge()} />}
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
            breakContent={preferences.reviewAfterSession && dueNotes[0] ? <Suspense fallback={null}><BreakReview note={dueNotes[0]} dueCount={dueNotes.length} readOnly={!canEdit}
              onReview={(remembered) => reviewKnowledge(dueNotes[0].id, remembered)} /></Suspense> : undefined}
          />
        </Suspense>
      )}
      <Suspense fallback={null}>
        {composer ? <KnowledgeComposer note={composer.note} defaults={composer.defaults} projects={projects} captures={captures.captures} categories={categories}
          onClose={() => setComposer(null)} onSave={saveComposer} /> : null}
        {completedProject ? <ProjectCompletionDialog key={completedProject.id} project={completedProject} unprocessedCaptureCount={completedUnprocessed.length}
          draftCount={knowledge.filter((note) => note.projectId === completedProject.id && note.status === "draft").length}
          onClose={() => setCompletedProjectId(null)} onFinish={finishCompletedProject} /> : null}
      </Suspense>
    </AppShell>
  );
}
