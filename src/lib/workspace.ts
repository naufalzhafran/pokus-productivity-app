import type { Category, Project, ProjectStatus, Task, TaskPriority } from "@/types/task";

export const TASK_TITLE_MAX_LENGTH = 160;
export const LEGACY_TASK_TITLE_MAX_LENGTH = 2000;
export const PROJECT_TITLE_MAX_LENGTH = 120;
export const CATEGORY_NAME_MAX_LENGTH = 40;
export const TASK_BATCH_SIZE = 25;

export type WorkspaceScope = "all" | "today" | "upcoming" | "overdue" | "archived" | `project:${string}`;
export type TaskStatusFilter = "open" | "completed" | "all";
export type TaskSort = "smart" | "due" | "priority" | "newest" | "oldest" | "alphabetical" | "focused";
export type PriorityFilter = "all" | TaskPriority;

export interface WorkspaceViewState {
  scope: WorkspaceScope;
  status: TaskStatusFilter;
  sort: TaskSort;
  priority?: PriorityFilter;
  categoryId?: string | null;
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
  projectSearchText: Map<string, string>;
  taskSearchText: Map<string, string>;
}

const taskTitleCollator = new Intl.Collator(undefined, { sensitivity: "base" });

export function createDefaultWorkspaceState(): WorkspaceViewState {
  return {
    scope: "all",
    status: "open",
    sort: "smart",
    priority: "all",
    categoryId: null,
    lastDuration: 25,
  };
}

export function normalizeTaskTitle(title: string) {
  return title.replace(/\s+/g, " ").trim();
}

