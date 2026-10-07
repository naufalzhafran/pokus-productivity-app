import type { Category, Project, ProjectStatus, Task, TaskPriority } from "@/types/task";

export const TASK_TITLE_MAX_LENGTH = 160;
export const LEGACY_TASK_TITLE_MAX_LENGTH = 2000;
export const PROJECT_TITLE_MAX_LENGTH = 120;
export const CATEGORY_NAME_MAX_LENGTH = 40;
export const TASK_BATCH_SIZE = 25;

export const DUE_SOON_DAYS = 7;
/** Route id for tasks that are not in any project. */
export const NO_PROJECT_ID = "none";

export type ProjectListFilter = "all" | ProjectStatus | "due" | "archived";
export type TaskStatusFilter = "open" | "completed" | "all";
export type TaskSort = "smart" | "priority" | "newest" | "oldest" | "alphabetical" | "focused";
export type PriorityFilter = "all" | TaskPriority;

export const PROJECT_LIST_FILTERS: ProjectListFilter[] = ["all", "active", "planned", "on_hold", "completed", "due", "archived"];
export const TASK_SORTS: TaskSort[] = ["smart", "priority", "newest", "oldest", "alphabetical", "focused"];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = { planned: "Planned", active: "Active", on_hold: "On hold", completed: "Completed" };

export interface WorkspaceViewState {
  projectFilter: ProjectListFilter;
  status: TaskStatusFilter;
  sort: TaskSort;
  priority?: PriorityFilter;
  categoryId?: string | null;
  lastDuration: number;
}

const taskTitleCollator = new Intl.Collator(undefined, { sensitivity: "base" });

export function createDefaultWorkspaceState(): WorkspaceViewState {
  return {
    projectFilter: "all",
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

export interface ProjectStats {
  taskCount: number;
  openCount: number;
  completedCount: number;
  focusedSeconds: number;
}

/** Task totals per project id; tasks without a project are counted under `NO_PROJECT_ID`. */
export function buildProjectStats(tasks: Task[]) {
  const stats = new Map<string, ProjectStats>();
  for (const task of tasks) {
    const key = task.projectId ?? NO_PROJECT_ID;
    const entry = stats.get(key) ?? { taskCount: 0, openCount: 0, completedCount: 0, focusedSeconds: 0 };
    entry.taskCount += 1;
    entry.focusedSeconds += task.focusedSeconds;
    if (task.isDone) entry.completedCount += 1;
    else entry.openCount += 1;
    stats.set(key, entry);
  }
  return stats;
}

export function isProjectDueSoon(project: Project, today = localDateKey()) {
  return Boolean(project.dueDate && !isProjectArchived(project) && getProjectStatus(project) !== "completed" && project.dueDate <= addLocalDays(today, DUE_SOON_DAYS));
}

function matchesProjectFilter(project: Project, filter: ProjectListFilter, today: string) {
  if (filter === "archived") return isProjectArchived(project);
  if (isProjectArchived(project)) return false;
  if (filter === "all") return true;
  if (filter === "due") return isProjectDueSoon(project, today);
  return getProjectStatus(project) === filter;
}

export function countProjectsByFilter(projects: Project[], today = localDateKey()) {
  return Object.fromEntries(PROJECT_LIST_FILTERS.map((filter) => [filter, projects.filter((project) => matchesProjectFilter(project, filter, today)).length])) as Record<ProjectListFilter, number>;
}

/** Projects for the list page: soonest due date first, then newest. */
export function selectProjects(projects: Project[], filter: ProjectListFilter, search: string, today = localDateKey()) {
  const needle = search.trim().toLocaleLowerCase();
  return projects
    .filter((project) => matchesProjectFilter(project, filter, today))
    .filter((project) => !needle || [project.title, plainTextFromHtml(project.description)].some((value) => value.toLocaleLowerCase().includes(needle)))
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate) || b.createdAt - a.createdAt;
      if (a.dueDate || b.dueDate) return a.dueDate ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
}

/** Tasks for one project (or `null` for tasks without a project) after filters, search, and sorting. */
export function selectProjectTasks(tasks: Task[], projectId: string | null, state: Pick<WorkspaceViewState, "status" | "sort" | "priority" | "categoryId">, search: string, categoryMap: Map<string, Category>) {
  const needle = search.trim().toLocaleLowerCase();
  return tasks
    .filter((task) => {
      if (task.projectId !== projectId) return false;
      if (state.status === "open" && task.isDone) return false;
      if (state.status === "completed" && !task.isDone) return false;
      if ((state.priority ?? "all") !== "all" && taskPriority(task) !== state.priority) return false;
      if (state.categoryId && task.categoryId !== state.categoryId) return false;
      if (!needle) return true;
      const category = task.categoryId ? categoryMap.get(task.categoryId) : undefined;
      return [task.title, plainTextFromHtml(task.description ?? ""), category?.name ?? ""].some((value) => value.toLocaleLowerCase().includes(needle));
    })
    .sort((a, b) => {
      if (state.sort === "oldest") return a.createdAt - b.createdAt;
      if (state.sort === "alphabetical") return taskTitleCollator.compare(a.title, b.title);
      if (state.sort === "focused") return b.focusedSeconds - a.focusedSeconds || b.createdAt - a.createdAt;
      if (state.sort === "newest") return b.createdAt - a.createdAt;
      const byPriority = PRIORITY_RANK[taskPriority(b)] - PRIORITY_RANK[taskPriority(a)];
      if (state.sort === "priority") return byPriority || b.createdAt - a.createdAt;
      return Number(a.isDone) - Number(b.isDone) || byPriority || b.createdAt - a.createdAt;
    });
}

export function titlePreview(title: string) {
  const value = normalizeTaskTitle(title);
  return value.length > 160 ? `${value.slice(0, 157)}…` : value;
}

export function formatFocused(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m focused` : `${Math.floor(minutes / 60)}h ${minutes % 60}m focused`;
}

export function dueLabel(dueDate: string | null | undefined, today: string) {
  if (!dueDate) return null;
  if (dueDate < today) return `Overdue · ${dueDate}`;
  if (dueDate === today) return "Due today";
  return `Due ${dueDate}`;
}
