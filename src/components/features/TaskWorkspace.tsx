import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Folder,
  ListTodo,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  TimerReset,
  Trash2,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DesktopProjectNavigation,
  MobileProjectNavigation,
} from "@/components/features/ProjectNavigation";
import { ResponsiveOverlay } from "@/components/features/ResponsiveOverlay";
import { RichTextContent } from "@/components/features/RichTextContent";
import { TaskDetail } from "@/components/features/TaskDetail";
import { TaskEditor } from "@/components/features/TaskEditor";
import { cn } from "@/lib/utils";
import {
  buildWorkspaceIndex,
  PROJECT_TITLE_MAX_LENGTH,
  selectWorkspaceGroups,
  TASK_BATCH_SIZE,
  type TaskSort,
  type TaskStatusFilter,
  type WorkspaceViewState,
} from "@/lib/workspace";
import type { Project, Task } from "@/types/task";

const RichTextEditor = lazy(() =>
  import("@/components/features/RichTextEditor").then((module) => ({
    default: module.RichTextEditor,
  })),
);

interface TaskWorkspaceProps {
  tasks: Task[];
  projects: Project[];
  viewState: WorkspaceViewState;
  setViewState: Dispatch<SetStateAction<WorkspaceViewState>>;
  canStartPomodoro: boolean;
  onCreateTask: (title: string, projectId: string | null) => Promise<unknown>;
  onCreateProject: (
    title: string,
    description: string,
  ) => Promise<Project | null>;
  onUpdateProject: (
    projectId: string,
    title: string,
    description: string,
  ) => Promise<unknown>;
  onDeleteProject: (projectId: string) => Promise<unknown>;
  onArchiveProject: (projectId: string, archived: boolean) => Promise<unknown>;
  onStartPomodoro: (taskId: string) => void;
  onStatusChange: (taskId: string, isDone: boolean) => Promise<unknown>;
  onEditTask: (
    taskId: string,
    title: string,
    projectId: string | null,
  ) => Promise<unknown>;
  onDeleteTask: (taskId: string) => Promise<unknown>;
}

function formatFocusedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (seconds > 0 && minutes === 0) return "<1m focused";
  if (minutes < 60) return `${minutes}m focused`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m focused`;
}

function previewTitle(title: string) {
  const oneLine = title.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}…` : oneLine;
}

