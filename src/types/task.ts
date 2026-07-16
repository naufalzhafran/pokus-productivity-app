export interface Task {
  id: string;
  title: string;
  isDone: boolean;
  createdAt: number;
  focusedSeconds: number;
  projectId: string | null;
}

export interface Project {
  id: string;
  title: string;
  createdAt: number;
  isDone: boolean;
}

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
