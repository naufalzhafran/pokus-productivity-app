import { useCallback, useEffect, useState } from "react";
import type { Task } from "@/types/task";

const TASKS_STORAGE_KEY = "pokus_tasks_v1";

function parseTask(value: unknown): Task | null {
  if (!value || typeof value !== "object") return null;

  const task = value as Partial<Task>;
  if (
    typeof task.id !== "string" ||
    typeof task.title !== "string" ||
    task.title.trim().length === 0 ||
    typeof task.isDone !== "boolean" ||
    typeof task.createdAt !== "number"
  ) {
    return null;
  }

  const storedTask = task as Partial<Task> & { focusedMinutes?: number };
  const focusedSeconds =
    typeof storedTask.focusedSeconds === "number" &&
    Number.isFinite(storedTask.focusedSeconds) &&
    storedTask.focusedSeconds >= 0
      ? Math.floor(storedTask.focusedSeconds)
      : typeof storedTask.focusedMinutes === "number" &&
          Number.isFinite(storedTask.focusedMinutes) &&
          storedTask.focusedMinutes >= 0
        ? Math.floor(storedTask.focusedMinutes * 60)
        : 0;

  return {
    id: task.id,
    title: task.title.trim(),
    isDone: task.isDone,
    createdAt: task.createdAt,
    focusedSeconds,
    projectId: typeof task.projectId === "string" ? task.projectId : null,
  };
}

function loadTasks() {
  try {
    const savedTasks = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!savedTasks) return [];

    const parsedTasks: unknown = JSON.parse(savedTasks);
    if (!Array.isArray(parsedTasks)) return [];

    return parsedTasks.reduce<Task[]>((validTasks, task) => {
      const parsedTask = parseTask(task);
      if (parsedTask) validTasks.push(parsedTask);
      return validTasks;
    }, []);
  } catch (error) {
    console.error("Failed to load tasks:", error);
    return [];
  }
}

function createTaskId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);

  useEffect(() => {
    try {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error("Failed to save tasks:", error);
    }
  }, [tasks]);

  const createTask = useCallback((title: string, projectId: string | null) => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return null;

    const task: Task = {
      id: createTaskId(),
      title: normalizedTitle,
      isDone: false,
      createdAt: Date.now(),
      focusedSeconds: 0,
      projectId,
    };

    setTasks((currentTasks) => [task, ...currentTasks]);
    return task;
  }, []);

  const setTaskDone = useCallback((taskId: string, isDone: boolean) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId ? { ...task, isDone } : task,
      ),
    );
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks((currentTasks) =>
      currentTasks.filter((task) => task.id !== taskId),
    );
  }, []);

  const recordFocusTime = useCallback((taskId: string, seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              focusedSeconds: task.focusedSeconds + Math.floor(seconds),
            }
          : task,
      ),
    );
  }, []);

  const editTask = useCallback(
    (taskId: string, title: string, projectId: string | null) => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) return;

      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === taskId
            ? { ...task, title: normalizedTitle, projectId }
            : task,
        ),
      );
    },
    [],
  );

  const removeProjectFromTasks = useCallback((projectId: string) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.projectId === projectId ? { ...task, projectId: null } : task,
      ),
    );
  }, []);

  return {
    tasks,
    createTask,
    setTaskDone,
    deleteTask,
    recordFocusTime,
    editTask,
    removeProjectFromTasks,
  };
}