interface ProjectActionsMenuProps {
  project: Project;
  includeEdit?: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

function ProjectActionsMenu({
  project,
  includeEdit = true,
  onEdit,
  onArchive,
  onDelete,
  disabled = false,
}: ProjectActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for project ${project.title}`}
            disabled={disabled}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {includeEdit ? (
            <DropdownMenuItem onClick={onEdit} disabled={disabled}>
              <Pencil />
              Edit project
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onArchive} disabled={disabled}>
            {project.isDone ? <RotateCcw /> : <Archive />}
            {project.isDone ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={onDelete}
            disabled={disabled}
          >
            <Trash2 />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ProjectDescriptionProps {
  project: Project;
  expanded: boolean;
  onToggle: () => void;
}

function ProjectDescription({
  project,
  expanded,
  onToggle,
}: ProjectDescriptionProps) {
  if (!project.description) return null;

  const descriptionId = `project-description-${project.id}`;

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        aria-controls={descriptionId}
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronUp data-icon="inline-start" />
        ) : (
          <ChevronDown data-icon="inline-start" />
        )}
        {expanded ? "Hide" : "Show"} description
      </Button>
      {expanded ? (
        <div id={descriptionId} className="mt-2 rounded-xl bg-muted/50 p-3">
          <RichTextContent html={project.description} />
        </div>
      ) : null}
    </div>
  );
}

interface TaskFiltersProps {
  search: string;
  status: TaskStatusFilter;
  sort: TaskSort;
  includeProjects: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: TaskStatusFilter) => void;
  onSortChange: (value: TaskSort) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

function TaskFilters({
  search,
  status,
  sort,
  includeProjects,
  onSearchChange,
  onStatusChange,
  onSortChange,
  onClear,
  hasActiveFilters,
}: TaskFiltersProps) {
  const searchLabel = includeProjects
    ? "Search tasks and projects"
    : "Search tasks";
  const statusLabels: Record<TaskStatusFilter, string> = {
    open: "Open",
    completed: "Completed",
    all: "All statuses",
  };
  const sortLabels: Record<TaskSort, string> = {
    newest: "Newest",
    oldest: "Oldest",
    alphabetical: "A–Z",
    focused: "Most focused",
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="relative">
        <span className="sr-only">{searchLabel}</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchLabel}
          className="pl-9"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={statusLabels}
          value={status}
          onValueChange={(value) =>
            onStatusChange(value as TaskStatusFilter)
          }
        >
          <SelectTrigger aria-label="Task status" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={sortLabels}
          value={sort}
          onValueChange={(value) => onSortChange(value as TaskSort)}
        >
          <SelectTrigger aria-label="Sort tasks" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="alphabetical">A–Z</SelectItem>
              <SelectItem value="focused">Most focused</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        {hasActiveFilters ? (
          <Button type="button" variant="ghost" onClick={onClear}>
            <X data-icon="inline-start" />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function TaskWorkspace({
  tasks,
  projects,
  viewState,
  setViewState,
  canStartPomodoro,
  onCreateTask,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onArchiveProject,
  onStartPomodoro,
  onStatusChange,
  onEditTask,
  onDeleteTask,
}: TaskWorkspaceProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const projectTitleRef = useRef<HTMLInputElement>(null);
  const taskDetailTriggers = useRef(new Map<string, HTMLButtonElement>());
  const index = useMemo(
    () => buildWorkspaceIndex(projects, tasks),
    [projects, tasks],
  );
  const [search, setSearch] = useState("");
  const groups = useMemo(
    () => selectWorkspaceGroups(index, viewState, search),
    [index, search, viewState],
  );
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>(
    {},
  );
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
    new Set(),
  );
  const [editorTask, setEditorTask] = useState<Task | "new" | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [projectEditor, setProjectEditor] = useState<Project | "new" | null>(
    null,
  );
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectPending, setProjectPending] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());
  const [pendingProjectIds, setPendingProjectIds] = useState<Set<string>>(
    new Set(),
  );
  const [deleteProjectPending, setDeleteProjectPending] = useState(false);
  const [workspaceAnnouncement, setWorkspaceAnnouncement] = useState("");
  const [focusAfterDelete, setFocusAfterDelete] = useState<{
    deletedId: string;
    nextTaskId: string | null;
    groupId: string;
  } | null>(null);

  const detailTask = tasks.find((task) => task.id === detailTaskId) ?? null;
  const deleteTask = tasks.find((task) => task.id === deleteTaskId) ?? null;
  const deleteProject =
    projects.find((project) => project.id === deleteProjectId) ?? null;
  const activeProjects = index.activeProjects;
  const selectedProject = viewState.scope.startsWith("project:")
    ? (index.projectMap.get(viewState.scope.slice(8)) ?? null)
    : null;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const updateViewState = <K extends keyof WorkspaceViewState>(
    key: K,
    value: WorkspaceViewState[K],
  ) => setViewState((current) => ({ ...current, [key]: value }));

  const openProjectEditor = (project: Project) => {
    setProjectTitle(project.title);
    setProjectDescription(project.description);
    setProjectError(null);
    setProjectEditor(project);
  };

  const toggleProjectDescription = (projectId: string) => {
    setExpandedDescriptions((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const initialProjectId = viewState.scope.startsWith("project:")
    ? viewState.scope.slice(8)
    : null;
  const hasVisibleTasks = groups.some((group) => group.tasks.length > 0);
  const selectedGroup = selectedProject
    ? (groups.find((group) => group.id === selectedProject.id) ?? {
        ...index.groupMap.get(selectedProject.id)!,
        tasks: [],
      })
    : null;
  const visibleGroups = selectedGroup ? [selectedGroup] : groups;
  const matchingTaskCount = groups.reduce(
    (total, group) => total + group.tasks.length,
    0,
  );
  const hasActiveFilters =
    Boolean(search) || viewState.status !== "open" || viewState.sort !== "newest";

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setWorkspaceAnnouncement(
        `${matchingTaskCount} matching ${matchingTaskCount === 1 ? "task" : "tasks"}.`,
      );
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [matchingTaskCount, search, viewState.sort, viewState.status]);

  useEffect(() => {
    if (!focusAfterDelete) return;
    if (tasks.some((task) => task.id === focusAfterDelete.deletedId)) return;

    const frame = requestAnimationFrame(() => {
      const nextTask = focusAfterDelete.nextTaskId
        ? taskDetailTriggers.current.get(focusAfterDelete.nextTaskId)
        : null;
      const fallback = document.getElementById(
        `task-list-heading-${focusAfterDelete.groupId}`,
      );
      (nextTask ?? fallback ?? headingRef.current)?.focus({
        preventScroll: false,
      });
      setFocusAfterDelete(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusAfterDelete, tasks]);

  const updatePendingSet = (
    setter: Dispatch<SetStateAction<Set<string>>>,
    id: string,
    pending: boolean,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const runTaskMutation = async (
    taskId: string,
    action: () => Promise<unknown>,
    successMessage: string,
    failureMessage: string,
  ) => {
    if (pendingTaskIds.has(taskId)) return;
    updatePendingSet(setPendingTaskIds, taskId, true);
    try {
      await action();
      setWorkspaceAnnouncement(successMessage);
    } catch (error) {
      setWorkspaceAnnouncement(failureMessage);
      throw error;
    } finally {
      updatePendingSet(setPendingTaskIds, taskId, false);
    }
  };

  const runProjectMutation = async (
    projectId: string,
    action: () => Promise<unknown>,
    successMessage: string,
    failureMessage: string,
  ) => {
    if (pendingProjectIds.has(projectId)) return;
    updatePendingSet(setPendingProjectIds, projectId, true);
    try {
      await action();
      setWorkspaceAnnouncement(successMessage);
    } catch (error) {
      setWorkspaceAnnouncement(failureMessage);
      throw error;
    } finally {
      updatePendingSet(setPendingProjectIds, projectId, false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setViewState((current) => ({
      ...current,
      status: "open",
      sort: "newest",
    }));
    setWorkspaceAnnouncement("Task filters cleared.");
  };

  const handleProjectSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const title = projectTitle.trim();
    if (!title || title.length > PROJECT_TITLE_MAX_LENGTH) {
      setProjectError("Enter a project name up to 120 characters.");
      projectTitleRef.current?.focus();
      return;
    }
    setProjectPending(true);
    setProjectError(null);
    try {
      if (projectEditor === "new") {
        const project = await onCreateProject(title, projectDescription);
        if (project) updateViewState("scope", `project:${project.id}`);
      } else if (projectEditor) {
        await onUpdateProject(projectEditor.id, title, projectDescription);
      }
      setProjectEditor(null);
      setProjectTitle("");
      setProjectDescription("");
      setWorkspaceAnnouncement(
        projectEditor === "new" ? "Project created." : "Project saved.",
      );
    } catch (error) {
      setProjectError(
        error instanceof Error
          ? error.message
          : "The project could not be saved.",
      );
      projectTitleRef.current?.focus();
    } finally {
      setProjectPending(false);
    }
  };

  return (
    <div className="grid w-full items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {workspaceAnnouncement}
      </p>
      <div className="flex items-center justify-between gap-3 lg:col-span-2">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
        >
          Tasks
        </h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setProjectTitle("");
              setProjectDescription("");
              setProjectError(null);
              setProjectEditor("new");
            }}
          >
            <Folder data-icon="inline-start" />
            <span className="hidden sm:inline">New project</span>
          </Button>
          <Button type="button" onClick={() => setEditorTask("new")}>
            <Plus data-icon="inline-start" />
            New task
          </Button>
        </div>
      </div>

      <DesktopProjectNavigation
        index={index}
        scope={viewState.scope}
        onScopeChange={(scope) => updateViewState("scope", scope)}
      />

      <div className="min-w-0">
        {selectedProject ? (
          <Card className="mb-4">
            <CardHeader className="items-center">
              <div className="flex min-w-0 items-center gap-2">
                <Folder aria-hidden="true" />
                <CardTitle className="truncate">
                  {selectedProject.title}
                </CardTitle>
                {selectedProject.isDone ? (
                  <Badge variant="outline">Archived</Badge>
                ) : null}
              </div>
              <CardAction className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openProjectEditor(selectedProject)}
                  aria-label="Edit project"
                  disabled={pendingProjectIds.has(selectedProject.id)}
                >
                  <Pencil data-icon="inline-start" />
                  <span className="hidden sm:inline">Edit project</span>
                </Button>
                <ProjectActionsMenu
                  project={selectedProject}
                  includeEdit={false}
                  onEdit={() => openProjectEditor(selectedProject)}
                  onArchive={() =>
                    void runProjectMutation(
                      selectedProject.id,
                      () =>
                        onArchiveProject(
                          selectedProject.id,
                          !selectedProject.isDone,
                        ),
                      selectedProject.isDone
                        ? "Project restored."
                        : "Project archived.",
                      "Project could not be updated.",
                    ).catch(() => undefined)
                  }
                  onDelete={() => setDeleteProjectId(selectedProject.id)}
                  disabled={pendingProjectIds.has(selectedProject.id)}
                />
                <MobileProjectNavigation
                  index={index}
                  scope={viewState.scope}
                  onScopeChange={(scope) => updateViewState("scope", scope)}
                />
              </CardAction>
            </CardHeader>
            {selectedProject.description ? (
              <CardContent>
                <ProjectDescription
                  project={selectedProject}
                  expanded={expandedDescriptions.has(selectedProject.id)}
                  onToggle={() =>
                    toggleProjectDescription(selectedProject.id)
                  }
                />
              </CardContent>
            ) : null}
          </Card>
        ) : (
          <Card className="mb-4">
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>
                    {viewState.scope === "all"
                      ? viewState.status === "open"
                        ? "All open tasks"
                        : "All tasks"
                      : "Archived projects"}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {matchingTaskCount} matching tasks
                  </p>
                </div>
                <MobileProjectNavigation
                  index={index}
                  scope={viewState.scope}
                  onScopeChange={(scope) => updateViewState("scope", scope)}
                />
              </div>
              <TaskFilters
                search={search}
                status={viewState.status}
                sort={viewState.sort}
                includeProjects
                onSearchChange={setSearch}
                onStatusChange={(status) => updateViewState("status", status)}
                onSortChange={(sort) => updateViewState("sort", sort)}
                onClear={clearFilters}
                hasActiveFilters={hasActiveFilters}
              />
            </CardHeader>
          </Card>
        )}

        {!canStartPomodoro && hasVisibleTasks ? (
          <p
            id="active-session-explanation"
            className="mb-4 rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
            role="status"
          >
            Another focus session is already in progress. View or finish it
            before starting a task.
          </p>
        ) : null}

        {!selectedProject && (groups.length === 0 || !hasVisibleTasks) ? (
          <Card>
            <CardContent>
              <Empty className="min-h-80">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>No matching tasks</EmptyTitle>
                  <EmptyDescription>
                    Adjust the search or filters, or create a new task.
                  </EmptyDescription>
                </EmptyHeader>
                <Button type="button" onClick={() => setEditorTask("new")}>
                  <Plus data-icon="inline-start" />
                  New task
                </Button>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleGroups.map((group) => {
              const shown = visibleCounts[group.id] ?? TASK_BATCH_SIZE;
              const visibleTasks = group.tasks.slice(0, shown);
              const GroupIcon = selectedProject
                ? ListTodo
                : group.project
                  ? Folder
                  : ListTodo;
              return (
                <Card key={group.id} size="sm">
                  <CardHeader className="items-center">
                    <div className="flex min-w-0 items-center gap-2">
                      <GroupIcon aria-hidden="true" />
                      <CardTitle className="truncate">
                        <span
                          id={`task-list-heading-${group.id}`}
                          tabIndex={-1}
                          className="rounded-sm outline-none"
                        >
                          {selectedProject
                            ? "Tasks"
                            : (group.project?.title ?? "No project")}
                        </span>
                      </CardTitle>
                      <Badge variant="outline">{group.tasks.length}</Badge>
                    </div>
                    <CardAction className="flex items-center gap-2">
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {formatFocusedTime(group.focusedSeconds)}
                      </span>
                      {!selectedProject && group.project ? (
                        <ProjectActionsMenu
                          project={group.project}
                          onEdit={() => openProjectEditor(group.project!)}
                          onArchive={() =>
                            void runProjectMutation(
                              group.project!.id,
                              () =>
                                onArchiveProject(
                                  group.project!.id,
                                  !group.project!.isDone,
                                ),
                              group.project!.isDone
                                ? "Project restored."
                                : "Project archived.",
                              "Project could not be updated.",
                            ).catch(() => undefined)
                          }
                          onDelete={() =>
                            setDeleteProjectId(group.project!.id)
                          }
                          disabled={pendingProjectIds.has(group.project.id)}
                        />
                      ) : null}
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {selectedProject ? (
                      <TaskFilters
                        search={search}
                        status={viewState.status}
                        sort={viewState.sort}
                        includeProjects={false}
                        onSearchChange={setSearch}
                        onStatusChange={(status) =>
                          updateViewState("status", status)
                        }
                        onSortChange={(sort) =>
                          updateViewState("sort", sort)
                        }
                        onClear={clearFilters}
                        hasActiveFilters={hasActiveFilters}
                      />
                    ) : null}
                    {!selectedProject && group.project ? (
                      <ProjectDescription
                        project={group.project}
                        expanded={expandedDescriptions.has(group.id)}
                        onToggle={() => toggleProjectDescription(group.id)}
                      />
                    ) : null}
                    {selectedProject && visibleTasks.length === 0 ? (
                      <Empty className="min-h-64">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <ListTodo />
                          </EmptyMedia>
                          <EmptyTitle>No matching tasks</EmptyTitle>
                          <EmptyDescription>
                            Adjust the task filters or create a new task in this
                            project.
                          </EmptyDescription>
                        </EmptyHeader>
                        <Button
                          type="button"
                          onClick={() => setEditorTask("new")}
                        >
                          <Plus data-icon="inline-start" />
                          New task
                        </Button>
                      </Empty>
                    ) : (
                      <ul
                        className="flex flex-col gap-1"
                        aria-label={`Tasks in ${group.project?.title ?? "No project"}`}
                      >
                        {visibleTasks.map((task) => {
                          const accessibleTitle = previewTitle(task.title);
                          const isPending = pendingTaskIds.has(task.id);
                          return (
                            <li
                              key={task.id}
                              className="group flex items-start gap-2 rounded-xl border border-transparent p-3 hover:bg-muted/50"
                              aria-busy={isPending}
                            >
                              <Checkbox
                                checked={task.isDone}
                                onCheckedChange={() =>
                                  void runTaskMutation(
                                    task.id,
                                    () =>
                                      onStatusChange(task.id, !task.isDone),
                                    task.isDone
                                      ? `${accessibleTitle} reopened.`
                                      : `${accessibleTitle} completed.`,
                                    task.isDone
                                      ? `${accessibleTitle} could not be reopened.`
                                      : `${accessibleTitle} could not be completed.`,
                                  ).catch(() => undefined)
                                }
                                aria-label={
                                  task.isDone
                                    ? `Reopen ${accessibleTitle}`
                                    : `Mark ${accessibleTitle} complete`
                                }
                                className="mt-0.5"
                                disabled={isPending}
                              />
                              <button
                                ref={(node) => {
                                  if (node) taskDetailTriggers.current.set(task.id, node);
                                  else taskDetailTriggers.current.delete(task.id);
                                }}
                                type="button"
                                className="min-h-6 min-w-0 flex-1 rounded-md text-left"
                                onClick={() => setDetailTaskId(task.id)}
                                aria-label={`Open details for ${accessibleTitle}`}
                                disabled={isPending}
                              >
                                <span
                                  className={cn(
                                    "task-preview line-clamp-3 whitespace-pre-wrap break-words text-sm font-medium",
                                    task.isDone &&
                                      "text-muted-foreground line-through",
                                  )}
                                >
                                  {task.title}
                                </span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {formatFocusedTime(task.focusedSeconds)}
                                </span>
                              </button>
                              {!task.isDone ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => onStartPomodoro(task.id)}
                                  disabled={!canStartPomodoro || isPending}
                                  aria-label={`Focus on ${accessibleTitle}`}
                                  aria-describedby={
                                    !canStartPomodoro
                                      ? "active-session-explanation"
                                      : undefined
                                  }
                                >
                                  <TimerReset data-icon="inline-start" />
                                  <span className="hidden sm:inline">Focus</span>
                                </Button>
                              ) : null}
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={`Actions for ${accessibleTitle}`}
                                      disabled={isPending}
                                    />
                                  }
                                >
                                  <MoreHorizontal />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuGroup>
                                    <DropdownMenuItem
                                      onClick={() => setEditorTask(task)}
                                    >
                                      <Pencil />
                                      Edit or move {accessibleTitle}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() => setDeleteTaskId(task.id)}
                                    >
                                      <Trash2 />
                                      Delete {accessibleTitle}
                                    </DropdownMenuItem>
                                  </DropdownMenuGroup>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {shown < group.tasks.length ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 w-full"
                        onClick={() => {
                          const nextShown = Math.min(
                            shown + TASK_BATCH_SIZE,
                            group.tasks.length,
                          );
                          setVisibleCounts((current) => ({
                            ...current,
                            [group.id]: nextShown,
                          }));
                          setWorkspaceAnnouncement(
                            `${nextShown - shown} more tasks shown. ${nextShown} of ${group.tasks.length} tasks visible.`,
                          );
                        }}
                      >
                        Show 25 more
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ResponsiveOverlay
        open={editorTask !== null}
        onOpenChange={(open) => !open && setEditorTask(null)}
        title={editorTask === "new" ? "New task" : "Edit task"}
        description="Task text can include line breaks and up to 2,000 characters."
      >
        {editorTask ? (
          <TaskEditor
            task={editorTask === "new" ? undefined : editorTask}
            projects={activeProjects}
            initialProjectId={initialProjectId}
            onCancel={() => setEditorTask(null)}
            onSave={async (title, projectId) => {
              if (editorTask === "new") {
                await onCreateTask(title, projectId);
                setWorkspaceAnnouncement("Task created.");
              } else {
                const taskId = editorTask.id;
                await runTaskMutation(
                  taskId,
                  () => onEditTask(taskId, title, projectId),
                  "Task saved.",
                  "Task could not be saved.",
                );
              }
              setEditorTask(null);
            }}
          />
        ) : null}
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={Boolean(detailTask)}
        onOpenChange={(open) => !open && setDetailTaskId(null)}
        title="Task details"
        description="Full task text and focus information."
      >
        {detailTask ? (
          <TaskDetail
            task={detailTask}
            project={
              detailTask.projectId
                ? index.projectMap.get(detailTask.projectId)
                : undefined
            }
            canFocus={canStartPomodoro}
            isPending={pendingTaskIds.has(detailTask.id)}
            onEdit={() => {
              setDetailTaskId(null);
              setEditorTask(detailTask);
            }}
            onFocus={() => onStartPomodoro(detailTask.id)}
            onDelete={() => {
              setDetailTaskId(null);
              setDeleteTaskId(detailTask.id);
            }}
          />
        ) : null}
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={projectEditor !== null}
        onOpenChange={(open) => !open && setProjectEditor(null)}
        title={projectEditor === "new" ? "New project" : "Edit project"}
        description="Name the project and add optional formatted context."
      >
        {projectEditor ? (
          <form
            onSubmit={handleProjectSubmit}
            className="flex flex-col gap-5"
            aria-busy={projectPending}
          >
            <FieldGroup>
              <Field data-invalid={Boolean(projectError)}>
                <FieldLabel htmlFor="project-title">Project name</FieldLabel>
                <Input
                  ref={projectTitleRef}
                  id="project-title"
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  maxLength={PROJECT_TITLE_MAX_LENGTH}
                  autoFocus
                  required
                  aria-invalid={Boolean(projectError)}
                  aria-describedby={
                    projectError ? "project-title-error" : undefined
                  }
                  disabled={projectPending}
                />
                <FieldError id="project-title-error">
                  {projectError}
                </FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="project-description">
                  Description
                </FieldLabel>
                <Suspense
                  fallback={
                    <p className="text-sm text-muted-foreground">
                      Loading editor…
                    </p>
                  }
                >
                  <RichTextEditor
                    id="project-description"
                    value={projectDescription}
                    onChange={setProjectDescription}
                    disabled={projectPending}
                    ariaDescribedBy="project-description-help"
                  />
                </Suspense>
                <FieldDescription id="project-description-help">
                  Optional. Add headings, emphasis, lists, quotes, and links.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <Button
              type="submit"
              disabled={!projectTitle.trim() || projectPending}
            >
              {projectPending ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : null}
              {projectPending ? "Saving…" : "Save project"}
            </Button>
          </form>
        ) : null}
      </ResponsiveOverlay>

      <AlertDialog
        open={Boolean(deleteTask)}
        onOpenChange={(open) => !open && setDeleteTaskId(null)}
      >
        <AlertDialogContent aria-busy={Boolean(deleteTask && pendingTaskIds.has(deleteTask.id))}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTask
                ? `${previewTitle(deleteTask.title)} and its focus total will be permanently removed.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={Boolean(deleteTask && pendingTaskIds.has(deleteTask.id))}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(deleteTask && pendingTaskIds.has(deleteTask.id))}
              onClick={async (event) => {
                event.preventDefault();
                if (!deleteTask) return;
                const visibleTaskIds = visibleGroups.flatMap((group) =>
                  group.tasks.map((task) => task.id),
                );
                const currentIndex = visibleTaskIds.indexOf(deleteTask.id);
                const nextTaskId =
                  visibleTaskIds[currentIndex + 1] ??
                  visibleTaskIds[currentIndex - 1] ??
                  null;
                const groupId =
                  visibleGroups.find((group) =>
                    group.tasks.some((task) => task.id === deleteTask.id),
                  )?.id ?? visibleGroups[0]?.id ?? "unassigned";

                try {
                  await runTaskMutation(
                    deleteTask.id,
                    () => onDeleteTask(deleteTask.id),
                    `${previewTitle(deleteTask.title)} deleted.`,
                    `${previewTitle(deleteTask.title)} could not be deleted.`,
                  );
                  setFocusAfterDelete({
                    deletedId: deleteTask.id,
                    nextTaskId,
                    groupId,
                  });
                  setDeleteTaskId(null);
                } catch {
                  // Keep the confirmation open so the user can retry or cancel.
                }
              }}
            >
              {deleteTask && pendingTaskIds.has(deleteTask.id)
                ? "Deleting…"
                : "Delete task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteProject)}
        onOpenChange={(open) => !open && setDeleteProjectId(null)}
      >
        <AlertDialogContent aria-busy={deleteProjectPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              The project will be permanently deleted. Its tasks will remain in
              the workspace without a project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteProjectPending}
              onClick={async (event) => {
                event.preventDefault();
                if (!deleteProject) return;
                setDeleteProjectPending(true);
                try {
                  await runProjectMutation(
                    deleteProject.id,
                    () => onDeleteProject(deleteProject.id),
                    "Project deleted.",
                    "Project could not be deleted.",
                  );
                  setDeleteProjectId(null);
                } catch {
                  // Keep the confirmation open so the user can retry or cancel.
                } finally {
                  setDeleteProjectPending(false);
                }
              }}
            >
              {deleteProjectPending ? "Deleting…" : "Delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