export function validateTaskTitle(title: string, originalTitle?: string) {
  const normalized = normalizeTaskTitle(title);
  if (!normalized) return "Enter a task.";
  if (originalTitle !== undefined && title === originalTitle) return null;
  if (normalized.length > TASK_TITLE_MAX_LENGTH) {
    return `Keep the task to ${TASK_TITLE_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export function isProjectArchived(project?: Project | null) {
  return Boolean(project && (project.isArchived ?? project.isDone ?? false));
}

export function getProjectStatus(project: Project): ProjectStatus {
  return project.status ?? "active";
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addLocalDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days));
}

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  none: 0, low: 1, medium: 2, high: 3, urgent: 4,
};

export function taskPriority(task: Task): TaskPriority { return task.priority ?? "none"; }

export function plainTextFromHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function buildWorkspaceIndex(
  projects: Project[],
  tasks: Task[],
): WorkspaceIndex {
  const projectMap = new Map<string, Project>();
  const projectSearchText = new Map<string, string>();
  const taskSearchText = new Map<string, string>();
  const activeProjects: Project[] = [];
  const archivedProjects: Project[] = [];

  for (const project of projects) {
    projectMap.set(project.id, project);
    projectSearchText.set(project.id, project.title.toLocaleLowerCase());
    (isProjectArchived(project) ? archivedProjects : activeProjects).push(project);
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
    taskSearchText.set(task.id, task.title.toLocaleLowerCase());
    const project = task.projectId ? projectMap.get(task.projectId) : undefined;
    const group = project ? groupMap.get(project.id)! : unassigned;
    group.tasks.push(task);
    group.focusedSeconds += task.focusedSeconds;
    if (task.isDone) group.completedCount += 1;
    else {
      group.openCount += 1;
      if (!isProjectArchived(project)) activeOpenCount += 1;
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
    projectSearchText,
    taskSearchText,
  };
}

function sortTasks(tasks: Task[], sort: TaskSort) {
  return [...tasks].sort((a, b) => {
    if (sort === "oldest") return a.createdAt - b.createdAt;
    if (sort === "alphabetical") return taskTitleCollator.compare(a.title, b.title);
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
      if (state.scope === "archived") return isProjectArchived(group.project);
      if (scopeProjectId) return group.id === scopeProjectId;
      return !isProjectArchived(group.project);
    })
    .map((group) => {
      const projectMatches =
        needle.length > 0 &&
        Boolean(
          group.project &&
            index.projectSearchText.get(group.project.id)?.includes(needle),
        );
      const filtered = group.tasks.filter((task) => {
        if (state.status === "open" && task.isDone) return false;
        if (state.status === "completed" && !task.isDone) return false;
        if (!needle || projectMatches) return true;
        return index.taskSearchText.get(task.id)?.includes(needle) ?? false;
      });
      return { ...group, tasks: sortTasks(filtered, state.sort) };
    })
    .filter((group) => group.project || group.tasks.length > 0);
}

export interface FlatWorkspaceIndex extends WorkspaceIndex {
  categoryMap: Map<string, Category>;
  todayCount: number;
  upcomingCount: number;
  overdueCount: number;
}

export function buildFlatWorkspaceIndex(projects: Project[], tasks: Task[], categories: Category[], today = localDateKey()): FlatWorkspaceIndex {
  const base = buildWorkspaceIndex(projects, tasks);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  let todayCount = 0, upcomingCount = 0, overdueCount = 0;
  const end = addLocalDays(today, 7);
  for (const task of tasks) {
    const project = task.projectId ? base.projectMap.get(task.projectId) : undefined;
    const dueDate = project?.dueDate;
    if (task.isDone || isProjectArchived(project) || !dueDate) continue;
    if (dueDate === today) todayCount += 1;
    else if (dueDate < today) overdueCount += 1;
    else if (dueDate <= end) upcomingCount += 1;
  }
  return { ...base, categoryMap, todayCount, upcomingCount, overdueCount };
}

function compareDue(a: Task, b: Task, index: FlatWorkspaceIndex) {
  const aDueDate = a.projectId ? index.projectMap.get(a.projectId)?.dueDate : null;
  const bDueDate = b.projectId ? index.projectMap.get(b.projectId)?.dueDate : null;
  if (!aDueDate && !bDueDate) return 0;
  if (!aDueDate) return 1;
  if (!bDueDate) return -1;
  return aDueDate.localeCompare(bDueDate);
}

export function selectWorkspaceTasks(index: FlatWorkspaceIndex, tasks: Task[], state: WorkspaceViewState, search: string, today = localDateKey()) {
  const needle = search.trim().toLocaleLowerCase();
  const end = addLocalDays(today, 7);
  const projectId = state.scope.startsWith("project:") ? state.scope.slice(8) : null;
  const archivedScope = state.scope === "archived" || Boolean(projectId && isProjectArchived(index.projectMap.get(projectId)));
  const filtered = tasks.filter((task) => {
    const project = task.projectId ? index.projectMap.get(task.projectId) : undefined;
    const dueDate = project?.dueDate;
    const archived = isProjectArchived(project);
    if (archivedScope ? !archived : archived) return false;
    if (projectId && task.projectId !== projectId) return false;
    if (["today", "upcoming", "overdue"].includes(state.scope) && task.isDone) return false;
    if (state.scope === "today" && dueDate !== today) return false;
    if (state.scope === "upcoming" && (!dueDate || dueDate <= today || dueDate > end)) return false;
    if (state.scope === "overdue" && (!dueDate || dueDate >= today)) return false;
    if (state.status === "open" && task.isDone) return false;
    if (state.status === "completed" && !task.isDone) return false;
    if ((state.priority ?? "all") !== "all" && taskPriority(task) !== state.priority) return false;
    if (state.categoryId && task.categoryId !== state.categoryId) return false;
    if (!needle) return true;
    const category = task.categoryId ? index.categoryMap.get(task.categoryId) : undefined;
    return [task.title, plainTextFromHtml(task.description ?? ""), project?.title ?? "", category?.name ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(needle));
  });
  return filtered.sort((a, b) => {
    if (state.sort === "oldest") return a.createdAt - b.createdAt;
    if (state.sort === "alphabetical") return taskTitleCollator.compare(a.title, b.title);
    if (state.sort === "focused") return b.focusedSeconds - a.focusedSeconds || b.createdAt - a.createdAt;
    if (state.sort === "due") return compareDue(a, b, index) || b.createdAt - a.createdAt;
    if (state.sort === "priority") return PRIORITY_RANK[taskPriority(b)] - PRIORITY_RANK[taskPriority(a)] || b.createdAt - a.createdAt;
    if (state.sort === "newest") return b.createdAt - a.createdAt;
    return compareDue(a, b, index) || PRIORITY_RANK[taskPriority(b)] - PRIORITY_RANK[taskPriority(a)] || b.createdAt - a.createdAt;
  });
}
