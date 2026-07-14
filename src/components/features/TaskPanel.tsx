import { useState, type FormEvent } from "react";
import {
  Archive,
  CheckCircle2,
  Circle,
  Folder,
  FolderPlus,
  Inbox,
  Pencil,
  Plus,
  RotateCcw,
  TimerReset,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Project, Task } from "@/types/task";

interface TaskPanelProps {
  tasks: Task[];
  projects: Project[];
  canStartPomodoro?: boolean;
  onCreate: (title: string, projectId: string | null) => void;
  onCreateProject: (title: string) => string | null;
  onDeleteProject: (projectId: string) => void;
  onProjectStatusChange: (projectId: string, isDone: boolean) => void;
  onStartPomodoro: (taskId: string) => void;
  onStatusChange: (taskId: string, isDone: boolean) => void;
  onEdit: (taskId: string, title: string, projectId: string | null) => void;
  onDelete: (taskId: string) => void;
}

interface TaskRowProps {
  task: Task;
  projects: Project[];
  canStartPomodoro: boolean;
  onStartPomodoro: (taskId: string) => void;
  onStatusChange: (taskId: string, isDone: boolean) => void;
  onEdit: (taskId: string, title: string, projectId: string | null) => void;
  onDelete: (taskId: string) => void;
}

interface ProjectSectionProps {
  project?: Project;
  tasks: Task[];
  projects: Project[];
  canStartPomodoro: boolean;
  onDeleteProject: (projectId: string) => void;
  onProjectStatusChange: (projectId: string, isDone: boolean) => void;
  onStartPomodoro: (taskId: string) => void;
  onStatusChange: (taskId: string, isDone: boolean) => void;
  onEdit: (taskId: string, title: string, projectId: string | null) => void;
  onDelete: (taskId: string) => void;
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
  const [editTitle, setEditTitle] = useState(task.title);
  const [editProjectId, setEditProjectId] = useState<string | null>(
    currentProjectId,
  );
  const projectOptions = [
    { label: "No project", value: null },
    ...projects.map((project) => ({
      label: project.title,
      value: project.id as string | null,
    })),
  ];

  const openEditor = () => {
    setEditTitle(task.title);
    setEditProjectId(currentProjectId);
    setIsEditing(true);
  };

