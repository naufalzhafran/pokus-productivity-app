import { useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  CheckCircle2,
  Circle,
  Folder,
  FolderPlus,
  Inbox,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Modal } from "@/components/ui/modal";
import { DialogFooter } from "@/components/ui/dialog";
import { ProjectCombobox } from "@/components/features/ProjectCombobox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Project, Task } from "@/types/task";

interface TaskPanelProps {
  tasks: Task[];
  projects: Project[];
  canStartPomodoro?: boolean;
  onCreate: (title: string, projectId: string | null) => Promise<Task | null>;
  onCreateProject: (title: string) => Promise<string | null>;
  onDeleteProject: (projectId: string) => Promise<unknown>;
  onProjectStatusChange: (
    projectId: string,
    isDone: boolean,
  ) => Promise<unknown>;
  onStartPomodoro: (taskId: string) => void;
  onStatusChange: (taskId: string, isDone: boolean) => Promise<unknown>;
  onEdit: (
    taskId: string,
    title: string,
    projectId: string | null,
  ) => Promise<unknown>;
  onDelete: (taskId: string) => Promise<unknown>;
}

interface TaskRowProps {
  task: Task;
  projects: Project[];
  canStartPomodoro: boolean;
  onStartPomodoro: (taskId: string) => void;
  onStatusChange: (taskId: string, isDone: boolean) => Promise<unknown>;
  onEdit: (
    taskId: string,
    title: string,
    projectId: string | null,
  ) => Promise<unknown>;
  onDelete: (taskId: string) => Promise<unknown>;
}

