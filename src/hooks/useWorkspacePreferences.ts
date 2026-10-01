import { useEffect, useState } from "react";
import {
  createDefaultWorkspaceState,
  PROJECT_LIST_FILTERS,
  TASK_SORTS,
  type ProjectListFilter,
  type TaskSort,
  type WorkspaceViewState,
} from "@/lib/workspace";

const STORAGE_VERSION = "pokus-workspace-v1";

function getStorageKey(userId: string) {
  return `${STORAGE_VERSION}:${userId}`;
}

export function loadWorkspacePreferences(userId: string): WorkspaceViewState {
  const defaults = createDefaultWorkspaceState();
  try {
    const saved = JSON.parse(
      localStorage.getItem(getStorageKey(userId)) ?? "{}",
    ) as Partial<WorkspaceViewState>;
    return {
      projectFilter: PROJECT_LIST_FILTERS.includes(saved.projectFilter as ProjectListFilter)
        ? saved.projectFilter!
        : defaults.projectFilter,
      status: ["open", "completed", "all"].includes(saved.status ?? "")
        ? saved.status!
        : defaults.status,
      sort: TASK_SORTS.includes(saved.sort as TaskSort)
        ? saved.sort!
        : defaults.sort,
      priority: ["all", "none", "low", "medium", "high", "urgent"].includes(saved.priority ?? "") ? saved.priority! : defaults.priority,
      categoryId: typeof saved.categoryId === "string" ? saved.categoryId : null,
      lastDuration:
        Number.isFinite(saved.lastDuration) &&
        saved.lastDuration! >= 1 &&
        saved.lastDuration! <= 60
          ? saved.lastDuration!
          : defaults.lastDuration,
    };
  } catch {
    return defaults;
  }
}

export function useWorkspacePreferences(userId: string) {
  const [state, setState] = useState<WorkspaceViewState>(() =>
    loadWorkspacePreferences(userId),
  );

  useEffect(() => {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(state));
  }, [state, userId]);

  return [state, setState] as const;
}
