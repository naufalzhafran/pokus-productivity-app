import type { Project, Task } from "@/types/task";

export const TASK_TITLE_MAX_LENGTH = 2000;
export const PROJECT_TITLE_MAX_LENGTH = 120;
export const TASK_BATCH_SIZE = 25;

export type WorkspaceScope = "all" | "archived" | `project:${string}`;
export type TaskStatusFilter = "open" | "completed" | "all";
export type TaskSort = "newest" | "oldest" | "alphabetical" | "focused";

export interface WorkspaceViewState {
  scope: WorkspaceScope;
  status: TaskStatusFilter;
  sort: TaskSort;
  lastDuration: number;
}

export interface TaskGroup {
  id: string;
  project: Project | null;
  tasks: Task[];
  openCount: number;
  completedCount: number;
  focusedSeconds: number;
}

export interface WorkspaceIndex {
  projectMap: Map<string, Project>;
  activeProjects: Project[];
  archivedProjects: Project[];
  groups: TaskGroup[];
  groupMap: Map<string, TaskGroup>;
  activeOpenCount: number;
}

export function createDefaultWorkspaceState(): WorkspaceViewState {
  return {
    scope: "all",
    status: "open",
    sort: "newest",
    lastDuration: 25,
  };
}

export function normalizeTaskTitle(title: string) {
  return title.trim();
}

export function validateTaskTitle(title: string) {
  const normalized = normalizeTaskTitle(title);
  if (!normalized) return "Enter a task.";
  if (normalized.length > TASK_TITLE_MAX_LENGTH) {
    return `Keep the task to ${TASK_TITLE_MAX_LENGTH.toLocaleString()} characters or fewer.`;
  }
  return null;
}

export function buildWorkspaceIndex(
  projects: Project[],
  tasks: Task[],
): WorkspaceIndex {
  const projectMap = new Map<string, Project>();
  const activeProjects: Project[] = [];
  const archivedProjects: Project[] = [];

  for (const project of projects) {
    projectMap.set(project.id, project);
    (project.isDone ? archivedProjects : activeProjects).push(project);
  }

  const unassigned: TaskGroup = {
    id: "unassigned",
    project: null,
    tasks: [],
    openCount: 0,
    completedCount: 0,
    focusedSeconds: 0,
  };
  const groupMap = new Map<string, TaskGroup>([["unassigned", unassigned]]);

  for (const project of projects) {
    groupMap.set(project.id, {
      id: project.id,
      project,
      tasks: [],
      openCount: 0,
      completedCount: 0,
      focusedSeconds: 0,
    });
  }

  let activeOpenCount = 0;
  for (const task of tasks) {
    const project = task.projectId ? projectMap.get(task.projectId) : undefined;
    const group = project ? groupMap.get(project.id)! : unassigned;
    group.tasks.push(task);
    group.focusedSeconds += task.focusedSeconds;
    if (task.isDone) group.completedCount += 1;
    else {
      group.openCount += 1;
      if (!project?.isDone) activeOpenCount += 1;
    }
  }

  return {
    projectMap,
    activeProjects,
    archivedProjects,
    groups: [
      unassigned,
      ...activeProjects.map((project) => groupMap.get(project.id)!),
      ...archivedProjects.map((project) => groupMap.get(project.id)!),
    ],
    groupMap,
    activeOpenCount,
  };
}

function sortTasks(tasks: Task[], sort: TaskSort) {
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return [...tasks].sort((a, b) => {
    if (sort === "oldest") return a.createdAt - b.createdAt;
    if (sort === "alphabetical") return collator.compare(a.title, b.title);
    if (sort === "focused") {
      return b.focusedSeconds - a.focusedSeconds || b.createdAt - a.createdAt;
    }
    return b.createdAt - a.createdAt;
  });
}

export function selectWorkspaceGroups(
  index: WorkspaceIndex,
  state: WorkspaceViewState,
  search: string,
) {
  const needle = search.trim().toLocaleLowerCase();
  const scopeProjectId = state.scope.startsWith("project:")
    ? state.scope.slice(8)
    : null;

  return index.groups
    .filter((group) => {
      if (state.scope === "archived") return Boolean(group.project?.isDone);
      if (scopeProjectId) return group.id === scopeProjectId;
      return !group.project?.isDone;
    })
    .map((group) => {
      const projectMatches =
        needle.length > 0 &&
        group.project?.title.toLocaleLowerCase().includes(needle);
      const filtered = group.tasks.filter((task) => {
        if (state.status === "open" && task.isDone) return false;
        if (state.status === "completed" && !task.isDone) return false;
        if (!needle || projectMatches) return true;
        return task.title.toLocaleLowerCase().includes(needle);
      });
      return { ...group, tasks: sortTasks(filtered, state.sort) };
    })
    .filter((group) => group.tasks.length > 0 || !needle);
}
