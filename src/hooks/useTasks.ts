import { useCallback, useEffect, useRef, useState } from "react";
import { pb } from "@/lib/pocketbase";
import {
  COLLECTIONS,
  createPocketBaseId,
  listTasks,
  taskFromRecord,
  taskToRecord,
  type TaskRecord,
} from "@/lib/pocketbase-records";
import {
  TASK_TITLE_MAX_LENGTH,
  validateTaskTitle,
} from "@/lib/workspace";
import type { Task, TaskInput } from "@/types/task";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tasksRef = useRef<Task[]>([]);

  const replaceTasks = useCallback((nextTasks: Task[]) => {
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
  }, []);

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
    async (input: TaskInput) => {
      const normalizedTitle = input.title.replace(/\s+/g, " ").trim();
      const validationError = validateTaskTitle(input.title);
      if (validationError) throw new Error(validationError);

      const task: Task = {
        id: createPocketBaseId(),
        title: normalizedTitle,
        isDone: false,
        createdAt: Date.now(),
        focusedSeconds: 0,
        projectId: input.projectId,
        description: input.description,
        priority: input.priority,
        categoryId: input.categoryId,
      };

      try {
        const record = await pb
          .collection(COLLECTIONS.tasks)
          .create<TaskRecord>(taskToRecord(task), { requestKey: null });
        const savedTask = taskFromRecord(record);
        replaceTasks([savedTask, ...tasksRef.current]);
        return savedTask;
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
        const record = await pb
          .collection(COLLECTIONS.tasks)
          .update<TaskRecord>(taskId, { isDone }, { requestKey: null });
        const savedTask = taskFromRecord(record);
        replaceTasks(
          tasksRef.current.map((task) =>
            task.id === taskId ? savedTask : task,
          ),
        );
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
        const record = await pb
          .collection(COLLECTIONS.tasks)
          .update<TaskRecord>(
            taskId,
            { focusedSeconds },
            { requestKey: null },
          );
        const savedTask = taskFromRecord(record);
        replaceTasks(
          tasksRef.current.map((candidate) =>
            candidate.id === taskId ? savedTask : candidate,
          ),
        );
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
    async (taskId: string, input: TaskInput) => {
      const previousTask = tasksRef.current.find((task) => task.id === taskId);
      if (!previousTask) return false;
      const validationError = validateTaskTitle(input.title, previousTask.title);
      if (validationError) throw new Error(validationError);
      const titleChanged = input.title !== previousTask.title;
      const normalizedTitle = titleChanged ? input.title.replace(/\s+/g, " ").trim() : previousTask.title;
      const nextTask = { ...previousTask, ...input, title: normalizedTitle };

      replaceTasks(
        tasksRef.current.map((task) =>
          task.id === taskId
            ? nextTask
            : task,
        ),
      );
      try {
        const record = await pb
          .collection(COLLECTIONS.tasks)
          .update<TaskRecord>(
            taskId,
            {
              title: normalizedTitle,
              project: input.projectId ?? "",
              description: input.description,
              priority: input.priority,
              category: input.categoryId ?? "",
            },
            { requestKey: null },
          );
        const savedTask = taskFromRecord(record);
        replaceTasks(
          tasksRef.current.map((task) =>
            task.id === taskId ? savedTask : task,
          ),
        );
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

  const reconcileDeletedProject = useCallback(
    (projectId: string) => {
      replaceTasks(
        tasksRef.current.map((task) =>
          task.projectId === projectId ? { ...task, projectId: null } : task,
        ),
      );
    },
    [replaceTasks],
  );

  const reconcileDeletedCategory = useCallback((categoryId: string) => {
    replaceTasks(tasksRef.current.map((task) => task.categoryId === categoryId ? { ...task, categoryId: null } : task));
  }, [replaceTasks]);

  return {
    tasks,
    isLoading,
    loadError,
    createTask,
    setTaskDone,
    deleteTask,
    recordFocusTime,
    editTask,
    reconcileDeletedProject,
    reconcileDeletedCategory,
    taskTitleMaxLength: TASK_TITLE_MAX_LENGTH,
  };
}
