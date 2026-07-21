import {
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  Archive,
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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

interface TaskWorkspaceProps {
  tasks: Task[];
  projects: Project[];
  viewState: WorkspaceViewState;
  setViewState: Dispatch<SetStateAction<WorkspaceViewState>>;
  canStartPomodoro: boolean;
  onCreateTask: (title: string, projectId: string | null) => Promise<unknown>;
  onCreateProject: (title: string) => Promise<Project | null>;
  onRenameProject: (projectId: string, title: string) => Promise<unknown>;
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

export function TaskWorkspace({
  tasks,
  projects,
  viewState,
  setViewState,
  canStartPomodoro,
  onCreateTask,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onArchiveProject,
  onStartPomodoro,
  onStatusChange,
  onEditTask,
  onDeleteTask,
}: TaskWorkspaceProps) {
  const index = useMemo(
    () => buildWorkspaceIndex(projects, tasks),
    [projects, tasks],
  );
  const [search, setSearch] = useState("");
  const groups = useMemo(
    () => selectWorkspaceGroups(index, viewState, search),
    [index, search, viewState],
  );
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [editorTask, setEditorTask] = useState<Task | "new" | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [projectEditor, setProjectEditor] = useState<Project | "new" | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectPending, setProjectPending] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  const detailTask = tasks.find((task) => task.id === detailTaskId) ?? null;
  const deleteTask = tasks.find((task) => task.id === deleteTaskId) ?? null;
  const deleteProject =
    projects.find((project) => project.id === deleteProjectId) ?? null;
  const activeProjects = index.activeProjects;

  const updateViewState = <K extends keyof WorkspaceViewState>(
    key: K,
    value: WorkspaceViewState[K],
  ) => setViewState((current) => ({ ...current, [key]: value }));

  const initialProjectId = viewState.scope.startsWith("project:")
    ? viewState.scope.slice(8)
    : null;

  const handleProjectSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const title = projectTitle.trim();
    if (!title || title.length > PROJECT_TITLE_MAX_LENGTH) {
      setProjectError("Enter a project name up to 120 characters.");
      return;
    }
    setProjectPending(true);
    setProjectError(null);
    try {
      if (projectEditor === "new") {
        const project = await onCreateProject(title);
        if (project) updateViewState("scope", `project:${project.id}`);
      } else if (projectEditor) {
        await onRenameProject(projectEditor.id, title);
      }
      setProjectEditor(null);
      setProjectTitle("");
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "The project could not be saved.",
      );
    } finally {
      setProjectPending(false);
    }
  };

  return (
    <div className="grid w-full items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <DesktopProjectNavigation
        index={index}
        scope={viewState.scope}
        onScopeChange={(scope) => updateViewState("scope", scope)}
      />

      <div className="min-w-0">
        <Card className="mb-4">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>
                  {viewState.scope === "all"
                    ? viewState.status === "open"
                      ? "All open tasks"
                      : "All tasks"
                    : viewState.scope === "archived"
                      ? "Archived projects"
                      : index.projectMap.get(viewState.scope.slice(8))?.title ??
                        "Tasks"}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {groups.reduce((total, group) => total + group.tasks.length, 0)}{" "}
                  matching tasks
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <MobileProjectNavigation
                  index={index}
                  scope={viewState.scope}
                  onScopeChange={(scope) => updateViewState("scope", scope)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setProjectTitle("");
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

            <div className="flex flex-col gap-3">
              <label className="relative">
                <span className="sr-only">Search tasks and projects</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search tasks and projects"
                  className="pl-9"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={viewState.status}
                  onValueChange={(value) =>
                    updateViewState("status", value as TaskStatusFilter)
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
                  value={viewState.sort}
                  onValueChange={(value) =>
                    updateViewState("sort", value as TaskSort)
                  }
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
              </div>
            </div>
          </CardHeader>
        </Card>

        {groups.length === 0 ||
        groups.every((group) => group.tasks.length === 0) ? (
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
            {groups.map((group) => {
              const shown = visibleCounts[group.id] ?? TASK_BATCH_SIZE;
              const visibleTasks = group.tasks.slice(0, shown);
              const GroupIcon = group.project ? Folder : ListTodo;
              return (
                <Card key={group.id} size="sm">
                  <CardHeader className="items-center">
                    <div className="flex min-w-0 items-center gap-2">
                      <GroupIcon aria-hidden="true" />
                      <CardTitle className="truncate">
                        {group.project?.title ?? "No project"}
                      </CardTitle>
                      <Badge variant="outline">{group.tasks.length}</Badge>
                    </div>
                    <CardAction className="flex items-center gap-2">
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {formatFocusedTime(group.focusedSeconds)}
                      </span>
                      {group.project ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Project actions"
                              />
                            }
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onClick={() => {
                                  setProjectTitle(group.project!.title);
                                  setProjectError(null);
                                  setProjectEditor(group.project!);
                                }}
                              >
                                <Pencil />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  void onArchiveProject(
                                    group.project!.id,
                                    !group.project!.isDone,
                                  )
                                }
                              >
                                {group.project.isDone ? (
                                  <RotateCcw />
                                ) : (
                                  <Archive />
                                )}
                                {group.project.isDone ? "Restore" : "Archive"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() =>
                                  setDeleteProjectId(group.project!.id)
                                }
                              >
                                <Trash2 />
                                Delete project
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <ul
                      className="flex flex-col gap-1"
                      aria-label={`Tasks in ${group.project?.title ?? "No project"}`}
                    >
                      {visibleTasks.map((task) => (
                        <li
                          key={task.id}
                          className="group flex items-start gap-2 rounded-xl border border-transparent p-3 hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={task.isDone}
                            onCheckedChange={() =>
                              void onStatusChange(task.id, !task.isDone)
                            }
                            aria-label={
                              task.isDone ? "Reopen task" : "Mark task complete"
                            }
                            className="mt-1 after:-inset-3.5"
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setDetailTaskId(task.id)}
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
                              disabled={!canStartPomodoro}
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
                                  aria-label="Task actions"
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
                                  Edit or move
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleteTaskId(task.id)}
                                >
                                  <Trash2 />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </li>
                      ))}
                    </ul>
                    {shown < group.tasks.length ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 w-full"
                        onClick={() =>
                          setVisibleCounts((current) => ({
                            ...current,
                            [group.id]: shown + TASK_BATCH_SIZE,
                          }))
                        }
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
              if (editorTask === "new") await onCreateTask(title, projectId);
              else await onEditTask(editorTask.id, title, projectId);
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
        title={projectEditor === "new" ? "New project" : "Rename project"}
      >
        <form onSubmit={handleProjectSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field data-invalid={Boolean(projectError)}>
              <FieldLabel htmlFor="project-title">Project name</FieldLabel>
              <Input
                id="project-title"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                maxLength={PROJECT_TITLE_MAX_LENGTH}
                autoFocus
                required
                aria-invalid={Boolean(projectError)}
              />
              <FieldError>{projectError}</FieldError>
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={!projectTitle.trim() || projectPending}>
            {projectPending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : null}
            {projectPending ? "Saving…" : "Save project"}
          </Button>
        </form>
      </ResponsiveOverlay>

      <AlertDialog
        open={Boolean(deleteTask)}
        onOpenChange={(open) => !open && setDeleteTaskId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTask
                ? `${previewTitle(deleteTask.title)} and its focus total will be permanently removed.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTask) void onDeleteTask(deleteTask.id);
                setDeleteTaskId(null);
              }}
            >
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteProject)}
        onOpenChange={(open) => !open && setDeleteProjectId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              The project will be permanently deleted. Its tasks will remain in
              the workspace without a project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteProject) void onDeleteProject(deleteProject.id);
                setDeleteProjectId(null);
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
