import type { RecordModel } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import type {
  PomodoroHistoryEntry,
  PomodoroSession,
  Project,
  Task,
} from "@/types/task";

export const COLLECTIONS = {
  projects: "projects",
  tasks: "tasks",
  sessions: "pomodoro_sessions",
} as const;

export interface ProjectRecord extends RecordModel {
  title: string;
  description: string;
  isDone: boolean;
  created: string;
}

export interface TaskRecord extends RecordModel {
  title: string;
  isDone: boolean;
  focusedSeconds: number;
  project: string;
  created: string;
}

interface PomodoroSessionRecord extends RecordModel {
  task: string;
  durationMinutes: number;
  mode: PomodoroSession["mode"];
  remainingSeconds: number;
  isActive: boolean;
  lastTick: number;
  updated: string;
}

export function getAuthenticatedUserId() {
  const userId = pb.authStore.record?.id;
  if (!userId) throw new Error("An authenticated user is required.");
  return userId;
}

export function createPocketBaseId() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(15));

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function projectFromRecord(record: ProjectRecord): Project {
  return {
    id: record.id,
    title: record.title,
    description: record.description || "",
    isDone: record.isDone,
    createdAt: Date.parse(record.created),
  };
}

export function taskFromRecord(record: TaskRecord): Task {
  return {
    id: record.id,
    title: record.title,
    isDone: record.isDone,
    focusedSeconds: Math.max(0, Math.floor(record.focusedSeconds || 0)),
    projectId: record.project || null,
    createdAt: Date.parse(record.created),
  };
}

export function sessionFromRecord(
  record: PomodoroSessionRecord,
): PomodoroSession {
  return {
    id: record.id,
    taskId: record.task || null,
    durationMinutes: record.durationMinutes,
    mode: record.mode,
    remainingSeconds: Math.max(0, Math.floor(record.remainingSeconds)),
    isActive: record.isActive,
    lastTick: record.lastTick,
  };
}

export function projectToRecord(project: Project) {
  return {
    id: project.id,
    owner: getAuthenticatedUserId(),
    title: project.title,
    description: project.description,
    isDone: project.isDone,
  };
}

export function taskToRecord(task: Task) {
  return {
    id: task.id,
    owner: getAuthenticatedUserId(),
    title: task.title,
    isDone: task.isDone,
    focusedSeconds: task.focusedSeconds,
    project: task.projectId ?? "",
  };
}

export function sessionToRecord(session: PomodoroSession) {
  return {
    id: session.id,
    owner: getAuthenticatedUserId(),
    task: session.taskId ?? "",
    durationMinutes: session.durationMinutes,
    mode: session.mode,
    remainingSeconds: session.remainingSeconds,
    isActive: session.isActive,
    lastTick: session.lastTick,
  };
}

export async function listProjects() {
  const records = await pb
    .collection(COLLECTIONS.projects)
    .getFullList<ProjectRecord>({ sort: "-created", requestKey: null });
  return records.map(projectFromRecord);
}

export async function listTasks() {
  const records = await pb
    .collection(COLLECTIONS.tasks)
    .getFullList<TaskRecord>({ sort: "-created", requestKey: null });
  return records.map(taskFromRecord);
}

export async function loadCurrentSession() {
  const result = await pb
    .collection(COLLECTIONS.sessions)
    .getList<PomodoroSessionRecord>(1, 1, {
      filter: 'mode = "running"',
      sort: "-updated",
      requestKey: null,
    });
  const record = result.items[0];
  return record ? sessionFromRecord(record) : null;
}

export async function listPomodoroHistory(): Promise<PomodoroHistoryEntry[]> {
  const records = await pb
    .collection(COLLECTIONS.sessions)
    .getFullList<PomodoroSessionRecord>({
      filter: 'mode = "complete"',
      sort: "-lastTick",
      requestKey: null,
    });

  return records.map((record) => {
    const totalSeconds = Math.max(0, record.durationMinutes * 60);
    const remainingSeconds = Math.max(
      0,
      Math.min(totalSeconds, Math.floor(record.remainingSeconds || 0)),
    );

    return {
      id: record.id,
      taskId: record.task || null,
      durationMinutes: record.durationMinutes,
      focusedSeconds: totalSeconds - remainingSeconds,
      completedAt: record.lastTick || Date.parse(record.updated),
    };
  });
}
