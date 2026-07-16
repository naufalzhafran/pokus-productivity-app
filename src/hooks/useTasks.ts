import { useCallback, useEffect, useRef, useState } from "react";
import { pb } from "@/lib/pocketbase";
import {
  COLLECTIONS,
  createPocketBaseId,
  listTasks,
  taskToRecord,
} from "@/lib/pocketbase-records";
import type { Task } from "@/types/task";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tasksRef = useRef<Task[]>([]);

  const replaceTasks = useCallback((nextTasks: Task[]) => {
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      replaceTasks(await listTasks());
      setLoadError(null);
    } catch (error) {
      console.error("Failed to load tasks from PocketBase:", error);
      setLoadError("Your tasks could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [replaceTasks]);

  useEffect(() => {
    let isMounted = true;

    void listTasks()
      .then((savedTasks) => {
        if (isMounted) {
          replaceTasks(savedTasks);
          setLoadError(null);
        }
      })
      .catch((error) => {
        console.error("Failed to load tasks from PocketBase:", error);
        if (isMounted) setLoadError("Your tasks could not be loaded.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [replaceTasks]);

  const createTask = useCallback(
    async (title: string, projectId: string | null) => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) return null;

      const task: Task = {
        id: createPocketBaseId(),
        title: normalizedTitle,
        isDone: false,
        createdAt: Date.now(),
        focusedSeconds: 0,
        projectId,
      };

      try {
        await pb
        .collection(COLLECTIONS.tasks)
          .create(taskToRecord(task), { requestKey: null });
        replaceTasks([task, ...tasksRef.current]);
        return task;
      } catch (error) {
        console.error("Failed to create task in PocketBase:", error);
        throw error;
      }
    },
    [replaceTasks],
  );

  const setTaskDone = useCallback(
    async (taskId: string, isDone: boolean) => {
      const previousTask = tasksRef.current.find((task) => task.id === taskId);
      if (!previousTask) return false;

      replaceTasks(
        tasksRef.current.map((task) =>
          task.id === taskId ? { ...task, isDone } : task,
        ),
      );
      try {
        await pb.collection(COLLECTIONS.tasks).update(taskId, { isDone });
        return true;
      } catch (error) {
        replaceTasks(
          tasksRef.current.map((task) =>
            task.id === taskId ? previousTask : task,
          ),
        );
        console.error("Failed to update task in PocketBase:", error);
        throw error;
      }
    },
    [replaceTasks],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      const deletedTask = tasksRef.current.find((task) => task.id === taskId);
      if (!deletedTask) return false;

      replaceTasks(tasksRef.current.filter((task) => task.id !== taskId));
      try {
        await pb.collection(COLLECTIONS.tasks).delete(taskId);
        return true;
      } catch (error) {
        replaceTasks(
          [deletedTask, ...tasksRef.current].sort(
            (a, b) => b.createdAt - a.createdAt,
          ),
        );
        console.error("Failed to delete task from PocketBase:", error);
        throw error;
      }
    },
    [replaceTasks],
  );

  const recordFocusTime = useCallback(
    async (taskId: string, seconds: number) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return false;

      const task = tasksRef.current.find((candidate) => candidate.id === taskId);
      if (!task) return false;

      const focusedSeconds = task.focusedSeconds + Math.floor(seconds);
      replaceTasks(
        tasksRef.current.map((candidate) =>
          candidate.id === taskId
            ? { ...candidate, focusedSeconds }
            : candidate,
        ),
      );
      try {
        await pb
          .collection(COLLECTIONS.tasks)
          .update(taskId, { focusedSeconds });
        return true;
      } catch (error) {
        replaceTasks(
          tasksRef.current.map((candidate) =>
            candidate.id === taskId ? task : candidate,
          ),
        );
        console.error("Failed to save focused time to PocketBase:", error);
        throw error;
      }
    },
    [replaceTasks],
  );

  const editTask = useCallback(
    async (taskId: string, title: string, projectId: string | null) => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) return false;
      const previousTask = tasksRef.current.find((task) => task.id === taskId);
      if (!previousTask) return false;

      replaceTasks(
        tasksRef.current.map((task) =>
          task.id === taskId
            ? { ...task, title: normalizedTitle, projectId }
            : task,
        ),
      );
      try {
        await pb.collection(COLLECTIONS.tasks).update(taskId, {
          title: normalizedTitle,
          project: projectId ?? "",
        });
        return true;
      } catch (error) {
        replaceTasks(
          tasksRef.current.map((task) =>
            task.id === taskId ? previousTask : task,
          ),
        );
        console.error("Failed to edit task in PocketBase:", error);
        throw error;
      }
    },
    [replaceTasks],
  );

  const removeProjectFromTasks = useCallback(
    async (projectId: string) => {
      const affectedTaskIds = tasksRef.current
        .filter((task) => task.projectId === projectId)
        .map((task) => task.id);

      replaceTasks(
        tasksRef.current.map((task) =>
          task.projectId === projectId ? { ...task, projectId: null } : task,
        ),
      );

      try {
        await Promise.all(
          affectedTaskIds.map((taskId) =>
            pb.collection(COLLECTIONS.tasks).update(taskId, { project: "" }),
          ),
        );
        return true;
      } catch (error) {
        console.error("Failed to remove project from tasks in PocketBase:", error);
        await refreshTasks();
        throw error;
      }
    },
    [refreshTasks, replaceTasks],
  );

  return {
    tasks,
    isLoading,
    loadError,
    createTask,
    setTaskDone,
    deleteTask,
    recordFocusTime,
    editTask,
    removeProjectFromTasks,
  };
}
