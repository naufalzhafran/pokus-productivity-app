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
}

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
}

export interface ProjectInput {
  title: string;
  description: string;
  status: ProjectStatus;
  dueDate: string | null;
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
