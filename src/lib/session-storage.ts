import type { PomodoroSession } from "@/types/task";

const SESSION_STORAGE_KEY = "pokus_session_v1";
const SELECTED_TASK_STORAGE_KEY = "pokus_selected_task_v1";

function isPomodoroSession(value: unknown): value is PomodoroSession {
  if (!value || typeof value !== "object") return false;

  const session = value as Partial<PomodoroSession>;
  return (
    typeof session.id === "string" &&
    (typeof session.taskId === "string" || session.taskId === null) &&
    typeof session.durationMinutes === "number" &&
    session.durationMinutes >= 1 &&
    (session.mode === "running" || session.mode === "complete")
  );
}

export function loadSession() {
  try {
    const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!savedSession) return null;

    const parsedSession: unknown = JSON.parse(savedSession);
    return isPomodoroSession(parsedSession) ? parsedSession : null;
  } catch (error) {
    console.error("Failed to load Pomodoro session:", error);
    return null;
  }
}

export function saveSession(session: PomodoroSession | null) {
  try {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (error) {
    console.error("Failed to save Pomodoro session:", error);
  }
}

export function loadSelectedTaskId() {
  try {
    return localStorage.getItem(SELECTED_TASK_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to load the selected task:", error);
    return null;
  }
}

export function saveSelectedTaskId(taskId: string | null) {
  try {
    if (taskId) {
      localStorage.setItem(SELECTED_TASK_STORAGE_KEY, taskId);
    } else {
      localStorage.removeItem(SELECTED_TASK_STORAGE_KEY);
    }
  } catch (error) {
    console.error("Failed to save the selected task:", error);
  }
}

export function removeTimerState(sessionId: string) {
  try {
    localStorage.removeItem(`pokus_timer_${sessionId}`);
  } catch (error) {
    console.error("Failed to clear the timer state:", error);
  }
}