function formatFocusedTime(seconds: number) {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (seconds > 0 && totalMinutes === 0) return "<1m focused";
  if (hours === 0) return `${remainingMinutes}m focused`;
  if (remainingMinutes === 0) return `${hours}h focused`;
  return `${hours}h ${remainingMinutes}m focused`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function TaskRow({
  task,
  projects,
  canStartPomodoro,
  onStartPomodoro,
  onStatusChange,
  onEdit,
  onDelete,
}: TaskRowProps) {
  const hasKnownProject = projects.some(
    (project) => project.id === task.projectId,
  );
  const currentProjectId = hasKnownProject ? task.projectId : null;
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editProjectId, setEditProjectId] = useState<string | null>(
    currentProjectId,
  );
  const [isPending, setIsPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openEditor = () => {
    setEditTitle(task.title);
    setEditProjectId(currentProjectId);
    setFormError(null);
    setIsEditing(true);
  };

  const handleStatusChange = async () => {
    setIsPending(true);
    try {
      await onStatusChange(task.id, !task.isDone);
    } catch {
      // The app-level handler reports the failure and the hook restores state.
    } finally {
      setIsPending(false);
    }
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTitle.trim()) return;

    setIsPending(true);
    setFormError(null);
    try {
      await onEdit(task.id, editTitle, editProjectId);
      setIsEditing(false);
    } catch (error) {
      setFormError(getErrorMessage(error, "This task could not be saved."));
    } finally {
      setIsPending(false);
    }
  };

  const handleDelete = async () => {
    setIsPending(true);
    try {
      await onDelete(task.id);
      setShowDeleteConfirm(false);
    } catch {
      // Keep the confirmation open so the user can retry or cancel.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <li
      className="group rounded-2xl border bg-card p-3 transition-colors hover:bg-muted/35"
      aria-busy={isPending}
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {task.isDone ? (
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <Circle
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "break-words text-sm font-medium",
                task.isDone && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatFocusedTime(task.focusedSeconds)}
            </p>
          </div>
        </div>

        {!task.isDone ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onStartPomodoro(task.id)}
            disabled={!canStartPomodoro || isPending}
            title={
              canStartPomodoro
                ? "Choose a duration and start focusing"
                : "Finish the current session first"
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
                aria-label={`Actions for ${task.title}`}
                disabled={isPending}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => void handleStatusChange()}>
                {task.isDone ? <RotateCcw /> : <CheckCircle2 />}
                {task.isDone ? "Reopen task" : "Mark as done"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openEditor}>
                <Pencil />
                Edit task
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 />
                Delete task
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Modal
        isOpen={isEditing}
        onClose={() => !isPending && setIsEditing(false)}
        title="Edit task"
        description="Update the task title or move it to another project."
      >
        <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field data-invalid={Boolean(formError)}>
              <FieldLabel htmlFor={`edit-task-title-${task.id}`}>
                Task title
              </FieldLabel>
              <Input
                id={`edit-task-title-${task.id}`}
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                maxLength={120}
                required
                autoFocus
                disabled={isPending}
                aria-invalid={Boolean(formError)}
              />
              <FieldError>{formError}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={`edit-task-project-${task.id}`}>
                Project
              </FieldLabel>
              <ProjectCombobox
                id={`edit-task-project-${task.id}`}
                projects={projects}
                value={editProjectId}
                onValueChange={setEditProjectId}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditing(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!editTitle.trim() || isPending}>
              {isPending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </Modal>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{task.title}” and its tracked focus total will be permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

interface ProjectSectionProps extends Pick<
  TaskPanelProps,
  | "canStartPomodoro"
  | "onStartPomodoro"
  | "onStatusChange"
  | "onEdit"
  | "onDelete"
> {
  project?: Project;
  tasks: Task[];
  projects: Project[];
  onNewTask: () => void;
  onProjectDone: (projectId: string) => Promise<void>;
  onProjectDelete: (project: Project) => void;
}

function ProjectSection({
  project,
  tasks,
  projects,
  canStartPomodoro = true,
  onNewTask,
  onProjectDone,
  onProjectDelete,
  onStartPomodoro,
  onStatusChange,
  onEdit,
  onDelete,
}: ProjectSectionProps) {
  const totalFocusedSeconds = tasks.reduce(
    (total, task) => total + task.focusedSeconds,
    0,
  );
  const openTasks = tasks.filter((task) => !task.isDone);
  const completedTasks = tasks.filter((task) => task.isDone);
  const Icon = project ? Folder : Inbox;
  const sectionName = project?.title ?? "No project";

  return (
    <section aria-label={sectionName}>
      <Card>
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{sectionName}</span>
          </CardTitle>
          <CardDescription>
            {openTasks.length} open · {formatFocusedTime(totalFocusedSeconds)}
          </CardDescription>
          {project ? (
            <CardAction className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onProjectDone(project.id)}
              >
                <CheckCircle2 data-icon="inline-start" />
                Done
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete project ${project.title}`}
                onClick={() => onProjectDelete(project)}
              >
                <Trash2 />
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {tasks.length > 0 ? (
            <div className="flex flex-col gap-5">
              {openTasks.length > 0 ? (
                <ul
                  aria-label={`Open tasks in ${sectionName}`}
                  className="flex flex-col gap-2"
                >
                  {openTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      projects={projects}
                      canStartPomodoro={canStartPomodoro}
                      onStartPomodoro={onStartPomodoro}
                      onStatusChange={onStatusChange}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              ) : null}
              {completedTasks.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Completed
                  </p>
                  <ul className="flex flex-col gap-2">
                    {completedTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        projects={projects}
                        canStartPomodoro={canStartPomodoro}
                        onStartPomodoro={onStartPomodoro}
                        onStatusChange={onStatusChange}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Icon />
                </EmptyMedia>
                <EmptyTitle>No tasks here yet</EmptyTitle>
                <EmptyDescription>
                  Add a task and turn it into your next focus session.
                </EmptyDescription>
              </EmptyHeader>
              <Button type="button" onClick={onNewTask}>
                <Plus data-icon="inline-start" />
                Add task
              </Button>
            </Empty>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function TaskPanel({
  tasks,
  projects,
  canStartPomodoro = true,
  onCreate,
  onCreateProject,
  onDeleteProject,
  onProjectStatusChange,
  onStartPomodoro,
  onStatusChange,
  onEdit,
  onDelete,
}: TaskPanelProps) {
  const activeProjects = projects.filter((project) => !project.isDone);
  const doneProjects = projects.filter((project) => project.isDone);
  const allProjectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects],
  );
  const activeProjectIds = useMemo(
    () => new Set(activeProjects.map((project) => project.id)),
    [activeProjects],
  );
  const [taskTitle, setTaskTitle] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => activeProjects[0]?.id ?? null,
  );
  const [showDoneProjects, setShowDoneProjects] = useState(false);
  const [creationModal, setCreationModal] = useState<"project" | "task" | null>(
    null,
  );
  const [projectPendingDeletion, setProjectPendingDeletion] =
    useState<Project | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const validTaskProjectId =
    taskProjectId && activeProjectIds.has(taskProjectId) ? taskProjectId : null;
  const unassignedTasks = tasks.filter(
    (task) => !task.projectId || !allProjectIds.has(task.projectId),
  );
  const selectedProject =
    selectedProjectId === null
      ? null
      : (activeProjects.find((project) => project.id === selectedProjectId) ??
        activeProjects[0] ??
        null);
  const effectiveProjectId = selectedProject?.id ?? null;
  const selectedTasks = selectedProject
    ? tasks.filter((task) => task.projectId === selectedProject.id)
    : unassignedTasks;
  const openTaskCount = tasks.filter((task) => !task.isDone).length;

  const openTaskCreator = () => {
    setTaskProjectId(effectiveProjectId);
    setFormError(null);
    setCreationModal("task");
  };

  const handleTaskSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await onCreate(taskTitle, validTaskProjectId);
      setTaskTitle("");
      setCreationModal(null);
    } catch (error) {
      setFormError(getErrorMessage(error, "This task could not be created."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleProjectSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectTitle.trim()) return;
    setIsSaving(true);
    setFormError(null);
    try {
      const projectId = await onCreateProject(projectTitle);
      if (projectId) {
        setTaskProjectId(projectId);
        setSelectedProjectId(projectId);
      }
      setProjectTitle("");
      setCreationModal(null);
    } catch (error) {
      setFormError(getErrorMessage(error, "This project could not be created."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleProjectDone = async (projectId: string) => {
    const nextProject = activeProjects.find(
      (project) => project.id !== projectId,
    );
    try {
      await onProjectStatusChange(projectId, true);
      if (effectiveProjectId === projectId) {
        setSelectedProjectId(nextProject?.id ?? null);
      }
    } catch {
      // The app-level handler reports the failure and the hook restores state.
    }
  };

  const handleProjectDelete = async () => {
    if (!projectPendingDeletion) return;
    const projectId = projectPendingDeletion.id;
    const nextProject = activeProjects.find(
      (project) => project.id !== projectId,
    );
    setIsSaving(true);
    try {
      await onDeleteProject(projectId);
      if (effectiveProjectId === projectId) {
        setSelectedProjectId(nextProject?.id ?? null);
      }
      setProjectPendingDeletion(null);
      if (doneProjects.length === 1) setShowDoneProjects(false);
    } catch {
      // Keep the confirmation open so the user can retry or cancel.
    } finally {
      setIsSaving(false);
    }
  };

  const restoreProject = async (projectId: string) => {
    try {
      await onProjectStatusChange(projectId, false);
      setSelectedProjectId(projectId);
      if (doneProjects.length === 1) setShowDoneProjects(false);
    } catch {
      // The app-level handler reports the failure and the hook restores state.
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-3xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold">Your work</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {openTaskCount} open {openTaskCount === 1 ? "task" : "tasks"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFormError(null);
              setCreationModal("project");
            }}
          >
            <FolderPlus data-icon="inline-start" />
            New project
          </Button>
          <Button type="button" onClick={openTaskCreator}>
            <Plus data-icon="inline-start" />
            New task
          </Button>
          {doneProjects.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowDoneProjects(true)}
            >
              <Archive data-icon="inline-start" />
              Done
            </Button>
          ) : null}
        </div>
      </div>

      <div className="lg:hidden">
        <Field>
          <FieldLabel htmlFor="mobile-project-filter">Project</FieldLabel>
          <Select
            value={effectiveProjectId ?? "none"}
            onValueChange={(value) =>
              setSelectedProjectId(value === "none" ? null : value)
            }
          >
            <SelectTrigger id="mobile-project-filter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {activeProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title}
                  </SelectItem>
                ))}
                <SelectItem value="none">No project</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="hidden lg:flex">
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>Choose a task group.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <ScrollArea className="h-[32rem]">
              <nav aria-label="Active projects" className="flex flex-col gap-1 pr-3">
                {activeProjects.map((project) => {
                  const count = tasks.filter(
                    (task) => task.projectId === project.id && !task.isDone,
                  ).length;
                  return (
                    <Button
                      key={project.id}
                      type="button"
                      variant={
                        effectiveProjectId === project.id ? "secondary" : "ghost"
                      }
                      className="w-full justify-start"
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <Folder data-icon="inline-start" />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {project.title}
                      </span>
                      <Badge variant="outline">{count}</Badge>
                    </Button>
                  );
                })}
                <Button
                  type="button"
                  variant={effectiveProjectId === null ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedProjectId(null)}
                >
                  <Inbox data-icon="inline-start" />
                  <span className="min-w-0 flex-1 text-left">No project</span>
                  <Badge variant="outline">
                    {unassignedTasks.filter((task) => !task.isDone).length}
                  </Badge>
                </Button>
              </nav>
            </ScrollArea>
          </CardContent>
        </Card>

        <ProjectSection
          project={selectedProject ?? undefined}
          tasks={selectedTasks}
          projects={activeProjects}
          canStartPomodoro={canStartPomodoro}
          onNewTask={openTaskCreator}
          onProjectDone={handleProjectDone}
          onProjectDelete={setProjectPendingDeletion}
          onStartPomodoro={onStartPomodoro}
          onStatusChange={onStatusChange}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>

      <Modal
        isOpen={creationModal === "project"}
        onClose={() => !isSaving && setCreationModal(null)}
        title="New project"
        description="Create a project to group related tasks and focus time."
      >
        <form onSubmit={handleProjectSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field data-invalid={Boolean(formError)}>
              <FieldLabel htmlFor="project-title">Project title</FieldLabel>
              <Input
                id="project-title"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="e.g. Website redesign"
                maxLength={120}
                required
                autoFocus
                disabled={isSaving}
                aria-invalid={Boolean(formError)}
              />
              <FieldError>{formError}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreationModal(null)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!projectTitle.trim() || isSaving}>
              {isSaving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              {isSaving ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </Modal>

      <Modal
        isOpen={creationModal === "task"}
        onClose={() => !isSaving && setCreationModal(null)}
        title="New task"
        description="Capture the work, then start a focused session when ready."
      >
        <form onSubmit={handleTaskSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field data-invalid={Boolean(formError)}>
              <FieldLabel htmlFor="task-title">Task title</FieldLabel>
              <Input
                id="task-title"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="What needs to be done?"
                maxLength={120}
                required
                autoFocus
                disabled={isSaving}
                aria-invalid={Boolean(formError)}
              />
              <FieldError>{formError}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="new-task-project">Project</FieldLabel>
              <ProjectCombobox
                id="new-task-project"
                projects={activeProjects}
                value={validTaskProjectId}
                onValueChange={setTaskProjectId}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreationModal(null)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!taskTitle.trim() || isSaving}>
              {isSaving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              {isSaving ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </Modal>

      <Modal
        isOpen={showDoneProjects}
        onClose={() => setShowDoneProjects(false)}
        title="Done projects"
        description="Restore a project whenever you need it again."
      >
        <ScrollArea className="h-72">
          <div className="flex flex-col gap-2 pr-3">
            {doneProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-2 rounded-2xl border p-2"
              >
                <Folder
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {project.title}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void restoreProject(project.id)}
                >
                  <RotateCcw data-icon="inline-start" />
                  Restore
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete project ${project.title}`}
                  onClick={() => setProjectPendingDeletion(project)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Modal>

      <AlertDialog
        open={Boolean(projectPendingDeletion)}
        onOpenChange={(open) => !open && setProjectPendingDeletion(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              “{projectPendingDeletion?.title}” will be permanently deleted. Its
              tasks will be kept and moved to No project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleProjectDelete()}
              disabled={isSaving}
            >
              {isSaving ? "Deleting…" : "Delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
