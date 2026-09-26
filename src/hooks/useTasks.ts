import { useCallback } from "react";
import { useCachedResource } from "@/hooks/useCachedResource";
import { requireConnection } from "@/hooks/useConnectivity";
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
  const { items: tasks, itemsRef: tasksRef, replace: replaceTasks, isLoading, loadError } = useCachedResource<Task>("tasks", listTasks);

  const createTask = useCallback(
    async (input: TaskInput) => {
      requireConnection();
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
    [replaceTasks, tasksRef],
  );

  const setTaskDone = useCallback(
    async (taskId: string, isDone: boolean) => {
      requireConnection();
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
    [replaceTasks, tasksRef],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      requireConnection();
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
    [replaceTasks, tasksRef],
  );

  const editTask = useCallback(
    async (taskId: string, input: TaskInput) => {
      requireConnection();
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
    [replaceTasks, tasksRef],
  );

  const reconcileDeletedProject = useCallback(
    (projectId: string) => {
      replaceTasks(
        tasksRef.current.map((task) =>
          task.projectId === projectId ? { ...task, projectId: null } : task,
        ),
      );
    },
    [replaceTasks, tasksRef],
  );

  const reconcileDeletedCategory = useCallback((categoryId: string) => {
    replaceTasks(tasksRef.current.map((task) => task.categoryId === categoryId ? { ...task, categoryId: null } : task));
  }, [replaceTasks, tasksRef]);

  return {
    tasks,
    isLoading,
    loadError,
    createTask,
    setTaskDone,
    deleteTask,
    editTask,
    reconcileDeletedProject,
    reconcileDeletedCategory,
    taskTitleMaxLength: TASK_TITLE_MAX_LENGTH,
  };
}
