export interface Task {
  id: string;
  title: string;
  isDone: boolean;
  createdAt: number;
  focusedSeconds: number;
  projectId: string | null;
  description?: string;
  priority?: TaskPriority;
  categoryId?: string | null;
  /** Local calendar date; otherwise this task follows its project's deadline. */
  dueDate?: string | null;
  /** Rough size for the daily plan; unset counts as small. */
  effort?: TaskEffort | null;
}

export type TaskEffort = "small" | "medium" | "large";
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";
export type ProjectStatus = "planned" | "active" | "on_hold" | "completed";
export type CategoryColor =
  | "slate" | "red" | "orange" | "amber" | "green"
  | "teal" | "blue" | "violet" | "pink";

export interface TaskInput {
  title: string;
  description: string;
  projectId: string | null;
  priority: TaskPriority;
  categoryId: string | null;
  dueDate?: string | null;
  effort?: TaskEffort | null;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  status?: ProjectStatus;
  isArchived?: boolean;
  /** Legacy test/record compatibility. PocketBase still stores this column. */
  isDone?: boolean;
  dueDate?: string | null;
  /** Default priority for new tasks added inside this project. */
  priority?: TaskPriority;
  categoryId?: string | null;
  /** Captures this project contains, in the order they were added. */
  captureIds?: string[];
}

export interface ProjectInput {
  title: string;
  description: string;
  status: ProjectStatus;
  dueDate: string | null;
  /** Omitted fields keep the project's current value. */
  priority?: TaskPriority;
  categoryId?: string | null;
}

export interface Category {
  id: string;
  name: string;
  color: CategoryColor;
  createdAt: number;
  updatedAt: number;
}

export interface CategoryInput { name: string; color: CategoryColor }

export interface PomodoroSession {
  id: string;
  taskId: string | null;
  durationMinutes: number;
  mode: "running" | "complete";
  remainingSeconds: number;
  isActive: boolean;
  lastTick: number;
}

export interface PomodoroHistoryEntry {
  id: string;
  taskId: string | null;
  durationMinutes: number;
  focusedSeconds: number;
  completedAt: number;
}
