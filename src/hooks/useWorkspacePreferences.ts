import { useEffect, useState } from "react";
import {
  createDefaultWorkspaceState,
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
      scope:
        saved.scope === "all" ||
        saved.scope === "archived" ||
        saved.scope?.startsWith("project:")
          ? saved.scope
          : defaults.scope,
      status: ["open", "completed", "all"].includes(saved.status ?? "")
        ? saved.status!
        : defaults.status,
      sort: ["newest", "oldest", "alphabetical", "focused"].includes(
        saved.sort ?? "",
      )
        ? saved.sort!
        : defaults.sort,
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