  const handleEditSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTitle.trim()) return;

    onEdit(task.id, editTitle, editProjectId);
    setIsEditing(false);
  };

  return (
    <li className="group rounded-md bg-muted/40 p-2">
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-3 px-1 py-1">
          {task.isDone ? (
            <CheckCircle2
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <Circle
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-sm",
                task.isDone && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </p>
            <Badge variant="outline" className="mt-1">
              {formatFocusedTime(task.focusedSeconds)}
            </Badge>
          </div>
        </div>

        {!task.isDone ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Set up Pomodoro for ${task.title}`}
            title="Choose duration and start"
            onClick={() => onStartPomodoro(task.id)}
            disabled={!canStartPomodoro}
          >
            <TimerReset />
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={
            task.isDone ? `Reopen ${task.title}` : `Complete ${task.title}`
          }
          title={task.isDone ? "Reopen task" : "Mark task done"}
          onClick={() => onStatusChange(task.id, !task.isDone)}
        >
          {task.isDone ? <RotateCcw /> : <CheckCircle2 />}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${task.title}`}
          title="Edit task"
          onClick={openEditor}
        >
          <Pencil />
        </Button>

        <Button
          type="button"
          variant="destructive"
          size="icon-sm"
          aria-label={`Delete ${task.title}`}
          title="Delete task"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 />
        </Button>
      </div>

      <Modal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit task"
        description="Update the task title or move it to another project."
      >
        <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
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
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`edit-task-project-${task.id}`}>
                Project
              </FieldLabel>
              <Select
                items={projectOptions}
                value={editProjectId}
                onValueChange={setEditProjectId}
              >
                <SelectTrigger
                  id={`edit-task-project-${task.id}`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {projectOptions.map((option) => (
                      <SelectItem
                        key={option.value ?? "none"}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!editTitle.trim()}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </Modal>
    </li>
  );
}

function ProjectSection({
  project,
  tasks,
  projects,
  canStartPomodoro,
  onDeleteProject,
  onProjectStatusChange,
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
      <Card className="h-full min-h-[38rem]">
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{sectionName}</span>
          </CardTitle>
          <CardDescription>
            {formatFocusedTime(totalFocusedSeconds)}
          </CardDescription>
          {project ? (
            <CardAction className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onProjectStatusChange(project.id, true)}
              >
                <CheckCircle2 data-icon="inline-start" />
                Done
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                aria-label={`Delete project ${project.title}`}
                title="Delete project and move its tasks to No project"
                onClick={() => onDeleteProject(project.id)}
              >
                <Trash2 />
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>

        <CardContent className="min-h-0 flex-1">
          <ScrollArea className="h-[31rem]">
            <div className="flex flex-col gap-4 pr-3">
              {tasks.length > 0 ? (
                <>
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
                      <p className="text-xs text-muted-foreground">Completed</p>
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
                </>
              ) : (
                <Empty className="min-h-80">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Icon />
                    </EmptyMedia>
                    <EmptyTitle>No tasks yet</EmptyTitle>
                    <EmptyDescription>
                      {project
                        ? "Add a task to begin tracking focus for this project."
                        : "Tasks without a project will appear here."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </ScrollArea>
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
  const allProjectIds = new Set(projects.map((project) => project.id));
  const activeProjectIds = new Set(
    activeProjects.map((project) => project.id),
  );
  const [taskTitle, setTaskTitle] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => activeProjects[0]?.id ?? null,
  );
  const [showDoneProjects, setShowDoneProjects] = useState(false);
  const [creationModal, setCreationModal] = useState<
    "project" | "task" | null
  >(null);
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
  const projectOptions = [
    { label: "No project", value: null },
    ...activeProjects.map((project) => ({
      label: project.title,
      value: project.id as string | null,
    })),
  ];

  const handleTaskSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskTitle.trim()) return;

    onCreate(taskTitle, validTaskProjectId);
    setTaskTitle("");
    setCreationModal(null);
  };

  const handleProjectSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectTitle.trim()) return;

    const projectId = onCreateProject(projectTitle);
    if (projectId) {
      setTaskProjectId(projectId);
      setSelectedProjectId(projectId);
    }
    setProjectTitle("");
    setCreationModal(null);
  };

  const handleProjectDone = (projectId: string) => {
    const nextProject = activeProjects.find(
      (project) => project.id !== projectId,
    );
    onProjectStatusChange(projectId, true);
    if (effectiveProjectId === projectId) {
      setSelectedProjectId(nextProject?.id ?? null);
    }
  };

  const handleProjectDelete = (projectId: string) => {
    const nextProject = activeProjects.find(
      (project) => project.id !== projectId,
    );
    onDeleteProject(projectId);
    if (effectiveProjectId === projectId) {
      setSelectedProjectId(nextProject?.id ?? null);
    }
  };

  const restoreProject = (projectId: string) => {
    onProjectStatusChange(projectId, false);
    setSelectedProjectId(projectId);
    if (doneProjects.length === 1) setShowDoneProjects(false);
  };

  const deleteDoneProject = (projectId: string) => {
    onDeleteProject(projectId);
    if (doneProjects.length === 1) setShowDoneProjects(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            Organize tasks into projects and start a focused session.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreationModal("project")}
          >
            <FolderPlus data-icon="inline-start" />
            New project
          </Button>
          <Button
            type="button"
            onClick={() => {
              setTaskProjectId(effectiveProjectId);
              setCreationModal("task");
            }}
          >
            <Plus data-icon="inline-start" />
            New task
          </Button>
          {doneProjects.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="sm:ml-auto"
              onClick={() => setShowDoneProjects(true)}
            >
              <Archive data-icon="inline-start" />
              Done projects
            </Button>
          ) : null}
        </CardFooter>
      </Card>

      <Modal
        isOpen={creationModal === "project"}
        onClose={() => setCreationModal(null)}
        title="New project"
        description="Create a project to group related tasks and their focused time."
      >
        <form onSubmit={handleProjectSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-title">Project title</FieldLabel>
              <Input
                id="project-title"
                type="text"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="e.g. Website redesign"
                maxLength={120}
                required
                autoFocus
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreationModal(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!projectTitle.trim()}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </Modal>

      <Modal
        isOpen={creationModal === "task"}
        onClose={() => setCreationModal(null)}
        title="New task"
        description="Add a task with an optional parent project."
      >
        <form onSubmit={handleTaskSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-title">Task title</FieldLabel>
              <Input
                id="task-title"
                type="text"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="What needs to be done?"
                maxLength={120}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-task-project">Project</FieldLabel>
              <Select
                items={projectOptions}
                value={validTaskProjectId}
                onValueChange={setTaskProjectId}
              >
                <SelectTrigger id="new-task-project" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {projectOptions.map((option) => (
                      <SelectItem
                        key={option.value ?? "none"}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreationModal(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!taskTitle.trim()}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </Modal>

      <Modal
        isOpen={showDoneProjects}
        onClose={() => setShowDoneProjects(false)}
        title="Done projects"
        description="Completed projects stay out of your active workspace. Restore one whenever you need it again."
      >
        <ScrollArea className="h-72">
          <div className="flex flex-col gap-2 pr-3">
            {doneProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-2 rounded-md border p-2"
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
                  onClick={() => restoreProject(project.id)}
                >
                  <RotateCcw data-icon="inline-start" />
                  Restore
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Delete project ${project.title}`}
                  title="Delete project and move its tasks to No project"
                  onClick={() => deleteDoneProject(project.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Modal>

      <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="h-full lg:min-h-[38rem]">
          <CardHeader>
            <CardTitle>Active projects</CardTitle>
            <CardDescription>
              Select a project to view and manage its tasks.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <ScrollArea className="h-64 lg:h-[31rem]">
              <nav
                aria-label="Active projects"
                className="flex flex-col gap-1 pr-3"
              >
                {activeProjects.map((project) => (
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
                    <span className="truncate">{project.title}</span>
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={effectiveProjectId === null ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedProjectId(null)}
                >
                  <Inbox data-icon="inline-start" />
                  <span>No project</span>
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
          onDeleteProject={handleProjectDelete}
          onProjectStatusChange={handleProjectDone}
          onStartPomodoro={onStartPomodoro}
          onStatusChange={onStatusChange}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
